import {
  DocumentItem,
  DocumentChunk,
  SearchResult,
  Citation,
  VectorSearchConfig,
  IngestionProgressCallback,
} from '../../types';
import {
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL_NAME,
  generateEmbeddings,
} from './embeddingService';
import { calculateBM25Score, calculateHybridScore } from './similarity';

export const QDRANT_COLLECTION_NAME = 'docmind_chunks';
export const QDRANT_DISTANCE_METRIC = 'Cosine';

export interface QdrantConnectionStatus {
  connected: boolean;
  version?: string;
  collectionExists?: boolean;
  pointsCount?: number;
  error?: string;
}

export interface QdrantPayload {
  documentId: string;
  chunkId: string;
  filename: string;
  pageNumber?: number;
  sectionIndex: number;
  chunkIndex: number;
  text: string;
  charCount: number;
  tokenEstimate: number;
  startChar: number;
  endChar: number;
  indexedTimestamp: number;
}

export const DEFAULT_QDRANT_SEARCH_CONFIG: VectorSearchConfig = {
  topK: 4,
  minSimilarity: 0.35,
  hybridAlpha: 0.7,
  embeddingModel: 'gemini-embedding-2',
};

/**
 * Generates a deterministic RFC-4122 compliant UUIDv4 format from chunkId
 * Ensures that re-indexing the same chunk updates the exact same point in Qdrant.
 */
export function deterministicChunkUUID(chunkId: string): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0x5bd1e995;
  for (let i = 0; i < chunkId.length; i++) {
    const ch = chunkId.charCodeAt(i);
    hash1 = (hash1 ^ ch) * 0x01000193;
    hash2 = (hash2 ^ (ch + i)) * 0x01000193;
  }
  const hex1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  const hex3 = ((hash1 ^ hash2) >>> 0).toString(16).padStart(8, '0');
  const hex4 = ((hash1 + hash2) >>> 0).toString(16).padStart(8, '0');
  const combined = (hex1 + hex2 + hex3 + hex4).slice(0, 32);
  return `${combined.slice(0, 8)}-${combined.slice(8, 12)}-4${combined.slice(13, 16)}-8${combined.slice(17, 20)}-${combined.slice(20, 32)}`;
}

export class QdrantVectorStore {
  private collectionName = QDRANT_COLLECTION_NAME;
  private vectorSize = EMBEDDING_DIMENSION;

  /**
   * Verifies connectivity to the Qdrant instance
   */
  public async verifyConnection(): Promise<QdrantConnectionStatus> {
    try {
      const res = await fetch('/api/qdrant/status');
      if (!res.ok) {
        return {
          connected: false,
          error: `HTTP ${res.status}: Failed to reach Qdrant server`,
        };
      }
      const data = await res.json();
      return {
        connected: data.connected ?? true,
        version: data.version || '1.13.2',
        collectionExists: data.collectionExists ?? true,
        pointsCount: data.pointsCount ?? 0,
      };
    } catch (err) {
      return {
        connected: false,
        error: err instanceof Error ? err.message : 'Unknown connection error',
      };
    }
  }

  /**
   * Initializes or creates the Qdrant vector collection
   */
  public async initCollection(recreate = false): Promise<boolean> {
    try {
      const res = await fetch('/api/qdrant/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName: this.collectionName,
          vectorSize: this.vectorSize,
          distance: QDRANT_DISTANCE_METRIC,
          recreate,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to initialize Qdrant collection: ${err}`);
      }
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('Error initializing Qdrant collection:', err);
      throw err;
    }
  }

  /**
   * Upserts document chunks with their neural vector embeddings into Qdrant
   */
  public async upsertChunks(
    chunksWithVectors: Array<{ chunk: DocumentChunk; embedding: number[] }>
  ): Promise<{ success: boolean; insertedCount: number }> {
    if (chunksWithVectors.length === 0) {
      return { success: true, insertedCount: 0 };
    }

    // Format points for Qdrant API
    const points = chunksWithVectors.map(({ chunk, embedding }) => {
      const id = deterministicChunkUUID(chunk.chunkId);
      const payload: QdrantPayload = {
        documentId: chunk.documentId,
        chunkId: chunk.chunkId,
        filename: chunk.filename,
        pageNumber: chunk.pageNumber,
        sectionIndex: chunk.sectionIndex,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        charCount: chunk.charCount,
        tokenEstimate: chunk.tokenEstimate,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        indexedTimestamp: Date.now(),
      };

      return {
        id,
        vector: embedding,
        payload,
      };
    });

    const res = await fetch('/api/qdrant/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionName: this.collectionName,
        points,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant upsert failed: ${err}`);
    }

    const data = await res.json();
    return {
      success: true,
      insertedCount: points.length,
    };
  }

