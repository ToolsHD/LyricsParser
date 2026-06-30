export interface LyricsMetadata {
  title?: string;
  album?: string;
  artists?: string[];
  songwriters?: string[];
  duration?: string;
  agents?: Record<string, LyricsAgent>;
  attributes?: Record<string, string>;
}

export interface LyricsAgent {
  name: string;
  type?: string;
}

export interface LyricsWord {
  text: string;
  startTime: number;
  endTime?: number;
  isBackground?: boolean;
  isSyllable?: boolean;
}

export interface LyricsLine {
  startTime: number;
  endTime?: number;
  agentId?: string;
  text: string;
  part?: string;
  isBackground?: boolean;
  words?: LyricsWord[];
}

export interface LyricsDocument {
  metadata: LyricsMetadata;
  lines: LyricsLine[];
}

export interface ParserOptions {
  // Add any common parser options here if needed later
}

export interface ILyricsParser {
  parse(content: string, options?: ParserOptions): LyricsDocument;
}
