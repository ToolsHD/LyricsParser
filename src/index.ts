import { LRCParser } from './parsers/LRCParser';
import { ELRCParser } from './parsers/ELRCParser';
import { TTMLParser } from './parsers/TTMLParser';
import { ILyricsParser, LyricsDocument, ParserOptions, LyricsFormat } from './models/types';

export class LyricsParser {
  public static detectFormat(content: string): LyricsFormat {
    const trimmed = content.trim();

    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
      const isSyllable = /itunes:timing="Word"|<span|<word/i.test(trimmed);
      return { lyricsType: 'ttml', isSyllable };
    } 
    
    // Check if ELRC (has word level tags like <00:16.436>)
    if (/<(\d{2}:\d{2}\.\d{2,3})>/.test(trimmed)) {
      return { lyricsType: 'lrc', isSyllable: true };
    }

    // Default to LRC
    return { lyricsType: 'lrc', isSyllable: false };
  }

  public static parse(content: string, options?: ParserOptions): LyricsDocument {
    const format = this.detectFormat(content);

    if (format.lyricsType === 'ttml') {
      return new TTMLParser().parse(content, options);
    } else if (format.lyricsType === 'lrc' && format.isSyllable) {
      return new ELRCParser().parse(content, options);
    } else {
      return new LRCParser().parse(content, options);
    }
  }
}

export * from './models/types';
export * from './parsers/LRCParser';
export * from './parsers/ELRCParser';
export * from './parsers/TTMLParser';
