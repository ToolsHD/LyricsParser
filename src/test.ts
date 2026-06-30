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
  
  try {
     const doc = LyricsParser.parse(content);
     console.log('Metadata:', JSON.stringify(doc.metadata, null, 2));
     console.log(`Parsed ${doc.lines.length} lines.`);
     if (doc.lines.length > 0) {
        console.log('First line:', JSON.stringify(doc.lines[0], null, 2));
     }
  } catch (e) {
     console.error(`Failed to parse ${name}:`, e);
  }
}

testFormat('LRC', 'lyrics.lrc');
testFormat('ELRC', 'lyrics-elrc.lrc');
testFormat('TTML Line', 'lyrics-line.ttml');
testFormat('TTML Word', 'lyrics-word.ttml');
