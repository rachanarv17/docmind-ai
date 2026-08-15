/**
 * Utility functions for cleaning and normalizing extracted document text.
 * Preserves structural paragraph breaks while stripping noise and control chars.
 */

export function cleanExtractedText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Remove null bytes and non-printable control characters (except \n, \t)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Normalize unusual Unicode spaces to standard spaces
  text = text.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

  // 4. Clean trailing whitespace per line
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');

  // 5. Collapse excessive consecutive blank lines (more than 2 into 2)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

export function estimateTokenCount(text: string): number {
  if (!text || !text.trim()) return 0;
  // Documentation: 1 token ≈ 4 characters or ~0.75 words for standard English / Latin text.
  // Using character length / 4 as standard approximation.
  return Math.max(1, Math.ceil(text.length / 4));
}
