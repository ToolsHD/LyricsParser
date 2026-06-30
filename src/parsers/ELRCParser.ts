import { ILyricsParser, LyricsDocument, LyricsMetadata, LyricsLine, LyricsWord, ParserOptions } from '../models/types';
import { timeStrToMs } from '../utils/time';

export class ELRCParser implements ILyricsParser {
  public parse(content: string, options?: ParserOptions): LyricsDocument {
    const lines = content.split('\n');
    const metadata: LyricsMetadata = {
      artists: [],
      songwriters: [],
      attributes: {},
      agents: {}
    };
    const parsedLines: LyricsLine[] = [];

    // ELRC format usually has tags like: [00:16.436]v1: <00:16.436>Fights <00:16.609>only
    const lineTimeRegex = /^\[(\d{2}:\d{2}\.\d{2,3})\](.*)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const lineMatch = line.match(lineTimeRegex);
      if (!lineMatch) continue;

      const lineTimeStr = lineMatch[1];
      const remainder = lineMatch[2];

      const lineStartTime = timeStrToMs(lineTimeStr);
      let agentId: string | undefined = undefined;
      let textToParse = remainder;

      // Extract agent prefix if any (e.g. "v1: <...")
      const agentMatch = remainder.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (agentMatch) {
        agentId = agentMatch[1];
        textToParse = agentMatch[2];
        if (agentId && metadata.agents && !metadata.agents[agentId]) {
           metadata.agents[agentId] = { name: agentId };
        }
      }

      // Parse word level tags: <mm:ss.xxx>word
      const wordRegex = /<(\d{2}:\d{2}\.\d{2,3})>([^<]*)/g;
      const words: LyricsWord[] = [];
      let match;
      let fullText = "";

      while ((match = wordRegex.exec(textToParse)) !== null) {
        const wordTimeStr = match[1];
        const wordText = match[2];
        const wordStartTime = timeStrToMs(wordTimeStr);
        words.push({
          startTime: wordStartTime,
          text: wordText
        });
        fullText += wordText;
      }

      // Assign word end times based on next word start time
      for (let w = 0; w < words.length - 1; w++) {
        if (words[w].endTime === undefined) {
           words[w].endTime = words[w + 1].startTime;
        }
      }

      // If no words were found (maybe hybrid file), just use the rest of the text
      if (words.length === 0) {
        fullText = textToParse.trim();
      }

      const parsedLine: LyricsLine = {
        startTime: lineStartTime,
        text: fullText.trim(),
      };

      if (agentId) {
        parsedLine.agentId = agentId;
      }

      if (words.length > 0) {
        parsedLine.words = words;
        // End time of line could be end time of last word, if we knew it.
        // For now, it will be assigned later based on next line's start time.
      }

      parsedLines.push(parsedLine);
    }

    // Assign line end times based on next line
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
