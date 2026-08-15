export type NavTab = 'dashboard' | 'documents' | 'chat' | 'settings' | 'admin';

export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: number;
  updatedAt: number;
}

export interface UserWithPasswordHash extends User {
  passwordHash: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
  message?: string;
}

export type AuditEventType =
  | 'REGISTER'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  | 'DOCUMENT_REINDEXED'
  | 'UNAUTHORIZED_DOCUMENT_ACCESS'
  | 'UNAUTHORIZED_QDRANT_ACCESS'
  | 'RATE_LIMIT_TRIGGERED'
  | 'PROMPT_INJECTION_DETECTED'
  | 'SYSTEM_INFO'
  | 'UNAUTHORIZED_ACCESS'
  | 'ADMIN_ACTION';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  formattedDate: string;
  event: AuditEventType;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  resourceId?: string;
  details?: Record<string, unknown> | string;
  severity: 'INFO' | 'WARN' | 'SECURITY';
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalDocuments: number;
  totalChunks: number;
  indexingFailures: number;
  totalAuditLogs: number;
  recentSecurityEvents: number;
}

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'CHUNKED' | 'EMBEDDING' | 'INDEXING' | 'INDEXED' | 'PROCESSED' | 'FAILED';

export type IngestionProgressCallback = (
  status: DocumentStatus,
  stepDescription: string,
  progressPercent: number
) => void;

export type SupportedFileType = 'PDF' | 'DOCX' | 'TXT' | 'MARKDOWN' | 'CSV';

export interface ExtractedSection {
  documentId: string;
  filename: string;
  pageNumber?: number; // 1-indexed for PDFs
  sectionIndex: number; // 0-indexed
  title?: string;
  text: string;
  charCount: number;
  wordCount: number;
  isScannedOrEmpty?: boolean;
}

export interface DocumentChunk {
  chunkId: string; // Deterministic ID: chunk-${docId}-${pageOrSection}-${chunkIndex}
  documentId: string;
  userId?: string;
  filename: string;
  pageNumber?: number;
  sectionIndex: number;
  chunkIndex: number;
  text: string;
  charCount: number;
  tokenEstimate: number; // Based on standard heuristic (1 token ~ 4 chars / 0.75 words)
  startChar: number;
  endChar: number;
}

export interface ChunkingConfig {
  chunkSizeTokens: number; // Default 1000 tokens (~4000 chars)
  chunkOverlapTokens: number; // Default 150 tokens (~600 chars)
  respectSentenceBoundaries: boolean;
}

export interface DocumentItem {
  id: string;
  userId?: string;
  name: string;
  type: SupportedFileType;
  mimeType?: string;
  size?: number;
  sizeBytes?: number;
  formattedSize?: string;
  uploadTimestamp: number;
  formattedDate?: string;
  status: DocumentStatus;
  errorMessage?: string;
  pageCount: number;
  sectionCount?: number;
  characterCount: number;
  wordCount?: number;
  chunkCount: number;
  sections?: ExtractedSection[];
  chunks: DocumentChunk[];
  isScannedPdf?: boolean;
  ocrNotice?: string;
  rawSamplePreview?: string;
  embeddingModel?: string;
  vectorDatabase?: string;
  vectorCount?: number;
  indexedTimestamp?: number;
  qdrantIndexed?: boolean;
}

export interface ChunkVector {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber?: number;
  embedding: number[];
  norm: number;
}

export interface SearchResult {
  chunk: DocumentChunk;
  similarityScore: number; // 0.0 to 1.0
  denseScore: number;
  sparseScore: number;
  rank: number;
  matchedSnippets: string[];
}

export interface Citation {
  citationId: string;
  documentId: string;
  filename: string;
  pageNumber?: number;
  chunkId: string;
  snippet: string;
  similarityScore?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sourceDoc?: string;
  sourceChunks?: string[];
  retrievedResults?: SearchResult[];
  citations?: Citation[];
  modelUsed?: string;
  isStreaming?: boolean;
  isRetrievedViaQdrant?: boolean;
}

export interface VectorSearchConfig {
  topK: number;
  minSimilarity: number;
  hybridAlpha: number; // 0.0 (pure BM25) to 1.0 (pure dense vector)
  embeddingModel: string;
}

export interface UserSettings {
  modelPreference: string;
  autoSummarize: boolean;
  theme: 'light' | 'dark' | 'system';
  extractKeywords: boolean;
  confidenceThreshold: number;
  chunkingConfig: ChunkingConfig;
  vectorSearchConfig: VectorSearchConfig;
}


