import { LRCParser } from './parsers/LRCParser';
import { ELRCParser } from './parsers/ELRCParser';
import { TTMLParser } from './parsers/TTMLParser';
import { ILyricsParser, LyricsDocument, ParserOptions } from './models/types';

export class LyricsParser {
  public static parse(content: string, options?: ParserOptions): LyricsDocument {
    const trimmed = content.trim();

    // Auto-detect format
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
      return new TTMLParser().parse(content, options);
    } 
    
    // Check if ELRC (has word level tags like <00:16.436>)
    if (/<(\d{2}:\d{2}\.\d{2,3})>/.test(trimmed)) {
      return new ELRCParser().parse(content, options);
    }

    // Default to LRC
    return new LRCParser().parse(content, options);
  }
}

export * from './models/types';
export * from './parsers/LRCParser';
export * from './parsers/ELRCParser';
export * from './parsers/TTMLParser';
