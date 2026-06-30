export function timeStrToMs(timeStr: string): number {
  // Parses "hh:mm:ss.xxx", "mm:ss.xx", or "ss.xxx" into milliseconds
  const parts = timeStr.split(':');
  
  let hours = 0;
  let minutes = 0;
  let secondsStr = "";

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    secondsStr = parts[2];
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10);
    secondsStr = parts[1];
  } else if (parts.length === 1) {
    secondsStr = parts[0];
  } else {
    return 0;
  }

  const secondsParts = secondsStr.split('.');
  const seconds = parseInt(secondsParts[0], 10) || 0;
  let milliseconds = 0;
  if (secondsParts.length > 1) {
    let msStr = secondsParts[1];
    // pad to 3 digits
    if (msStr.length === 2) msStr += '0';
    if (msStr.length === 1) msStr += '00';
    milliseconds = parseInt(msStr.substring(0, 3), 10);
  }
  return hours * 3600 * 1000 + minutes * 60 * 1000 + seconds * 1000 + milliseconds;
}
