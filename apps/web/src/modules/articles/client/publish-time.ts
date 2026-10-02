const pad = (value: number) => String(value).padStart(2, "0");

/** `2026/10/02 20:30` in the device's time zone, the format the publish form uses. */
export function formatLocalTime(date: Date) {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Reads `YYYY/MM/DD HH:mm` (also `-` as date separator) in the device's time
 * zone. Returns null for anything else, including impossible dates like 02/30.
 */
export function parseLocalTime(text: string) {
  const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(
    text.trim(),
  );
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute
    ? date
    : null;
}
