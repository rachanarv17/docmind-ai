import { DocumentChunk, ExtractedSection, ChunkingConfig } from '../../types';
import { cleanExtractedText, estimateTokenCount } from './textCleaner';

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  chunkSizeTokens: 1000, // ~4000 characters
  chunkOverlapTokens: 150, // ~600 characters
  respectSentenceBoundaries: true,
};

/**
 * Splits extracted document sections into deterministic, overlapping chunks.
 * Uses character length approximation: 1 token ≈ 4 characters.
 *
 * Requirements satisfied:
 * - Deterministic chunk IDs: chunk-${documentId}-p${pageNumber || 's' + sectionIndex}-c${chunkIndex}
 * - Configurable size & overlap
 * - Word & sentence boundary protection (avoids chopping mid-word)
 * - Complete metadata preservation (documentId, filename, pageNumber, sectionIndex, chunkIndex)
 */
export function chunkSection(
  section: ExtractedSection,
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): DocumentChunk[] {
  const text = cleanExtractedText(section.text);
  if (!text) return [];

  // Convert token specifications to approximate character counts
  const targetChunkChars = Math.max(100, config.chunkSizeTokens * 4);
  const overlapChars = Math.min(
    Math.max(0, config.chunkOverlapTokens * 4),
    Math.floor(targetChunkChars * 0.5) // Overlap cannot exceed 50% of chunk size
  );

  // If the section text is already smaller than one chunk, return it as a single chunk
  if (text.length <= targetChunkChars) {
    const chunkId = `chunk-${section.documentId}-p${section.pageNumber ?? 's' + section.sectionIndex}-c0`;
    return [
      {
        chunkId,
        documentId: section.documentId,
        filename: section.filename,
        pageNumber: section.pageNumber,
        sectionIndex: section.sectionIndex,
        chunkIndex: 0,
        text,
        charCount: text.length,
        tokenEstimate: estimateTokenCount(text),
        startChar: 0,
        endChar: text.length,
      },
    ];
  }

  const chunks: DocumentChunk[] = [];
  let startIdx = 0;
  let chunkIndex = 0;

  while (startIdx < text.length) {
    let endIdx = Math.min(startIdx + targetChunkChars, text.length);

    // If we're not at the very end of the text, try to find a natural boundary
    if (endIdx < text.length) {
      if (config.respectSentenceBoundaries) {
        // Look for sentence termination (e.g. ". ", "! ", "? ", or "\n\n") within the last 25% of targetChunkChars
        const lookbackWindow = Math.floor(targetChunkChars * 0.25);
        const searchSubstring = text.slice(Math.max(startIdx, endIdx - lookbackWindow), endIdx);

        // Find last sentence or paragraph ending
        const sentenceBoundary = searchSubstring.search(/(\.|\!|\?|\n)\s+(?=[A-Z0-9\n"'])/i);
        if (sentenceBoundary !== -1) {
          const absoluteBoundary = Math.max(startIdx, endIdx - lookbackWindow) + sentenceBoundary + 1;
          if (absoluteBoundary > startIdx + 50) {
            endIdx = absoluteBoundary;
          }
        } else {
          // If no sentence boundary found, ensure we at least break on whitespace / word boundary
          const lastSpace = text.lastIndexOf(' ', endIdx);
          if (lastSpace > startIdx + 50) {
            endIdx = lastSpace;
          }
        }
      } else {
        // Break on last whitespace
        const lastSpace = text.lastIndexOf(' ', endIdx);
        if (lastSpace > startIdx + 50) {
          endIdx = lastSpace;
        }
      }
    }

    const chunkText = text.slice(startIdx, endIdx).trim();
    if (chunkText.length > 0) {
      const chunkId = `chunk-${section.documentId}-p${section.pageNumber ?? 's' + section.sectionIndex}-c${chunkIndex}`;
      chunks.push({
        chunkId,
        documentId: section.documentId,
        filename: section.filename,
        pageNumber: section.pageNumber,
        sectionIndex: section.sectionIndex,
        chunkIndex,
        text: chunkText,
        charCount: chunkText.length,
        tokenEstimate: estimateTokenCount(chunkText),
        startChar: startIdx,
        endChar: endIdx,
      });
      chunkIndex++;
    }

    if (endIdx >= text.length) {
      break;
    }

    // Step forward by (endIdx - overlapChars), ensuring strict positive forward progress
    const nextStart = endIdx - overlapChars;
    if (nextStart <= startIdx) {
      startIdx = endIdx; // Guarantee forward progress if overlap would cause infinite loop
    } else {
      // Find clean word start after overlap
      const nextSpace = text.indexOf(' ', nextStart);
      if (nextSpace !== -1 && nextSpace < endIdx) {
        startIdx = nextSpace + 1;
      } else {
        startIdx = nextStart;
      }
    }
  }

  return chunks;
}

export function chunkAllSections(
  sections: ExtractedSection[],
  config: ChunkingConfig = DEFAULT_CHUNKING_CONFIG
): DocumentChunk[] {
  const allChunks: DocumentChunk[] = [];
  sections.forEach((section) => {
    const sectionChunks = chunkSection(section, config);
    allChunks.push(...sectionChunks);
  });
  return allChunks;
}
