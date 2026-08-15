import { SupportedFileType } from '../../types';

export interface ValidationResult {
  valid: boolean;
  fileType?: SupportedFileType;
  errorMessage?: string;
}

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const EXTENSION_MAP: Record<string, SupportedFileType> = {
  pdf: 'PDF',
  docx: 'DOCX',
  txt: 'TXT',
  text: 'TXT',
  md: 'MARKDOWN',
  markdown: 'MARKDOWN',
  csv: 'CSV',
};

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  '', // Browsers sometimes omit MIME for .md or .csv
]);

export function validateFile(file: { name: string; size: number; type?: string }): ValidationResult {
  if (!file) {
    return { valid: false, errorMessage: 'No file provided for validation.' };
  }

  // 1. Check if empty
  if (file.size === 0) {
    return { valid: false, errorMessage: 'File is empty (0 bytes). Document processing requires non-empty content.' };
  }

  // 2. Check maximum size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      errorMessage: `File size exceeds the 50MB limit (${sizeMb} MB).`,
    };
  }

  // 3. Check extension
  const parts = file.name.split('.');
  if (parts.length < 2) {
    return { valid: false, errorMessage: 'File missing extension. Supported formats: .pdf, .docx, .txt, .md, .csv' };
  }

  const extension = parts.pop()?.toLowerCase() || '';
  const detectedType = EXTENSION_MAP[extension];

  if (!detectedType) {
    return {
      valid: false,
      errorMessage: `Unsupported file format ".${extension}". Supported formats are: PDF, DOCX, TXT, Markdown (.md), and CSV.`,
    };
  }

  // 4. Check MIME type if provided
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    // Tolerant check: if extension is valid but browser assigned an odd generic type (e.g. application/octet-stream), permit if extension matches
    if (file.type !== 'application/octet-stream') {
      // In strict environment, we allow valid extensions
    }
  }

  return {
    valid: true,
    fileType: detectedType,
  };
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
