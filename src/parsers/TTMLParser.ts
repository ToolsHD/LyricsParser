import { DOMParser } from '@xmldom/xmldom';
import { ILyricsParser, LyricsDocument, LyricsMetadata, LyricsLine, LyricsWord, LyricsTransliteration, LyricsTranslation, ParserOptions } from '../models/types';
import { timeStrToMs } from '../utils/time';
import he from 'he';

function ttmlTimeToMs(timeStr: string | null): number {
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
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/xml');
    
    const metadata: LyricsMetadata = {
      artists: [],
      songwriters: [],
      attributes: {},
      agents: {}
    };

    const tt = doc.getElementsByTagName('tt')[0];
    if (tt) {
      for (let i = 0; i < tt.attributes.length; i++) {
        const attr = tt.attributes[i];
        const attrName = attr.name.replace('xmlns:', '');
        metadata.attributes![attrName] = attr.value;
        
        if (attrName === 'xml:lang') {
            const langCode = attr.value.toLowerCase().substring(0, 2);
            const rtlLangs = ['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'ku', 'sd', 'ug', 'yi', 'ji', 'dv'];
            
            if (rtlLangs.includes(langCode)) {
                metadata.isRTL = true;
            }
        }
      }
    }

    const agents = doc.getElementsByTagName('ttm:agent');
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const id = agent.getAttribute('xml:id');
      const type = agent.getAttribute('type');
      const nameNode = agent.getElementsByTagName('ttm:name')[0];
      const name = nameNode ? nameNode.textContent : id;
      if (id) {
        metadata.agents![id] = { name: name || id, type: type || undefined };
      }
    }
    
    const songwritersNode = doc.getElementsByTagName('songwriters')[0];
    if (songwritersNode) {
       const sws = songwritersNode.getElementsByTagName('songwriter');
       for (let i = 0; i < sws.length; i++) {
         if (sws[i].textContent) {
             metadata.songwriters!.push(sws[i].textContent!);
         }
       }
    }

    const amllMetas = doc.getElementsByTagName('amll:meta');
    for (let i = 0; i < amllMetas.length; i++) {
      const meta = amllMetas[i];
      const key = meta.getAttribute('key');
      const value = meta.getAttribute('value');
      if (key && value) {
        if (key === 'musicName') metadata.title = value;
        else if (key === 'artists') metadata.artists!.push(value);
        else if (key === 'album') metadata.album = value;
        else metadata.attributes![key] = value;
      }
    }

    const bodyNodes = doc.getElementsByTagName('body');
    if (bodyNodes.length > 0) {
        const bodyDur = bodyNodes[0].getAttribute('dur');
        if (bodyDur) {
            metadata.duration = bodyDur;
        }
    }

    // Transliterations
    const rawTransliterations: Record<string, { lang: string, textNode: any }[]> = {};
    const transElements = doc.getElementsByTagName('transliteration');
    for (let i = 0; i < transElements.length; i++) {
        const trans = transElements[i];
        const lang = trans.getAttribute('xml:lang') || 'unknown';
        const textElements = trans.getElementsByTagName('text');
        for (let j = 0; j < textElements.length; j++) {
            const t = textElements[j];
            const key = t.getAttribute('for');
            if (key) {
                if (!rawTransliterations[key]) rawTransliterations[key] = [];
                rawTransliterations[key].push({ lang, textNode: t });
            }
        }
    }

    // Translations (Sidecar)
    const rawTranslations: Record<string, { lang: string, type: string, textNode: any }[]> = {};
    const translationElements = doc.getElementsByTagName('translation');
    for (let i = 0; i < translationElements.length; i++) {
        const trans = translationElements[i];
        const lang = trans.getAttribute('xml:lang') || 'unknown';
        const type = trans.getAttribute('type') || 'subtitle';
        const textElements = trans.getElementsByTagName('text');
        for (let j = 0; j < textElements.length; j++) {
            const t = textElements[j];
            const key = t.getAttribute('for');
            if (key) {
                if (!rawTranslations[key]) rawTranslations[key] = [];
                rawTranslations[key].push({ lang, type, textNode: t });
            }
        }
    }

    const parsedLines: LyricsLine[] = [];

    // Process span tree exactly preserving whitespace natively
    const processSpans = (element: any, isBackground: boolean, defaultStartMs: number) => {
      const words: LyricsWord[] = [];
      let fullText = "";
      let hasBg = false;
      let lastWasSpace = true;
      const inlineTransliterations: LyricsTransliteration[] = [];
      const inlineTranslations: LyricsTranslation[] = [];

      const collect = (node: Node, currentBg: boolean) => {
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          
          if (child.nodeType === 3) { // TEXT_NODE
             const text = he.decode(child.nodeValue || "");
             fullText += text;
             if (text.length > 0) {
                 lastWasSpace = /\s$/.test(text);
             }
          } 
          else if (child.nodeType === 1) { // ELEMENT_NODE
             const el = child as any;
             if (el.tagName === 'span') {
                const role = el.getAttribute('ttm:role');
                if (role === 'x-translation' || role === 'x-roman') {
                    const lang = el.getAttribute('xml:lang') || 'unknown';
                    const extracted = processSpans(el, currentBg, defaultStartMs);
                    if (role === 'x-translation') {
                        inlineTranslations.push({ lang, text: extracted.fullText.replace(/\s+/g, ' ').trim(), words: extracted.words.length ? extracted.words : undefined });
                    } else {
                        inlineTransliterations.push({ lang, text: extracted.fullText.replace(/\s+/g, ' ').trim(), words: extracted.words.length ? extracted.words : undefined });
                    }
                    continue; 
                }

                const rubyAttr = el.getAttribute('tts:ruby');
                if (rubyAttr === 'container') {
                    let rubyStr = "";
                    const spans = el.getElementsByTagName('span');
                    for (let r = 0; r < spans.length; r++) {
                         if (spans[r].getAttribute('tts:ruby') === 'text') {
                             rubyStr += he.decode(spans[r].textContent || "");
                         }
                    }
                    
                    for (let c = 0; c < el.childNodes.length; c++) {
                        const rChild = el.childNodes[c] as any;
                        if (rChild.nodeType === 1 && rChild.tagName === 'span' && rChild.getAttribute('tts:ruby') === 'base') {
                            const prevWordsLength = words.length;
                            collect(rChild, currentBg);
                            if (rubyStr && words.length > prevWordsLength) {
                                words[prevWordsLength].ruby = rubyStr;
                            }
                        }
                    }
                    continue;
                }
                
                if (rubyAttr === 'textContainer' || rubyAttr === 'text' || rubyAttr === 'base') {
                    if (rubyAttr === 'base') collect(el, currentBg);
                    continue;
                }

                const isBg = currentBg || role === 'x-bg';
                const begin = el.getAttribute('begin');
                const end = el.getAttribute('end');
                
                if (begin) {
                   const wordText = he.decode(el.textContent || "");
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
                   collect(el, isBg);
                }
             }
          }
        }
      };

      collect(element, isBackground);
      
      return { words, fullText, hasBg, inlineTransliterations, inlineTranslations };
    };

    const paragraphs = doc.getElementsByTagName('p');
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const begin = p.getAttribute('begin');
      const end = p.getAttribute('end');
      const agentId = p.getAttribute('ttm:agent');
      const lineKey = p.getAttribute('itunes:key');
      const part = p.parentNode && p.parentNode.nodeName === 'div' ? ((p.parentNode as any).getAttribute('itunes:song-part') || (p.parentNode as any).getAttribute('itunes:songPart')) : null;
      const obscene = p.getAttribute('amll:obscene') === 'true';
      const emptyBeat = p.getAttribute('amll:empty-beat') === 'true';

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

      // Handle transliterations
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

      // Handle translations
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
