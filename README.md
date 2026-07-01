# Lyrics Parser SDK

[![npm version](https://img.shields.io/npm/v/lyricsparser.svg)](https://www.npmjs.com/package/lyricsparser)
[![TypeScript](https://badges.frapsoft.com/typescript/code/typescript.svg?v=101)](https://github.com/ellerbrock/typescript-badges/)

A fast, zero-configuration TypeScript SDK for parsing lyrics from LRC, ELRC, and TTML into a unified JSON structure.

## Installation

```bash
npm install lyricsparser
```

## Quick Start

```typescript
import { LyricsParser } from 'lyricsparser';

const document = LyricsParser.parse(rawLyricsString);

console.log(document.metadata.title);

document.lines.forEach(line => {
  console.log(`[${line.startTime}ms] ${line.text}`);
  
  line.words?.forEach(word => {
    console.log(`  -> ${word.text} at ${word.startTime}ms`);
  });
});
```

### Example Output

When parsing a file like `lyrics-word.ttml`, the resulting `LyricsDocument` JSON will look like this:

```json
{
  "metadata": {
    "artists": [],
    "songwriters": [
      "George Daniel",
      "Matthew Healy"
    ],
    "duration": "5:26.491",
    "agents": {
      "v1": {
        "name": "v1",
        "type": "person"
      }
    },
    "attributes": {
      "itunes:timing": "Word",
      "xml:lang": "en"
    }
  },
    "lines": [
    {
      "startTime": 44851,
      "endTime": 50917,
      "agentId": "v1",
      "text": "I know a place",
      "words": [
        {
          "text": "I",
          "startTime": 44851,
          "endTime": 45818
        },
        {
          "text": "know",
          "startTime": 49118,
          "endTime": 49484
        },
        {
          "text": "a",
          "startTime": 49484,
          "endTime": 49768
        },
        {
          "text": "place",
          "startTime": 49768,
          "endTime": 50917
        }
      ],
      "key": "L1"
    },
    {
      "//": "... additional lines so on ..."
    }
  ]
}
```

## API Reference

### `LyricsParser.detectFormat(content: string): 'ttml' | 'elrc' | 'lrc'`

Detects and returns the format of the provided lyrics string without parsing the entire document.

### `LyricsParser.parse(content: string, options?: ParserOptions): LyricsDocument`

Returns a `LyricsDocument` containing parsed metadata and synchronized lines.

### Types

```typescript
interface LyricsDocument {
  metadata: LyricsMetadata;
  lines: LyricsLine[];
}

interface LyricsMetadata {
  title?: string;
  album?: string;
  artists?: string[];
  songwriters?: string[];
  duration?: string;
  agents?: Record<string, LyricsAgent>;
  attributes?: Record<string, string>;
  isRTL?: boolean;
}

interface LyricsAgent {
  name: string;
  type?: "person" | "character" | "group" | "organization" | "other" | string;
}

interface LyricsLine {
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

interface LyricsTranslation {
  lang: string;
  type?: string;
  text: string;
  words?: LyricsWord[];
}

interface LyricsTransliteration {
  lang: string;
  text: string;
  words?: LyricsWord[];
}

interface LyricsWord {
  text: string;
  startTime: number;
  endTime?: number;
  isBackground?: boolean;
  isSyllable?: boolean;
  ruby?: string;
}
```

