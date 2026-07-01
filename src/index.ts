import { LRCParser } from './parsers/LRCParser';
import { ELRCParser } from './parsers/ELRCParser';
import { TTMLParser } from './parsers/TTMLParser';
import { ILyricsParser, LyricsDocument, ParserOptions } from './models/types';

export class LyricsParser {
  public static detectFormat(content: string): 'ttml' | 'elrc' | 'lrc' {
    const trimmed = content.trim();

    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
      return 'ttml';
    } 
    
    // Check if ELRC (has word level tags like <00:16.436>)
    if (/<(\d{2}:\d{2}\.\d{2,3})>/.test(trimmed)) {
      return 'elrc';
    }

    // Default to LRC
    return 'lrc';
  }

  public static parse(content: string, options?: ParserOptions): LyricsDocument {
    const format = this.detectFormat(content);

    switch (format) {
      case 'ttml':
        return new TTMLParser().parse(content, options);
      case 'elrc':
        return new ELRCParser().parse(content, options);
      case 'lrc':
      default:
        return new LRCParser().parse(content, options);
    }
  }
}

export * from './models/types';
export * from './parsers/LRCParser';
export * from './parsers/ELRCParser';
export * from './parsers/TTMLParser';
