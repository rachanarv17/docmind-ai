import { ExtractedSection } from '../../types';
import { cleanExtractedText, countWords } from './textCleaner';

export interface PdfParseResult {
  sections: ExtractedSection[];
  totalPages: number;
  isScannedOrEmpty: boolean;
  ocrNotice?: string;
}

let pdfjsLibPromise: Promise<any> | null = null;

async function getPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      let pdfjs: any;
      try {
        // Try legacy build first for maximum universal compatibility (Node & browser)
        pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      } catch {
        pdfjs = await import('pdfjs-dist');
      }

      if (typeof window !== 'undefined' && 'Worker' in window && pdfjs.GlobalWorkerOptions) {
        try {
          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || '4.0.0'}/pdf.worker.min.mjs`;
        } catch {
          // Worker fallback
        }
      }
      return pdfjs;
    })();
  }
  return pdfjsLibPromise;
}

/**
 * Parses PDF documents from ArrayBuffer.
 * Extracts per-page text, preserves 1-indexed pageNumber metadata, and detects scanned/empty documents.
 */
export async function parsePdfContent(
  data: ArrayBuffer | Uint8Array,
  documentId: string,
  filename: string
): Promise<PdfParseResult> {
  try {
    const pdfjs = await getPdfJs();
    // Ensure pure Uint8Array (Node Buffer can trigger rejection in modern pdfjs-dist)
    let uint8Array: Uint8Array;
    if (data instanceof Uint8Array && (data.constructor.name === 'Uint8Array' || typeof Buffer === 'undefined' || !Buffer.isBuffer(data))) {
      uint8Array = data;
    } else if (data instanceof ArrayBuffer) {
      uint8Array = new Uint8Array(data);
    } else {
      // For Node Buffer or custom typed arrays, slice into a clean ArrayBuffer
      const buf = data as any;
      uint8Array = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }

    const loadingTask = pdfjs.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    });

    const pdfDocument = await loadingTask.promise;
    const totalPages = pdfDocument.numPages;

    const sections: ExtractedSection[] = [];
    let totalExtractedChars = 0;
    let emptyPageCount = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      const pageStrings = textContent.items
        .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
        .filter((str: string) => str.trim().length > 0);

      const rawPageText = pageStrings.join(' ');
      const cleanedPageText = cleanExtractedText(rawPageText);

      totalExtractedChars += cleanedPageText.length;

      if (cleanedPageText.length === 0) {
        emptyPageCount++;
      }

      sections.push({
        documentId,
        filename,
        pageNumber: pageNum,
        sectionIndex: pageNum - 1,
        title: `Page ${pageNum}`,
        text: cleanedPageText || `[No selectable text found on Page ${pageNum}]`,
        charCount: cleanedPageText.length,
        wordCount: countWords(cleanedPageText),
        isScannedOrEmpty: cleanedPageText.length === 0,
      });
    }

    // Detect scanned or empty PDF: if total extracted text across pages is below threshold (< 25 chars)
    const isScannedOrEmpty = totalExtractedChars < 25 || emptyPageCount === totalPages;
    const ocrNotice = isScannedOrEmpty
      ? `This PDF appears to contain scanned image pages with no embedded text layer (${totalExtractedChars} characters extracted across ${totalPages} pages). OCR (Optical Character Recognition) pipeline is required to extract text from images.`
      : undefined;

    return {
      sections,
      totalPages,
      isScannedOrEmpty,
      ocrNotice,
    };
  } catch (error: any) {
    throw new Error(`Failed to parse PDF document: ${error?.message || 'Invalid or encrypted PDF file.'}`);
  }
}