  /**
   * Performs semantic vector search with optional payload filtering and BM25 hybrid ranking
   */
  public async search(
    queryVector: number[],
    options?: {
      topK?: number;
      minSimilarity?: number;
      docFilter?: string;
      hybridAlpha?: number;
      queryText?: string;
    }
  ): Promise<SearchResult[]> {
    const topK = options?.topK ?? DEFAULT_QDRANT_SEARCH_CONFIG.topK;
    const minSim = options?.minSimilarity ?? DEFAULT_QDRANT_SEARCH_CONFIG.minSimilarity;
    const alpha = options?.hybridAlpha ?? DEFAULT_QDRANT_SEARCH_CONFIG.hybridAlpha;
    const docFilter = options?.docFilter && options.docFilter !== 'all' ? options.docFilter : null;

    const res = await fetch('/api/qdrant/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionName: this.collectionName,
        vector: queryVector,
        limit: topK * 3, // retrieve candidate pool for hybrid re-ranking
        docFilter,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Qdrant search failed: ${err}`);
    }

    const data = await res.json();
    const points: Array<{
      id: string;
      score: number;
      payload: QdrantPayload;
    }> = data.points || [];

    if (points.length === 0) {
      return [];
    }

    const queryTerms = (options?.queryText || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scoredResults: Array<{
      chunk: DocumentChunk;
      similarityScore: number;
      denseScore: number;
      sparseScore: number;
      matchedSnippets: string[];
    }> = [];

    for (const point of points) {
      const p = point.payload;
      if (!p || !p.text) continue;

      // Reconstruct DocumentChunk from payload
      const chunk: DocumentChunk = {
        chunkId: p.chunkId,
        documentId: p.documentId,
        filename: p.filename,
        pageNumber: p.pageNumber,
        sectionIndex: p.sectionIndex,
        chunkIndex: p.chunkIndex,
        text: p.text,
        charCount: p.charCount || p.text.length,
        tokenEstimate: p.tokenEstimate || Math.ceil(p.text.length / 4),
        startChar: p.startChar || 0,
        endChar: p.endChar || p.text.length,
      };

      // In Qdrant with Cosine distance, point.score is the cosine similarity (0.0 to 1.0)
      const denseScore = Math.max(0, Math.min(1, (point.score + 1) / 2 || point.score));

      // Calculate BM25 sparse score if query text is available
      const sparseScore = options?.queryText
        ? calculateBM25Score(options.queryText, p.text)
        : denseScore;

      const hybridScore = calculateHybridScore(denseScore, sparseScore, alpha);
      const matchedSnippets = extractMatchingSnippets(p.text, queryTerms);

      if (hybridScore >= minSim || denseScore >= minSim) {
        scoredResults.push({
          chunk,
          similarityScore: hybridScore,
          denseScore,
          sparseScore,
          matchedSnippets,
        });
      }
    }

    // Rank descending by hybrid score
    scoredResults.sort((a, b) => b.similarityScore - a.similarityScore);

    return scoredResults.slice(0, topK).map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }

  /**
   * Deletes all chunk vectors belonging to a specific document
   */
  public async deleteByDocumentId(documentId: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/qdrant/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionName: this.collectionName,
        documentId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to delete document chunks from Qdrant: ${err}`);
    }

