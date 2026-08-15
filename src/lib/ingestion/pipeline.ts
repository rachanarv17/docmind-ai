import {
  DocumentItem,
  DocumentStatus,
  ExtractedSection,
  ChunkingConfig,
  SupportedFileType,
} from '../../types';
import { validateFile, formatBytes } from './fileValidator';
import { parseTextContent } from './textParser';
import { parseMarkdownContent } from './markdownParser';
import { parseCsvContent } from './csvParser';
import { parseDocxContent } from './docxParser';
import { parsePdfContent } from './pdfParser';
import { chunkAllSections, DEFAULT_CHUNKING_CONFIG } from './chunker';
import { globalQdrantStore } from '../vector/qdrantStore';
import { EMBEDDING_MODEL_NAME } from '../vector/embeddingService';

export interface IngestionInput {
  file?: File;
  name: string;
  size: number;
  type?: string;
  content?: string | ArrayBuffer | Uint8Array;
}

export interface IngestionProgressCallback {
  (status: DocumentStatus, stepDescription: string, progressPercent: number): void;
}

/**
 * Executes the complete real document ingestion + embedding + Qdrant persistence pipeline:
 * File Upload -> Validation -> Parsing -> Text Extraction (EXTRACTED) ->
 * Chunking (CHUNKED) -> Real Neural Embedding (EMBEDDING) ->
 * Qdrant Persistence (INDEXING) -> Confirmed Vector Storage (INDEXED)
 */
