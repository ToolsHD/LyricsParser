import { ILyricsParser, LyricsDocument, LyricsMetadata, LyricsLine, ParserOptions } from '../models/types';
import { timeStrToMs } from '../utils/time';
import he from 'he';

export class LRCParser implements ILyricsParser {
  public parse(content: string, options?: ParserOptions): LyricsDocument {
    const lines = content.split('\n');
    const metadata: LyricsMetadata = {
      artists: [],
      songwriters: [],
      attributes: {}
    };
    const parsedLines: LyricsLine[] = [];

    const metaRegex = /^\[([a-z]+):(.*)\]$/i;
    const timeRegex = /^\[(\d{2}:\d{2}\.\d{2,3})\](.*)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const metaMatch = line.match(metaRegex);
      if (metaMatch) {
        const key = metaMatch[1].toLowerCase();
        const value = he.decode(metaMatch[2].trim());
        
        switch (key) {
          case 'ti':
            metadata.title = value;
            break;
          case 'al':
            metadata.album = value;
            break;
          case 'ar':
            if (!metadata.artists) metadata.artists = [];
            metadata.artists.push(value);
            break;
          case 'length':
            metadata.duration = value;
            break;
          default:
            if (!metadata.attributes) metadata.attributes = {};
            metadata.attributes[key] = value;
        }
        continue;
      }

      const timeMatch = line.match(timeRegex);
      if (timeMatch) {
        const timeStr = timeMatch[1];
        const text = timeMatch[2].trim();
        const startTimeMs = timeStrToMs(timeStr);

        parsedLines.push({
          startTime: startTimeMs,
          text: he.decode(text)
        });
      }
    }

    // Assign end times based on next line's start time, if omitted.
    for (let i = 0; i < parsedLines.length - 1; i++) {
      if (parsedLines[i].endTime === undefined) {
        parsedLines[i].endTime = parsedLines[i + 1].startTime;
      }
    }

    return {
      metadata,
      lines: parsedLines
    };
  }
}
