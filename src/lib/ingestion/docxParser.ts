import mammoth from 'mammoth';
import { ExtractedSection } from '../../types';
import { cleanExtractedText, countWords } from './textCleaner';

/**
 * Parses DOCX documents (.docx) from an ArrayBuffer or Uint8Array.
 * Extracts paragraphs and structures them into indexed sections.
 */
export async function parseDocxContent(
  arrayBuffer: ArrayBuffer,
  documentId: string,
  filename: string
): Promise<ExtractedSection[]> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    const rawText = result.value || '';
    const cleaned = cleanExtractedText(rawText);

    if (!cleaned) {
      return [];
    }

    const rawParagraphs = cleaned.split(/\n\s*\n+/);
    const sections: ExtractedSection[] = [];

    // Group into logical multi-paragraph sections
    let currentBatch: string[] = [];
    let sectionIdx = 0;
    let accumulatedChars = 0;

    for (const para of rawParagraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      currentBatch.push(trimmed);
      accumulatedChars += trimmed.length;

      // Group into sections of ~1500 chars for good readability
      if (accumulatedChars >= 1500) {
        const text = currentBatch.join('\n\n');
        sections.push({
          documentId,
          filename,
          sectionIndex: sectionIdx,
          title: `Document Section ${sectionIdx + 1}`,
          text,
          charCount: text.length,
          wordCount: countWords(text),
        });
        sectionIdx++;
        currentBatch = [];
        accumulatedChars = 0;
      }
    }

    if (currentBatch.length > 0) {
      const text = currentBatch.join('\n\n');
      sections.push({
        documentId,
        filename,
        sectionIndex: sectionIdx,
        title: `Document Section ${sectionIdx + 1}`,
        text,
        charCount: text.length,
        wordCount: countWords(text),
      });
    }

    return sections;
  } catch (error: any) {
    throw new Error(`Failed to parse DOCX document: ${error?.message || 'Invalid or corrupt DOCX archive.'}`);
  }
}
