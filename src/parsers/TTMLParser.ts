import { DOMParser } from '@xmldom/xmldom';
import { ILyricsParser, LyricsDocument, LyricsMetadata, LyricsLine, LyricsWord, LyricsTransliteration, ParserOptions } from '../models/types';
import { timeStrToMs } from '../utils/time';

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
        metadata.attributes![attr.name.replace('xmlns:', '')] = attr.value;
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

    // Transliterations
    const rawTransliterations: Record<string, { lang: string, textNode: Element }[]> = {};
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

    const parsedLines: LyricsLine[] = [];

    // Process span tree exactly preserving whitespace natively
    const processSpans = (element: Element, isBackground: boolean, defaultStartMs: number) => {
      const words: LyricsWord[] = [];
      let fullText = "";
      let hasBg = false;

      const collect = (node: Node, currentBg: boolean) => {
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          
          if (child.nodeType === 3) { // TEXT_NODE
             fullText += child.nodeValue || "";
          } 
          else if (child.nodeType === 1) { // ELEMENT_NODE
             const el = child as Element;
             if (el.tagName === 'span') {
                const isBg = currentBg || el.getAttribute('ttm:role') === 'x-bg';
                const begin = el.getAttribute('begin');
                const end = el.getAttribute('end');
                
                // If the span has a begin time, it's a timed word
                if (begin) {
                   const wordText = el.textContent || "";
                   const word: LyricsWord = {
                      text: wordText,
                      startTime: ttmlTimeToMs(begin)
                   };
                   if (end) word.endTime = ttmlTimeToMs(end);
                   if (isBg) {
                       word.isBackground = true;
                       hasBg = true;
                   }
                   words.push(word);
                   fullText += wordText; // Append the text of this timed span
                } else {
                   // Wrapper span (like for x-bg)
                   collect(el, isBg);
                }
             }
          }
        }
      };

      collect(element, isBackground);
      
      return { words, fullText, hasBg };
    };

    const paragraphs = doc.getElementsByTagName('p');
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const begin = p.getAttribute('begin');
      const end = p.getAttribute('end');
      const agentId = p.getAttribute('ttm:agent');
      const lineKey = p.getAttribute('itunes:key');
      const part = p.parentNode && p.parentNode.nodeName === 'div' ? (p.parentNode as Element).getAttribute('itunes:song-part') : null;

      const lineStart = ttmlTimeToMs(begin);
      const res = processSpans(p, false, lineStart);
      
      const lineObj: LyricsLine = {
         startTime: lineStart,
         endTime: ttmlTimeToMs(end) || undefined,
         agentId: agentId || undefined,
         text: res.fullText.trim(), // The final line text is trimmed, but internal word spacing is perfectly preserved
      };

      if (res.words.length > 0) lineObj.words = res.words;
      if (lineKey) lineObj.key = lineKey;
      if (part) lineObj.part = part;
      if (res.hasBg) lineObj.isBackground = true;

      // Handle transliterations
      if (lineKey && rawTransliterations[lineKey]) {
          lineObj.transliterations = [];
          for (const rt of rawTransliterations[lineKey]) {
              const tRes = processSpans(rt.textNode, false, lineStart);
              const transObj: LyricsTransliteration = {
                  lang: rt.lang,
                  text: tRes.fullText.trim()
              };
              if (tRes.words.length > 0) transObj.words = tRes.words;
              lineObj.transliterations.push(transObj);
          }
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
