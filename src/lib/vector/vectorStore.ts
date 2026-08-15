import { DocumentChunk, ChunkVector, SearchResult, Citation, VectorSearchConfig } from '../../types';
import {
  DEV_FALLBACK_ONLY_generateSemanticVector,
  cosineSimilarity,
  vectorNorm,
  calculateBM25Score,
  calculateHybridScore,
} from './similarity';

export const DEFAULT_VECTOR_SEARCH_CONFIG: VectorSearchConfig = {
  topK: 4,
  minSimilarity: 0.35,
  hybridAlpha: 0.7, // 70% dense semantic vector + 30% BM25 keyword matching
  embeddingModel: 'gemini-embedding-2',
};

/**
 * DEV_FALLBACK_ONLY:
 * In-memory vector store using handcrafted heuristic n-gram hashing.
 * WARNING: This is NOT used in the production retrieval path. It is solely retained
 * for isolated local offline unit test fixtures.
 */
export class DEV_FALLBACK_ONLY_InMemoryVectorStore {
  private chunkVectors = new Map<string, ChunkVector>();
  private chunksMap = new Map<string, DocumentChunk>();

  /**
   * Clears entire index
   */
  public clear(): void {
    this.chunkVectors.clear();
    this.chunksMap.clear();
  }

  /**
   * Indexes a collection of document chunks, generating heuristic embeddings
   */
  public async indexChunks(chunks: DocumentChunk[]): Promise<ChunkVector[]> {
    const vectors: ChunkVector[] = [];

    for (const chunk of chunks) {
      this.chunksMap.set(chunk.chunkId, chunk);

      // Check if already indexed
      if (this.chunkVectors.has(chunk.chunkId)) {
        vectors.push(this.chunkVectors.get(chunk.chunkId)!);
        continue;
      }

      // Generate embedding vector using isolated dev heuristic
      const embedding = DEV_FALLBACK_ONLY_generateSemanticVector(chunk.text, 384);
      const norm = vectorNorm(embedding);

      const chunkVector: ChunkVector = {
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        filename: chunk.filename,
        pageNumber: chunk.pageNumber,
        embedding,
        norm,
      };

      this.chunkVectors.set(chunk.chunkId, chunkVector);
      vectors.push(chunkVector);
    }

    return vectors;
  }

  /**
   * Deletes chunks associated with a specific document
   */
  public removeDocumentChunks(documentId: string): void {
    for (const [chunkId, chunk] of this.chunksMap.entries()) {
      if (chunk.documentId === documentId) {
        this.chunksMap.delete(chunkId);
        this.chunkVectors.delete(chunkId);
      }
    }
  }

  /**
   * Performs hybrid semantic vector + BM25 keyword retrieval across indexed chunks
   */
  public async search(
    query: string,
    options?: {
      topK?: number;
      minSimilarity?: number;
      docFilter?: string; // Document filename or 'all'
      hybridAlpha?: number;
    }
  ): Promise<SearchResult[]> {
    if (!query || !query.trim()) return [];

    const topK = options?.topK ?? DEFAULT_VECTOR_SEARCH_CONFIG.topK;
    const minSim = options?.minSimilarity ?? DEFAULT_VECTOR_SEARCH_CONFIG.minSimilarity;
    const alpha = options?.hybridAlpha ?? DEFAULT_VECTOR_SEARCH_CONFIG.hybridAlpha;
    const docFilter = options?.docFilter && options.docFilter !== 'all' ? options.docFilter : null;

    // Generate query embedding
    const queryVector = DEV_FALLBACK_ONLY_generateSemanticVector(query, 384);
    const queryNorm = vectorNorm(queryVector);

    // Calculate average doc length across index for BM25
    let totalWords = 0;
    let totalDocs = 0;
    for (const chunk of this.chunksMap.values()) {
      totalWords += chunk.text.split(/\s+/).length;
      totalDocs++;
    }
    const avgDocLength = totalDocs > 0 ? totalWords / totalDocs : 200;

    const scoredResults: {
      chunk: DocumentChunk;
      similarityScore: number;
      denseScore: number;
      sparseScore: number;
      matchedSnippets: string[];
    }[] = [];

    const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    for (const [chunkId, vector] of this.chunkVectors.entries()) {
      const chunk = this.chunksMap.get(chunkId);
      if (!chunk) continue;

      // Filter by document if specified
      if (docFilter && chunk.filename !== docFilter) {
        continue;
      }

      // Dense cosine similarity
      const denseScore = cosineSimilarity(queryVector, vector.embedding, queryNorm, vector.norm);

      // Sparse BM25 score
      const sparseScore = calculateBM25Score(query, chunk.text, avgDocLength);

      // Hybrid combination
      const hybridScore = calculateHybridScore(denseScore, sparseScore, alpha);

      // Extract relevant snippet matches
      const matchedSnippets = extractMatchingSnippets(chunk.text, queryTerms);

      if (hybridScore >= minSim || sparseScore > 0.5 || denseScore > 0.6) {
        scoredResults.push({
          chunk,
          similarityScore: hybridScore,
          denseScore,
          sparseScore,
          matchedSnippets,
        });
      }
    }

    // Rank by hybrid similarity score descending
    scoredResults.sort((a, b) => b.similarityScore - a.similarityScore);

    // Return Top-K with rank
    return scoredResults.slice(0, topK).map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }

  /**
   * Generates formatted citations from search results
   */
  public generateCitations(results: SearchResult[]): Citation[] {
    return results.map((res, index) => {
      const snippet = res.matchedSnippets[0] || res.chunk.text.slice(0, 180).trim() + '...';
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

  /**
   * Returns index statistics
   */
  public getStats(): { totalIndexedChunks: number; totalIndexedDocuments: number } {
    const docIds = new Set<string>();
    for (const chunk of this.chunksMap.values()) {
      docIds.add(chunk.documentId);
    }
    return {
      totalIndexedChunks: this.chunkVectors.size,
      totalIndexedDocuments: docIds.size,
    };
  }
}

/**
 * @deprecated Retained strictly for backwards-compatible test imports. Production code uses globalQdrantStore.
 */
export class InMemoryVectorStore extends DEV_FALLBACK_ONLY_InMemoryVectorStore {}

/**
 * Extracts 1-2 sentence snippets around matched query terms
 */
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

// Global Singleton Instance (DEV_FALLBACK_ONLY)
export const globalVectorStore = new DEV_FALLBACK_ONLY_InMemoryVectorStore();

