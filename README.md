# Lyrics Parser SDK

[![npm version](https://img.shields.io/npm/v/lyricsparsersdk.svg)](https://www.npmjs.com/package/lyricsparsersdk)
[![TypeScript](https://badges.frapsoft.com/typescript/code/typescript.svg?v=101)](https://github.com/ellerbrock/typescript-badges/)

A fast, zero-configuration TypeScript SDK for parsing lyrics from various file formats into a strictly-typed, unified JSON structure. 

Whether you are building a karaoke app, a music player, or a lyrics sync editor, `lyricsparsersdk` abstracts away the complexities of XML, regex, and timestamp parsing, giving you a clean, standard object back.

## Features

- **Universal Parsing Engine**: Automatically detects the input format and delegates to the correct parser.
- **Word-Level Synchronization**: Full support for granular word-level timings extracted from ELRC and TTML.
- **Multi-Agent / Voice Mapping**: Extracts voice tags (e.g. `v1:`) and maps them to actual singer names from TTML metadata.
- **Fully Typed**: Written in TypeScript with exhaustive types for the output document.

### Supported Formats
- **Standard LRC**: Line-level synchronization and global metadata.
- **Enhanced LRC (ELRC)**: Word-level synchronization (`<mm:ss.xxx>word`) and line prefixes.
- **TTML (Line-level)**: XML-based format with paragraph (`<p>`) level timestamps and iTunes metadata.
- **TTML (Word-level)**: XML-based format with precise word-level synchronization via `<span>` tags.

---

## Installation

Install the package via npm, yarn, or pnpm:

```bash
npm install lyricsparsersdk
```

---

## Getting Started

Using the SDK is as simple as passing your raw lyrics string to the parser.

```typescript
import * as fs from 'fs';
import { LyricsParser } from 'lyricsparsersdk';

// 1. Read your lyrics file as a string
const rawContent = fs.readFileSync('./song-lyrics.ttml', 'utf-8');

// 2. Parse the lyrics
const document = LyricsParser.parse(rawContent);

// 3. Use the strongly-typed unified format
console.log(`Title: ${document.metadata.title}`);
console.log(`Songwriters: ${document.metadata.songwriters?.join(', ')}`);

document.lines.forEach((line) => {
  console.log(`[${line.startTime}ms] Singer ${line.agentId}: ${line.text}`);
  
  // Access word-level sync if available
  if (line.words) {
    line.words.forEach(word => {
      console.log(`  -> ${word.text} at ${word.startTime}ms`);
    });
  }
});
```

---

## API Reference

### `LyricsParser.parse(content: string, options?: ParserOptions): LyricsDocument`
The main entry point. It automatically analyzes the `content` string, detects if it's LRC, ELRC, or TTML, and returns a unified `LyricsDocument`.

### Unified Types

#### `LyricsDocument`
The root object returned by the parser.
```typescript
interface LyricsDocument {
  metadata: LyricsMetadata;
  lines: LyricsLine[];
}
```

#### `LyricsMetadata`
Global metadata mapped from the original files.
```typescript
interface LyricsMetadata {
  title?: string;
  album?: string;
  artists?: string[];
  songwriters?: string[];
  duration?: string;
  agents?: Record<string, LyricsAgent>; // e.g. { "v1": { name: "Lead Singer" } }
  attributes?: Record<string, string>;  // e.g. { "itunes:leadingSilence": "0.160" }
}

interface LyricsAgent {
  name: string;
  type?: string;
}
```

#### `LyricsLine`
A single line of lyrics, potentially containing sub-word synchronizations.
```typescript
interface LyricsLine {
  startTime: number;      // milliseconds
  endTime?: number;       // milliseconds
  agentId?: string;       // maps to metadata.agents (e.g. "v1")
  text: string;           // The full string text of the line
  part?: string;          // Song part (e.g. "Verse", "Chorus")
  isBackground?: boolean; // True if this line contains background vocals
  words?: LyricsWord[];   // Array of word-level timings if supported
  transliterations?: LyricsTransliteration[]; // Alternate language representations
}
```

#### `LyricsTransliteration`
Alternate language representations for a line (e.g., Romanized Japanese), extracted from TTML `<transliterations>` metadata.
```typescript
interface LyricsTransliteration {
  lang: string;           // Language code (e.g. "ja-Latn")
  text: string;           // The transliterated text
  words?: LyricsWord[];   // Word-level synchronization for the transliteration
}
```

#### `LyricsWord`
Word-level granularity extracted from `<span>` tags (TTML) or `<mm:ss.xxx>` tags (ELRC).
```typescript
interface LyricsWord {
  text: string;
  startTime: number;      // milliseconds
  endTime?: number;       // milliseconds
  isBackground?: boolean; // True if this specific word is a background vocal
  isSyllable?: boolean;   // True if this is a sub-word syllable
}
```

---

## Architecture & Advanced Usage
For detailed technical documentation on how the internal parser agents work and how metadata is structurally resolved across different formats, please refer to the [Architecture & Metadata Guide (agents.md)](./agents.md).
