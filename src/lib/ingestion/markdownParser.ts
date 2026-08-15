import { ExtractedSection } from '../../types';
import { cleanExtractedText, countWords } from './textCleaner';

/**
 * Parses Markdown (.md) documents.
 * Extracts sections based on heading structures (#, ##, ###) while preserving heading metadata.
 */
export function parseMarkdownContent(
  rawContent: string,
  documentId: string,
  filename: string
): ExtractedSection[] {
  const cleaned = cleanExtractedText(rawContent);
  if (!cleaned) {
    return [];
  }

  const lines = cleaned.split('\n');
  const sections: ExtractedSection[] = [];

  let currentTitle = 'Document Overview';
  let currentLines: string[] = [];
  let sectionIndex = 0;

  const flushCurrentSection = () => {
    const textContent = currentLines.join('\n').trim();
    if (textContent.length > 0) {
      sections.push({
        documentId,
        filename,
        sectionIndex,
        title: currentTitle,
        text: textContent,
        charCount: textContent.length,
        wordCount: countWords(textContent),
      });
      sectionIndex++;
      currentLines = [];
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushCurrentSection();
      currentTitle = headingMatch[2].trim();
      currentLines.push(line); // Keep heading in context for RAG
    } else {
      currentLines.push(line);
    }
  }

  flushCurrentSection();

  // If no headings existed, treat as paragraph sections
  if (sections.length === 0 && cleaned.length > 0) {
    sections.push({
      documentId,
      filename,
      sectionIndex: 0,
      title: 'Markdown Body',
      text: cleaned,
      charCount: cleaned.length,
      wordCount: countWords(cleaned),
    });
  }

  return sections;
}