export async function processDocumentFile(
  input: IngestionInput,
  chunkingConfig: ChunkingConfig = DEFAULT_CHUNKING_CONFIG,
  onProgress?: IngestionProgressCallback,
  skipQdrant = true
): Promise<DocumentItem> {
  const documentId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date();
  const formattedDate =
    now.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + ` ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  // Step 1: Upload Registration
  onProgress?.('UPLOADED', 'File registered for validation', 10);

  // Step 2: File Validation
  const validation = validateFile({
    name: input.name,
    size: input.size,
    type: input.type || input.file?.type,
  });

  if (!validation.valid || !validation.fileType) {
    const errorMsg = validation.errorMessage || 'File validation failed.';
    onProgress?.('FAILED', errorMsg, 100);
    return {
      id: documentId,
      name: input.name,
      type: 'UNSUPPORTED' as any,
      mimeType: input.type || 'unknown',
      sizeBytes: input.size,
      formattedSize: formatBytes(input.size),
      uploadTimestamp: now.getTime(),
      formattedDate,
      status: 'FAILED',
      errorMessage: errorMsg,
      pageCount: 0,
      sectionCount: 0,
      characterCount: 0,
      wordCount: 0,
      chunkCount: 0,
      sections: [],
      chunks: [],
    };
  }

  const fileType: SupportedFileType = validation.fileType;

  try {
    onProgress?.('PROCESSING', `Parsing ${fileType} content and extracting text...`, 25);

    let sections: ExtractedSection[] = [];
    let pageCount = 1;
    let isScannedPdf = false;
    let ocrNotice: string | undefined = undefined;

    // Step 3 & 4: Parsing and Text Extraction
    if (fileType === 'TXT') {
      let rawText = '';
      if (typeof input.content === 'string') {
        rawText = input.content;
      } else if (input.file) {
        rawText = await input.file.text();
      }
      sections = parseTextContent(rawText, documentId, input.name);
      pageCount = 1;
    } else if (fileType === 'MARKDOWN') {
      let rawText = '';
      if (typeof input.content === 'string') {
        rawText = input.content;
      } else if (input.file) {
        rawText = await input.file.text();
      }
      sections = parseMarkdownContent(rawText, documentId, input.name);
      pageCount = 1;
    } else if (fileType === 'CSV') {
      let rawText = '';
      if (typeof input.content === 'string') {
        rawText = input.content;
      } else if (input.file) {
        rawText = await input.file.text();
      }
      sections = parseCsvContent(rawText, documentId, input.name);
      pageCount = 1;
    } else if (fileType === 'DOCX') {
      let buffer: ArrayBuffer;
      if (input.content && input.content instanceof ArrayBuffer) {
        buffer = input.content;
      } else if (input.file) {
        buffer = await input.file.arrayBuffer();
      } else {
        throw new Error('DOCX content must be an ArrayBuffer or File.');
      }
      sections = await parseDocxContent(buffer, documentId, input.name);
      pageCount = Math.max(1, Math.ceil(sections.length / 2));
    } else if (fileType === 'PDF') {
      let buffer: ArrayBuffer | Uint8Array;
      if (input.content && typeof input.content !== 'string') {
        buffer = input.content;
      } else if (input.file) {
        buffer = await input.file.arrayBuffer();
      } else {
        throw new Error('PDF content must be an ArrayBuffer or File.');
      }
      const pdfResult = await parsePdfContent(buffer, documentId, input.name);
      sections = pdfResult.sections;
      pageCount = pdfResult.totalPages;
      isScannedPdf = pdfResult.isScannedOrEmpty;
      ocrNotice = pdfResult.ocrNotice;
    }

    if (sections.length === 0) {
      throw new Error(`The document contains no readable text content.`);
    }

    onProgress?.('EXTRACTED', `Extracted ${sections.length} sections (${fileType})`, 45);

    // Step 5: Chunking
    onProgress?.('PROCESSING', 'Cleaning text & generating deterministic chunks...', 55);
    const chunks = chunkAllSections(sections, chunkingConfig);
    onProgress?.('CHUNKED', `Generated ${chunks.length} structured chunks`, 65);

    const totalChars = sections.reduce((acc, s) => acc + s.charCount, 0);
    const totalWords = sections.reduce((acc, s) => acc + s.wordCount, 0);
    const rawSamplePreview = sections[0]?.text ? sections[0].text.slice(0, 300) : '';

    const intermediateDoc: DocumentItem = {
      id: documentId,
      name: input.name,
      type: fileType,
      mimeType: input.type || input.file?.type || `application/${fileType.toLowerCase()}`,
      sizeBytes: input.size,
      formattedSize: formatBytes(input.size),
      uploadTimestamp: now.getTime(),
      formattedDate,
      status: 'PROCESSING',
      pageCount,
      sectionCount: sections.length,
      characterCount: totalChars,
      wordCount: totalWords,
      chunkCount: chunks.length,
      sections,
      chunks,
      isScannedPdf,
      ocrNotice,
      rawSamplePreview,
    };

    if (skipQdrant) {
      onProgress?.('PROCESSED', 'Ingestion and chunking completed successfully', 100);
      return {
        ...intermediateDoc,
        status: 'PROCESSED',
      };
    }

    // Step 6 & 7: Real Neural Embedding + Qdrant Persistence
    onProgress?.('EMBEDDING', `Generating neural embeddings (${EMBEDDING_MODEL_NAME})...`, 75);
    await globalQdrantStore.indexDocument(intermediateDoc, onProgress);

    onProgress?.('INDEXED', `Indexed ${chunks.length} vectors in persistent Qdrant`, 100);

    return {
      ...intermediateDoc,
      status: 'INDEXED',
      embeddingModel: EMBEDDING_MODEL_NAME,
      vectorDatabase: 'Qdrant (Persistent)',
      vectorCount: chunks.length,
      indexedTimestamp: Date.now(),
      qdrantIndexed: true,
    };
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed during document ingestion and vectorization pipeline.';
    onProgress?.('FAILED', errorMsg, 100);
    return {
      id: documentId,
      name: input.name,
      type: fileType,
      mimeType: input.type || input.file?.type || 'unknown',
      sizeBytes: input.size,
      formattedSize: formatBytes(input.size),
      uploadTimestamp: now.getTime(),
      formattedDate,
      status: 'FAILED',
      errorMessage: errorMsg,
      pageCount: 0,
      sectionCount: 0,
      characterCount: 0,
      wordCount: 0,
      chunkCount: 0,
      sections: [],
      chunks: [],
    };
  }
}

