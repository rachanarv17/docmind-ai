import { ExtractedSection } from '../../types';
import { cleanExtractedText, countWords } from './textCleaner';

/**
 * Parses plain text files (.txt).
 * Breaks into logical sections based on double newlines / multi-paragraphs if available.
 */
export function parseTextContent(
  rawText: string,
  documentId: string,
  filename: string
): ExtractedSection[] {
  const cleaned = cleanExtractedText(rawText);
  if (!cleaned) {
    return [];
  }

  // Split by double line breaks into paragraphs / sections
  const rawSections = cleaned.split(/\n\s*\n+/);
  const sections: ExtractedSection[] = [];

  rawSections.forEach((secText, index) => {
    const trimmed = secText.trim();
    if (trimmed.length > 0) {
      sections.push({
        documentId,
        filename,
        sectionIndex: index,
        title: `Section ${index + 1}`,
        text: trimmed,
        charCount: trimmed.length,
        wordCount: countWords(trimmed),
      });
    }
  });

  // Fallback if everything was grouped
  if (sections.length === 0 && cleaned.length > 0) {
    sections.push({
      documentId,
      filename,
      sectionIndex: 0,
      title: 'Full Text Content',
      text: cleaned,
      charCount: cleaned.length,
      wordCount: countWords(cleaned),
    });
  }

  return sections;
}
