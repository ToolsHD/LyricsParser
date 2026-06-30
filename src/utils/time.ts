export function timeStrToMs(timeStr: string): number {
  // Parses "mm:ss.xx" or "mm:ss.xxx" into milliseconds
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;
  const minutes = parseInt(parts[0], 10);
  const secondsParts = parts[1].split('.');
  const seconds = parseInt(secondsParts[0], 10);
  let milliseconds = 0;
  if (secondsParts.length > 1) {
    let msStr = secondsParts[1];
    // pad to 3 digits
    if (msStr.length === 2) msStr += '0';
    if (msStr.length === 1) msStr += '00';
    milliseconds = parseInt(msStr.substring(0, 3), 10);
  }
  return minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}
