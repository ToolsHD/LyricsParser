export interface LyricsMetadata {
  title?: string;
  album?: string;
  artists?: string[];
  songwriters?: string[];
  duration?: string;
  agents?: Record<string, LyricsAgent>;
  attributes?: Record<string, string>;
  isRTL?: boolean;
}

export interface LyricsAgent {
  name: string;
  type?: "person" | "character" | "group" | "organization" | "other" | string;
}

export interface LyricsWord {
  text: string;
  startTime: number;
  endTime?: number;
  isBackground?: boolean;
  isSyllable?: boolean;
  ruby?: string;
}

export interface LyricsTranslation {
  lang: string;
  type?: string;
  text: string;
  words?: LyricsWord[];
}

export interface LyricsTransliteration {
  lang: string;
  text: string;
  words?: LyricsWord[];
}

export interface LyricsLine {
  key?: string;
  startTime: number;
  endTime?: number;
  agentId?: string;
  text: string;
  part?: string;
  isBackground?: boolean;
  isObscene?: boolean;
  isEmptyBeat?: boolean;
  words?: LyricsWord[];
  transliterations?: LyricsTransliteration[];
  translations?: LyricsTranslation[];
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