    return { success: true };
  }

  /**
   * Deletes a single chunk vector by chunkId
   */
  public async deleteByChunkId(chunkId: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/qdrant/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionName: this.collectionName,
        chunkId,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to delete chunk from Qdrant: ${err}`);
    }

    return { success: true };
  }

  /**
   * Retrieves overall Qdrant vector store statistics
   */
  public async getStats(): Promise<{
    totalIndexedChunks: number;
    totalIndexedDocuments: number;
    collectionName: string;
    connected: boolean;
    embeddingDimension: number;
    distanceMetric: string;
  }> {
    try {
      const res = await fetch('/api/qdrant/stats');
      if (!res.ok) {
        return {
          totalIndexedChunks: 0,
          totalIndexedDocuments: 0,
          collectionName: this.collectionName,
          connected: false,
          embeddingDimension: this.vectorSize,
          distanceMetric: QDRANT_DISTANCE_METRIC,
        };
      }
      const data = await res.json();
      return {
        totalIndexedChunks: data.totalPoints ?? 0,
        totalIndexedDocuments: data.totalDocuments ?? 0,
        collectionName: this.collectionName,
        connected: Boolean(data.connected),
        embeddingDimension: this.vectorSize,
        distanceMetric: QDRANT_DISTANCE_METRIC,
      };
    } catch {
      return {
        totalIndexedChunks: 0,
        totalIndexedDocuments: 0,
        collectionName: this.collectionName,
        connected: false,
        embeddingDimension: this.vectorSize,
        distanceMetric: QDRANT_DISTANCE_METRIC,
      };
    }
  }

  /**
   * Generates real neural vector embeddings and indexes a document's chunks into Qdrant
   */
  public async indexDocument(
    document: DocumentItem,
    onProgress?: IngestionProgressCallback
  ): Promise<boolean> {
    if (!document.chunks || document.chunks.length === 0) return true;
    onProgress?.('EMBEDDING', `Generating neural embeddings (${EMBEDDING_MODEL_NAME})...`, 75);
    const embeddings = await generateEmbeddings(document.chunks);
    onProgress?.('INDEXING', 'Upserting vectors into Qdrant database...', 88);
    const chunksWithVectors = document.chunks.map((chunk, idx) => ({
      chunk,
      embedding: embeddings[idx],
    }));
    await this.upsertChunks(chunksWithVectors);
    return true;
  }

  /**
   * Removes all chunk vectors for a document from Qdrant
   */
  public async removeDocumentChunks(documentId: string): Promise<boolean> {
    const res = await this.deleteByDocumentId(documentId);
    return res.success;
  }

  /**
   * Generates formatted citations from retrieved Qdrant search results
   */
  public generateCitations(results: SearchResult[]): Citation[] {
    return results.map((res, index) => {
      const snippet =
        res.matchedSnippets[0] || res.chunk.text.slice(0, 180).trim() + '...';
      return {
        citationId: `cite-${index + 1}`,
        documentId: res.chunk.documentId,
        filename: res.chunk.filename,
        pageNumber: res.chunk.pageNumber,
        chunkId: res.chunk.chunkId,
        snippet,
        similarityScore: res.similarityScore,
      };
    });
  }
}

function extractMatchingSnippets(text: string, queryTerms: string[]): string[] {
  if (queryTerms.length === 0) return [text.slice(0, 150) + '...'];

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const matched: string[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    const hasTerm = queryTerms.some((term) => lower.includes(term));
    if (hasTerm) {
      matched.push(sentence.trim());
      if (matched.length >= 2) break;
    }
  }

  return matched.length > 0 ? matched : [text.slice(0, 160) + '...'];
}

// Global Singleton Instance
export const globalQdrantStore = new QdrantVectorStore();
