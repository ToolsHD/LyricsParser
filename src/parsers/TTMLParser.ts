import { XMLParser } from 'fast-xml-parser';
import { ILyricsParser, LyricsDocument, LyricsMetadata, LyricsLine, LyricsWord, LyricsTransliteration, LyricsTranslation, ParserOptions } from '../models/types';
import { timeStrToMs } from '../utils/time';
import he from 'he';

function ttmlTimeToMs(timeStr: string | null | undefined): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 1) {
    return parseFloat(parts[0]) * 1000;
  } else {
    return timeStrToMs(timeStr);
  }
}

export class TTMLParser implements ILyricsParser {
  public parse(content: string, options?: ParserOptions): LyricsDocument {
    const parser = new XMLParser({
        ignoreAttributes: false,
        preserveOrder: true,
        attributeNamePrefix: "@_",
        allowBooleanAttributes: true,
        trimValues: false
    });

    const doc = parser.parse(content);
    
    const metadata: LyricsMetadata = {
      artists: [],
      songwriters: [],
      attributes: {},
      agents: {}
    };

    function findNodes(nodes: any[], tagName: string): any[] {
        let found: any[] = [];
        if (!Array.isArray(nodes)) return found;
        for (const node of nodes) {
            if (typeof node === 'object') {
                for (const key in node) {
                    if (key === tagName) {
                        found.push(node);
                    }
                    if (key !== ':@' && key !== '#text' && Array.isArray(node[key])) {
                        found = found.concat(findNodes(node[key], tagName));
                    }
                }
            }
        }
        return found;
    }

    const ttNodes = findNodes(doc, 'tt');
    if (ttNodes.length > 0) {
        const ttAttr = ttNodes[0][':@'];
        if (ttAttr) {
            for (const k in ttAttr) {
                const attrName = k.replace('@_', '').replace('xmlns:', '');
                const attrValue = ttAttr[k];
                metadata.attributes![attrName] = attrValue;
                
                if (attrName === 'xml:lang') {
                    const langCode = attrValue.toLowerCase().substring(0, 2);
                    const rtlLangs = ['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'ku', 'sd', 'ug', 'yi', 'ji', 'dv'];
                    if (rtlLangs.includes(langCode)) {
                        metadata.isRTL = true;
                    }
                }
            }
        }
    }

    const agentNodes = findNodes(doc, 'ttm:agent');
    for (const agent of agentNodes) {
        const attr = agent[':@'] || {};
        const id = attr['@_xml:id'];
        const type = attr['@_type'];
        
        const nameNodes = findNodes([agent], 'ttm:name');
        let name = id;
        if (nameNodes.length > 0 && nameNodes[0]['ttm:name'] && nameNodes[0]['ttm:name'].length > 0) {
            const textNode = nameNodes[0]['ttm:name'].find((n: any) => n['#text'] !== undefined);
            if (textNode) name = textNode['#text'];
        }
        
        if (id) {
            metadata.agents![id] = { name: name || id, type: type || undefined };
        }
    }

    const songwriterNodes = findNodes(doc, 'songwriter');
    for (const sw of songwriterNodes) {
        const textNode = sw['songwriter'].find((n: any) => n['#text'] !== undefined);
        if (textNode && textNode['#text']) {
            metadata.songwriters!.push(textNode['#text']);
        }
    }

    const amllMetas = findNodes(doc, 'amll:meta');
    for (const meta of amllMetas) {
        const attr = meta[':@'] || {};
        const key = attr['@_key'];
        const value = attr['@_value'];
        if (key && value) {
            if (key === 'musicName') metadata.title = value;
            else if (key === 'artists') metadata.artists!.push(value);
            else if (key === 'album') metadata.album = value;
            else metadata.attributes![key] = value;
        }
    }

    const bodyNodes = findNodes(doc, 'body');
    if (bodyNodes.length > 0) {
        const bodyAttr = bodyNodes[0][':@'] || {};
        const bodyDur = bodyAttr['@_dur'];
        if (bodyDur) {
            metadata.duration = bodyDur;
        }
    }

    // Transliterations
    const rawTransliterations: Record<string, { lang: string, textNode: any }[]> = {};
    const transElements = findNodes(doc, 'transliteration');
    for (const trans of transElements) {
        const attr = trans[':@'] || {};
        const lang = attr['@_xml:lang'] || 'unknown';
        const textElements = findNodes([trans], 'text');
        for (const t of textElements) {
            const tAttr = t[':@'] || {};
            const key = tAttr['@_for'];
            if (key) {
                if (!rawTransliterations[key]) rawTransliterations[key] = [];
                rawTransliterations[key].push({ lang, textNode: t });
            }
        }
    }

    // Translations
    const rawTranslations: Record<string, { lang: string, type: string, textNode: any }[]> = {};
    const translationElements = findNodes(doc, 'translation');
    for (const trans of translationElements) {
        const attr = trans[':@'] || {};
        const lang = attr['@_xml:lang'] || 'unknown';
        const type = attr['@_type'] || 'subtitle';
        const textElements = findNodes([trans], 'text');
        for (const t of textElements) {
            const tAttr = t[':@'] || {};
            const key = tAttr['@_for'];
            if (key) {
                if (!rawTranslations[key]) rawTranslations[key] = [];
                rawTranslations[key].push({ lang, type, textNode: t });
            }
        }
    }

    const parsedLines: LyricsLine[] = [];

    const processSpans = (elementNode: any, isBackground: boolean, defaultStartMs: number) => {
        const words: LyricsWord[] = [];
        let fullText = "";
        let hasBg = false;
        let lastWasSpace = true;
        const inlineTransliterations: LyricsTransliteration[] = [];
        const inlineTranslations: LyricsTranslation[] = [];

        const collect = (nodes: any[], currentBg: boolean) => {
            if (!Array.isArray(nodes)) return;
            for (const child of nodes) {
                if (child['#text'] !== undefined) {
                    const text = he.decode(child['#text'] || "");
                    fullText += text;
                    if (text.length > 0) {
                        lastWasSpace = /\s$/.test(text);
                    }
                } else {
                    const tagName = Object.keys(child).find(k => k !== ':@');
                    if (tagName === 'span') {
                        const el = child;
                        const attr = el[':@'] || {};
                        const role = attr['@_ttm:role'];
                        
                        if (role === 'x-translation' || role === 'x-roman') {
                            const lang = attr['@_xml:lang'] || 'unknown';
                            const extracted = processSpans(el, currentBg, defaultStartMs);
                            if (role === 'x-translation') {
                                inlineTranslations.push({ lang, text: extracted.fullText.replace(/\s+/g, ' ').trim(), words: extracted.words.length ? extracted.words : undefined });
                            } else {
                                inlineTransliterations.push({ lang, text: extracted.fullText.replace(/\s+/g, ' ').trim(), words: extracted.words.length ? extracted.words : undefined });
                            }
                            continue;
                        }

                        const rubyAttr = attr['@_tts:ruby'];
                        if (rubyAttr === 'container') {
                            let rubyStr = "";
                            const spans = findNodes([el], 'span');
                            for (const s of spans) {
                                if ((s[':@'] || {})['@_tts:ruby'] === 'text') {
                                    const textNodes = findNodes([s], '#text');
                                    for (const tn of textNodes) {
                                        rubyStr += he.decode(tn['#text'] || "");
                                    }
                                }
                            }
                            
                            const children = el['span'];
                            if (Array.isArray(children)) {
                                for (const rChild of children) {
                                    const cTagName = Object.keys(rChild).find(k => k !== ':@');
                                    if (cTagName === 'span' && (rChild[':@'] || {})['@_tts:ruby'] === 'base') {
                                        const prevWordsLength = words.length;
                                        collect(rChild['span'], currentBg);
                                        if (rubyStr && words.length > prevWordsLength) {
                                            words[prevWordsLength].ruby = rubyStr;
                                        }
                                    }
                                }
                            }
                            continue;
                        }

                        if (rubyAttr === 'textContainer' || rubyAttr === 'text' || rubyAttr === 'base') {
                            if (rubyAttr === 'base') collect(el['span'], currentBg);
                            continue;
                        }

                        const isBg = currentBg || role === 'x-bg';
                        const begin = attr['@_begin'];
                        const end = attr['@_end'];

                        if (begin) {
                            let wordText = "";
                            const textNodes = findNodes([el], '#text');
                            for (const tn of textNodes) {
                                wordText += he.decode(tn['#text'] || "");
                            }
                            
                            const word: LyricsWord = {
                                text: wordText,
                                startTime: ttmlTimeToMs(begin)
                            };
                            if (end) word.endTime = ttmlTimeToMs(end);
                            if (isBg) {
                                word.isBackground = true;
                                hasBg = true;
                            }

                            const startsWithSpace = /^\s/.test(wordText);
                            if (!lastWasSpace && !startsWithSpace && words.length > 0) {
                                word.isSyllable = true;
                                words[words.length - 1].isSyllable = true;
                            }

                            words.push(word);
                            fullText += wordText;
                            if (wordText.length > 0) {
                                lastWasSpace = /\s$/.test(wordText);
                            }
                        } else {
                            collect(el['span'], isBg);
                        }
                    }
                }
            }
        };
        
        const tagName = Object.keys(elementNode).find(k => k !== ':@');
        if (tagName) {
             collect(elementNode[tagName], isBackground);
        }

        return { words, fullText, hasBg, inlineTransliterations, inlineTranslations };
    };

    const findParagraphsWithParentDiv = (nodes: any[], parentDiv: any = null): { p: any, div: any }[] => {
        let results: { p: any, div: any }[] = [];
        if (!Array.isArray(nodes)) return results;
        for (const node of nodes) {
            if (typeof node === 'object') {
                for (const key in node) {
                    if (key === 'div') {
                        results = results.concat(findParagraphsWithParentDiv(node[key], node));
                    } else if (key === 'p') {
                        results.push({ p: node, div: parentDiv });
                    } else if (key !== ':@' && key !== '#text' && Array.isArray(node[key])) {
                        results = results.concat(findParagraphsWithParentDiv(node[key], parentDiv));
                    }
                }
            }
        }
        return results;
    };

    const paragraphs = findParagraphsWithParentDiv(doc);
    for (const { p, div } of paragraphs) {
        const attr = p[':@'] || {};
        const begin = attr['@_begin'];
        const end = attr['@_end'];
        const agentId = attr['@_ttm:agent'];
        const lineKey = attr['@_itunes:key'];
        
        let part = null;
        if (div && div[':@']) {
            part = div[':@']['@_itunes:song-part'] || div[':@']['@_itunes:songPart'];
        }

        const obscene = attr['@_amll:obscene'] === 'true' || attr['@_amll:obscene'] === true;
        const emptyBeat = attr['@_amll:empty-beat'] === 'true' || attr['@_amll:empty-beat'] === true;

        const lineStart = ttmlTimeToMs(begin);
        const res = processSpans(p, false, lineStart);
        
        const lineObj: LyricsLine = {
            startTime: lineStart,
            endTime: ttmlTimeToMs(end) || undefined,
            agentId: agentId || undefined,
            text: res.fullText.replace(/\s+/g, ' ').trim(), 
        };

        if (res.words.length === 0 && lineObj.endTime && lineObj.text.length > 0) {
            lineObj.words = [{
                text: lineObj.text,
                startTime: lineObj.startTime,
                endTime: lineObj.endTime
            }];
        } else if (res.words.length > 0) {
            lineObj.words = res.words;
        }
        
        if (lineKey) lineObj.key = lineKey;
        if (part) lineObj.part = part;
        if (res.hasBg) lineObj.isBackground = true;
        if (obscene) lineObj.isObscene = true;
        if (emptyBeat) lineObj.isEmptyBeat = true;

        // Transliterations
        if (lineKey && rawTransliterations[lineKey]) {
            lineObj.transliterations = lineObj.transliterations || [];
            for (const rt of rawTransliterations[lineKey]) {
                const tRes = processSpans(rt.textNode, false, lineStart);
                const transObj: LyricsTransliteration = {
                    lang: rt.lang,
                    text: tRes.fullText.replace(/\s+/g, ' ').trim()
                };
                if (tRes.words.length > 0) transObj.words = tRes.words;
                lineObj.transliterations.push(transObj);
            }
        }
        if (res.inlineTransliterations.length > 0) {
            lineObj.transliterations = lineObj.transliterations || [];
            lineObj.transliterations.push(...res.inlineTransliterations);
        }

        // Translations
        if (lineKey && rawTranslations[lineKey]) {
            lineObj.translations = lineObj.translations || [];
            for (const rt of rawTranslations[lineKey]) {
                const tRes = processSpans(rt.textNode, false, lineStart);
                const transObj: LyricsTranslation = {
                    lang: rt.lang,
                    type: rt.type,
                    text: tRes.fullText.replace(/\s+/g, ' ').trim()
                };
                if (tRes.words.length > 0) transObj.words = tRes.words;
                lineObj.translations.push(transObj);
            }
        }
        if (res.inlineTranslations.length > 0) {
            lineObj.translations = lineObj.translations || [];
            lineObj.translations.push(...res.inlineTranslations);
        }

        parsedLines.push(lineObj);
    }

    parsedLines.sort((a, b) => a.startTime - b.startTime);

    return {
        metadata,
        lines: parsedLines
    };
  }
}
