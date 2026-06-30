import { XMLParser } from 'fast-xml-parser';
import { ILyricsParser, LyricsDocument, LyricsMetadata, LyricsLine, LyricsWord, LyricsTransliteration, ParserOptions } from '../models/types';
import { timeStrToMs } from '../utils/time';

function ttmlTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  // Handle 'mm:ss.xxx' or 'ss.xxx'
  const parts = timeStr.split(':');
  if (parts.length === 1) {
    // Just seconds.milliseconds (e.g., 44.851)
    return parseFloat(parts[0]) * 1000;
  } else {
    // mm:ss.xxx (e.g., 1:21.213)
    return timeStrToMs(timeStr);
  }
}

export class TTMLParser implements ILyricsParser {
  public parse(content: string, options?: ParserOptions): LyricsDocument {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      isArray: (name) => { 
        return ['p', 'span', 'ttm:agent', 'songwriter', 'div', 'transliteration', 'text'].indexOf(name) !== -1;
      }
    });

    const parsedObj = parser.parse(content);
    const tt = parsedObj.tt || {};

    const metadata: LyricsMetadata = {
      artists: [],
      songwriters: [],
      attributes: {},
      agents: {}
    };

    // Extract attributes from root <tt>
    for (const key in tt) {
      if (key.startsWith('@_')) {
        metadata.attributes![key.substring(2)] = tt[key];
      }
    }

    const rawTransliterations: Record<string, { lang: string, textObj: any }[]> = {};

    // Extract metadata from <head><metadata>
    const headMeta = tt.head?.metadata;
    if (headMeta) {
      // Agents
      if (headMeta['ttm:agent']) {
        const agents = headMeta['ttm:agent'];
        for (const agent of agents) {
          const id = agent['@_xml:id'];
          const type = agent['@_type'];
          const name = agent['ttm:name'] ? agent['ttm:name']['#text'] || agent['ttm:name'] : id;
          if (id) {
            metadata.agents![id] = { name: name || id, type };
          }
        }
      }

      // iTunesMetadata attributes
      const itunesMeta = headMeta.iTunesMetadata;
      if (itunesMeta) {
        for (const key in itunesMeta) {
          if (key.startsWith('@_')) {
             metadata.attributes!['itunes:' + key.substring(2)] = itunesMeta[key];
          }
        }
        if (itunesMeta.songwriters && itunesMeta.songwriters.songwriter) {
           metadata.songwriters = itunesMeta.songwriters.songwriter.map((sw: any) => 
             sw['#text'] || sw
           );
        }
      }

      // Transliterations
      const transMeta = headMeta.transliterations;
      if (transMeta && transMeta.transliteration) {
          for (const trans of transMeta.transliteration) {
              const lang = trans['@_xml:lang'] || "unknown";
              if (trans.text) {
                  for (const t of trans.text) {
                      const key = t['@_for'];
                      if (key) {
                          if (!rawTransliterations[key]) rawTransliterations[key] = [];
                          rawTransliterations[key].push({ lang, textObj: t });
                      }
                  }
              }
          }
      }
    }

    const parsedLines: LyricsLine[] = [];

    // Helper to recursively process spans
    const processSpan = (
        spanNode: any, 
        currentBg: boolean, 
        lineStartMs: number, 
        outWords: LyricsWord[], 
        context: { fullText: string, hasBg: boolean }
    ) => {
        const isBg = currentBg || spanNode['@_ttm:role'] === 'x-bg';
        
        if (spanNode['#text']) {
            const wordStart = spanNode['@_begin'] ? ttmlTimeToMs(spanNode['@_begin']) : undefined;
            const wordEnd = spanNode['@_end'] ? ttmlTimeToMs(spanNode['@_end']) : undefined;
            
            const wordObj: LyricsWord = {
               text: spanNode['#text'],
               startTime: wordStart || lineStartMs,
            };

            if (wordEnd !== undefined) {
                wordObj.endTime = wordEnd;
            }

            if (isBg) {
                wordObj.isBackground = true;
                context.hasBg = true;
            }

            outWords.push(wordObj);
            context.fullText += spanNode['#text'] + " ";
        }

        if (spanNode.span) {
            const nestedSpans = Array.isArray(spanNode.span) ? spanNode.span : [spanNode.span];
            for (const nested of nestedSpans) {
                processSpan(nested, isBg, lineStartMs, outWords, context);
            }
        }
    };

    // Extract body divs and paragraphs
    const body = tt.body;
    let divs = body?.div || [];
    // If there's no div, wrap p in a fake div just to simplify loop
    if (!body?.div && body?.p) {
       divs = [{ p: body.p }];
    }

    for (const div of divs) {
       const part = div['@_itunes:song-part'];
       const ps = div.p || [];

       for (const p of ps) {
          const lineStart = ttmlTimeToMs(p['@_begin']);
          const lineEnd = ttmlTimeToMs(p['@_end']);
          const agentId = p['@_ttm:agent'];
          const lineKey = p['@_itunes:key'];

          const lineObj: LyricsLine = {
             startTime: lineStart,
             endTime: lineEnd,
             agentId: agentId,
             text: "",
             words: []
          };

          if (lineKey) lineObj.key = lineKey;
          if (part) lineObj.part = part;

          const context = { fullText: "", hasBg: false };

          // Handle spans (words)
          if (p.span && Array.isArray(p.span)) {
             for (const span of p.span) {
                 processSpan(span, false, lineStart, lineObj.words!, context);
             }
          } else if (!p.span) {
             // If no spans, just grab text
             context.fullText = p['#text'] || p || "";
          }

          lineObj.text = context.fullText.trim();
          if (context.hasBg) lineObj.isBackground = true;
          if (lineObj.words?.length === 0) delete lineObj.words;

          // Check for transliterations for this line
          if (lineKey && rawTransliterations[lineKey]) {
             lineObj.transliterations = [];
             for (const rt of rawTransliterations[lineKey]) {
                const transObj: LyricsTransliteration = { lang: rt.lang, text: "", words: [] };
                const tContext = { fullText: "", hasBg: false };
                
                // the <text> node might contain spans directly
                if (rt.textObj.span && Array.isArray(rt.textObj.span)) {
                    for (const span of rt.textObj.span) {
                        processSpan(span, false, lineStart, transObj.words!, tContext);
                    }
                } else if (!rt.textObj.span) {
                    tContext.fullText = rt.textObj['#text'] || rt.textObj || "";
                }

                transObj.text = tContext.fullText.trim();
                if (transObj.words?.length === 0) delete transObj.words;
                lineObj.transliterations.push(transObj);
             }
          }

          parsedLines.push(lineObj);
       }
    }

    parsedLines.sort((a, b) => a.startTime - b.startTime);

    return {
      metadata,
      lines: parsedLines
    };
  }
}
