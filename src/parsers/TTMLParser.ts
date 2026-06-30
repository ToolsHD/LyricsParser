import { XMLParser } from 'fast-xml-parser';
import { ILyricsParser, LyricsDocument, LyricsMetadata, LyricsLine, LyricsWord, ParserOptions } from '../models/types';
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
      isArray: (name, jpath, isLeafNode, isAttribute) => { 
        return ['p', 'span', 'ttm:agent', 'songwriter', 'div'].indexOf(name) !== -1;
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
    }

    const parsedLines: LyricsLine[] = [];

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

          const lineObj: LyricsLine = {
             startTime: lineStart,
             endTime: lineEnd,
             agentId: agentId,
             text: "",
             words: []
          };

          if (part) {
             lineObj.part = part;
          }

          let fullText = "";
          let lineHasBg = false;

          function processSpan(spanNode: any, currentBg: boolean) {
             const isBg = currentBg || spanNode['@_ttm:role'] === 'x-bg';
             
             if (spanNode['#text']) {
                 const wordStart = spanNode['@_begin'] ? ttmlTimeToMs(spanNode['@_begin']) : undefined;
                 const wordEnd = spanNode['@_end'] ? ttmlTimeToMs(spanNode['@_end']) : undefined;
                 
                 const wordObj: LyricsWord = {
                    text: spanNode['#text'],
                    startTime: wordStart || lineStart,
                 };

                 if (wordEnd !== undefined) {
                     wordObj.endTime = wordEnd;
                 }

                 if (isBg) {
                     wordObj.isBackground = true;
                     lineHasBg = true;
                 }

                 lineObj.words!.push(wordObj);
                 fullText += spanNode['#text'] + " ";
             }

             if (spanNode.span) {
                 const nestedSpans = Array.isArray(spanNode.span) ? spanNode.span : [spanNode.span];
                 for (const nested of nestedSpans) {
                     processSpan(nested, isBg);
                 }
             }
          }

          // Handle spans (words)
          if (p.span && Array.isArray(p.span)) {
             for (const span of p.span) {
                 processSpan(span, false);
             }
          }

          // If no spans, just grab text
          if (!p.span) {
             fullText = p['#text'] || p || "";
          }

          lineObj.text = fullText.trim();
          if (lineHasBg) {
             lineObj.isBackground = true;
          }

          if (lineObj.words?.length === 0) {
             delete lineObj.words;
          }

          parsedLines.push(lineObj);
       }
    }

    // Sort lines by startTime just in case
    parsedLines.sort((a, b) => a.startTime - b.startTime);

    return {
      metadata,
      lines: parsedLines
    };
  }
}
