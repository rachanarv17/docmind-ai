import path from 'path';
import { SupportedFileType } from '../../src/types';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_FILENAME_LENGTH = 255;

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
]);

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/csv',
  'application/octet-stream', // Often provided by browsers for binary files
]);

export const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.sh',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.py',
  '.php',
  '.rb',
  '.jar',
  '.bin',
]);

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
  sanitizedName?: string;
  detectedType?: SupportedFileType;
}

export function sanitizeFilename(rawFilename: string): string {
  if (!rawFilename) return 'document.txt';

  // Strip null bytes, control characters, and path traversal
  let clean = rawFilename.replace(/[\x00-\x1F\x7F]/g, '');
  clean = path.basename(clean);
  clean = clean.replace(/(\.\.[\/\\])+/g, '');
  clean = clean.replace(/[<>:"/\\|?*]/g, '_');

  if (clean.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(clean);
    const base = clean.slice(0, MAX_FILENAME_LENGTH - ext.length - 1);
    clean = `${base}${ext}`;
  }

  return clean || 'document.txt';
}

export function validateUploadedFile(
  filename: string,
  sizeBytes: number,
  mimeType?: string
): FileValidationResult {
  const sanitized = sanitizeFilename(filename);
  const ext = path.extname(sanitized).toLowerCase();

  // 1. Dangerous extension check
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File format ${ext} is not supported. Executable or script files are strictly forbidden.`,
    };
  }

  // 2. Allowed extension check
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `File format ${ext} is not supported. Allowed formats: PDF, DOCX, TXT, MD, CSV.`,
    };
  }

  // 3. File size check
  if (sizeBytes <= 0) {
    return {
      valid: false,
      error: 'File is empty (0 bytes).',
    };
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 25MB limit (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
    };
  }

  // 4. MIME type check if provided
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType.toLowerCase()) && !mimeType.startsWith('text/')) {
    return {
      valid: false,
      error: `Invalid MIME type (${mimeType}) for file ${sanitized}.`,
    };
  }

  // Map to SupportedFileType
  let detectedType: SupportedFileType = 'TXT';
  if (ext === '.pdf') detectedType = 'PDF';
  else if (ext === '.docx') detectedType = 'DOCX';
  else if (ext === '.md' || ext === '.markdown') detectedType = 'MARKDOWN';
  else if (ext === '.csv') detectedType = 'CSV';

  return {
    valid: true,
    sanitizedFilename: sanitized,
    sanitizedName: sanitized,
    detectedType,
  };
}
