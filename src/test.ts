import * as fs from 'fs';
import * as path from 'path';
import { LyricsParser } from './index';

function testFormat(name: string, filename: string) {
  const filePath = path.join(__dirname, '..', 'Samples', filename);
  if (!fs.existsSync(filePath)) {
     console.error(`File not found: ${filePath}`);
     return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`\n--- Testing ${name} ---`);
  const format = LyricsParser.detectFormat(content);
  console.log('Format detected:', format);
  
  try {
     const doc = LyricsParser.parse(content);
     const outPath = filePath + '.parsed.json';
     fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf-8');
     console.log('Metadata:', JSON.stringify(doc.metadata, null, 2));
     console.log(`Parsed ${doc.lines.length} lines. Full output saved to ${path.basename(outPath)}`);
  } catch (e) {
     console.error(`Failed to parse ${name}:`, e);
  }
}

testFormat('LRC', 'lyrics.lrc');
testFormat('ELRC', 'lyrics-elrc.lrc');
testFormat('TTML Line', 'lyrics-line.ttml');
testFormat('TTML Word', 'lyrics-word.ttml');
testFormat('TTML Transliteration', 'lyrics-transliteration.ttml');
