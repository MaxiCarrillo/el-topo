export function sanitizeNickname(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[<>$\\{}]/g, '')
    .slice(0, 24);
}
