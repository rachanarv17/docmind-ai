import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  dotProduct,
  vectorNorm,
  normalizeVector,
  cosineSimilarity,
  generateDeterministicSemanticVector,
  calculateBM25Score,
  calculateHybridScore,
} from './similarity';
import { globalVectorStore, DEV_FALLBACK_ONLY_InMemoryVectorStore } from './vectorStore';
import { DocumentChunk, DocumentItem, UserSettings } from '../../types';
import { executeRAGQuery } from './ragService';
import { DEFAULT_CHUNKING_CONFIG } from '../ingestion/chunker';
import { DEFAULT_VECTOR_SEARCH_CONFIG } from './vectorStore';
import {
  EMBEDDING_MODEL_NAME,
  EMBEDDING_DIMENSION,
  EMBEDDING_BATCH_SIZE,
  generateEmbedding,
  generateEmbeddings,
} from './embeddingService';
import {
  QdrantVectorStore,
  deterministicChunkUUID,
  QDRANT_COLLECTION_NAME,
  QDRANT_DISTANCE_METRIC,
} from './qdrantStore';

describe('Phase 3: Vector Embeddings & Hybrid RAG Retrieval Engine', () => {
  beforeEach(() => {
    globalVectorStore.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Vector Math & Similarity Metrics', () => {
    it('should compute dot product and vector norm accurately', () => {
      const a = [3, 4];
      expect(vectorNorm(a)).toBe(5);

      const b = [1, 2];
      expect(dotProduct(a, b)).toBe(3 * 1 + 4 * 2); // 11
    });

    it('should normalize vectors to unit length L2 norm', () => {
      const v = [10, 20, 30];
      const normV = normalizeVector(v);
      expect(vectorNorm(normV)).toBeCloseTo(1.0, 5);
    });

    it('should compute exact cosine similarity bounds', () => {
      const a = normalizeVector([1, 0, 0]);
      const b = normalizeVector([1, 0, 0]);
      const c = normalizeVector([0, 1, 0]);

      // Identical vectors should have maximum similarity
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);

      // Orthogonal vectors
      expect(cosineSimilarity(a, c)).toBeCloseTo(0.5, 5);
    });

    it('should generate deterministic semantic vectors with fixed 384 dimensions', () => {
      const textA = 'Enterprise security policy with AES-256 encryption';
      const vecA1 = generateDeterministicSemanticVector(textA);
      const vecA2 = generateDeterministicSemanticVector(textA);

      expect(vecA1.length).toBe(384);
      expect(vecA2.length).toBe(384);

      // Deterministic identical output
      for (let i = 0; i < 384; i++) {
        expect(vecA1[i]).toBe(vecA2[i]);
      }

      // Semantic proximity: related text should have higher similarity than unrelated text
      const textB = 'Enterprise cryptographic security and AES encryption standards';
      const textC = 'Chocolate chip cookie bakery recipe with butter and sugar';

      const vecB = generateDeterministicSemanticVector(textB);
      const vecC = generateDeterministicSemanticVector(textC);

      const simAB = cosineSimilarity(vecA1, vecB);
      const simAC = cosineSimilarity(vecA1, vecC);

      expect(simAB).toBeGreaterThan(simAC);
    });

    it('should compute Okapi BM25 scores accurately', () => {
      const query = 'revenue performance';
      const matchingDoc = 'Q3 financial revenue performance showed a 24% increase in net enterprise profit.';
      const nonMatchingDoc = 'Standard employee onboarding procedures and handbook guidelines.';

      const scoreMatch = calculateBM25Score(query, matchingDoc);
      const scoreNonMatch = calculateBM25Score(query, nonMatchingDoc);

      expect(scoreMatch).toBeGreaterThan(0.3);
      expect(scoreNonMatch).toBe(0);
    });

    it('should calculate hybrid scores combining dense and sparse weights', () => {
      const dense = 0.8;
      const sparse = 0.4;
      const alpha = 0.7; // 70% dense + 30% sparse
      const expected = 0.7 * 0.8 + 0.3 * 0.4; // 0.56 + 0.12 = 0.68

      expect(calculateHybridScore(dense, sparse, alpha)).toBeCloseTo(expected, 4);
    });
  });

  describe('2. DEV_FALLBACK_ONLY In-Memory Vector Store Indexing & Retrieval', () => {
    const mockChunks: DocumentChunk[] = [
      {
        chunkId: 'chunk-sec-001',
        documentId: 'doc-security',
        filename: 'security_policy.pdf',
        pageNumber: 1,
        sectionIndex: 0,
        chunkIndex: 0,
        text: 'All company data in transit and at rest must use AES-256 encryption. Multi-factor authentication is mandatory for all infrastructure access.',
        charCount: 142,
        tokenEstimate: 36,
        startChar: 0,
        endChar: 142,
      },
      {
        chunkId: 'chunk-fin-001',
        documentId: 'doc-financial',
        filename: 'q3_earnings.pdf',
        pageNumber: 3,
        sectionIndex: 2,
        chunkIndex: 0,
        text: 'Third quarter enterprise cloud revenue grew to $142.5 million, representing a 28% year-over-year expansion across North America.',
        charCount: 130,
        tokenEstimate: 33,
        startChar: 0,
        endChar: 130,
      },
      {
        chunkId: 'chunk-tech-001',
        documentId: 'doc-technical',
        filename: 'architecture_spec.md',
        sectionIndex: 1,
        chunkIndex: 0,
        text: 'System architecture utilizes event-driven microservices running on Kubernetes clusters with sub-10ms inter-service latency.',
        charCount: 125,
        tokenEstimate: 31,
        startChar: 0,
        endChar: 125,
      },
    ];

    it('should index chunks and retrieve top-1 chunk matching financial revenue query', async () => {
      await globalVectorStore.indexChunks(mockChunks);

      const stats = globalVectorStore.getStats();
      expect(stats.totalIndexedChunks).toBe(3);
      expect(stats.totalIndexedDocuments).toBe(3);

      const results = await globalVectorStore.search('enterprise cloud revenue growth');

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunk.chunkId).toBe('chunk-fin-001');
      expect(results[0].chunk.filename).toBe('q3_earnings.pdf');
      expect(results[0].chunk.pageNumber).toBe(3);
      expect(results[0].similarityScore).toBeGreaterThan(0.4);
    });

    it('should filter search results by document filename when specified', async () => {
      await globalVectorStore.indexChunks(mockChunks);

      const results = await globalVectorStore.search('security encryption', {
        docFilter: 'security_policy.pdf',
      });

      expect(results.length).toBe(1);
      expect(results[0].chunk.filename).toBe('security_policy.pdf');
    });

    it('should generate verifiable citations from search results', async () => {
      await globalVectorStore.indexChunks(mockChunks);
      const results = await globalVectorStore.search('Kubernetes microservices latency');

      const citations = globalVectorStore.generateCitations(results);

      expect(citations.length).toBeGreaterThanOrEqual(1);
      expect(citations[0].citationId).toBe('cite-1');
      expect(citations[0].filename).toBe('architecture_spec.md');
      expect(citations[0].chunkId).toBe('chunk-tech-001');
    });
  });

  describe('3. Real Embedding Service Configuration & Dimensionality (Phase 3B)', () => {
    it('should configure the official Google gemini-embedding-2 model with 768 dimensions', () => {
      expect(EMBEDDING_MODEL_NAME).toBe('gemini-embedding-2');
      expect(EMBEDDING_DIMENSION).toBe(768);
      expect(EMBEDDING_BATCH_SIZE).toBe(16);
    });

    it('should handle missing Gemini API key with descriptive error', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            status: 'no_api_key',
            message: 'GEMINI_API_KEY is not configured',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      await expect(generateEmbedding('Test document chunk')).rejects.toThrow(
        /GEMINI_API_KEY is not configured/
      );
    });

    it('should return real 768-dimensional vector when embedding endpoint responds successfully', async () => {
      const mockVector = new Array(768).fill(0.035);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            status: 'ok',
            model: 'gemini-embedding-2',
            dimension: 768,
            embeddings: [mockVector],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const vector = await generateEmbedding('Enterprise cloud architecture');
      expect(vector.length).toBe(768);
      expect(vector[0]).toBe(0.035);
    });

    it('should batch multiple chunks through generateEmbeddings', async () => {
      const mockVectorA = new Array(768).fill(0.01);
      const mockVectorB = new Array(768).fill(0.02);

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            status: 'ok',
            model: 'gemini-embedding-2',
            embeddings: [mockVectorA, mockVectorB],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const vectors = await generateEmbeddings(['Chunk text 1', 'Chunk text 2']);
      expect(vectors.length).toBe(2);
      expect(vectors[0].length).toBe(768);
      expect(vectors[1].length).toBe(768);
    });
  });

  describe('4. Qdrant Vector Store Deterministic UUID & Collection Configuration (Phase 3B)', () => {
    it('should generate deterministic RFC-4122 compliant UUIDs for chunk idempotency', () => {
      const chunkId = 'doc-123-sec-0-c-0';
      const uuid1 = deterministicChunkUUID(chunkId);
      const uuid2 = deterministicChunkUUID(chunkId);
      const uuidOther = deterministicChunkUUID('doc-123-sec-0-c-1');

      expect(uuid1).toBe(uuid2);
      expect(uuid1).not.toBe(uuidOther);
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should configure Qdrant collection constants for Cosine distance', () => {
      expect(QDRANT_COLLECTION_NAME).toBe('docmind_chunks');
      expect(QDRANT_DISTANCE_METRIC).toBe('Cosine');
    });

    it('should preserve full metadata payload in Qdrant store during upsert', async () => {
      const store = new QdrantVectorStore();
      let capturedBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ success: true, count: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const mockChunk: DocumentChunk = {
        chunkId: 'chk-audit-1',
        documentId: 'doc-audit-1',
        filename: 'compliance_report.pdf',
        pageNumber: 2,
        sectionIndex: 1,
        chunkIndex: 0,
        text: 'SOC2 Type II compliance achieved with zero critical findings.',
        charCount: 62,
        tokenEstimate: 16,
        startChar: 0,
        endChar: 62,
      };
      const mockEmbedding = new Array(768).fill(0.05);

      const res = await store.upsertChunks([{ chunk: mockChunk, embedding: mockEmbedding }]);
      expect(res.success).toBe(true);
      expect(capturedBody.collectionName).toBe('docmind_chunks');
      expect(capturedBody.points.length).toBe(1);

      const payload = capturedBody.points[0].payload;
      expect(payload.documentId).toBe('doc-audit-1');
      expect(payload.chunkId).toBe('chk-audit-1');
      expect(payload.filename).toBe('compliance_report.pdf');
      expect(payload.pageNumber).toBe(2);
      expect(payload.text).toBe('SOC2 Type II compliance achieved with zero critical findings.');
      expect(payload.tokenEstimate).toBe(16);
    });

    it('should delete vectors by documentId and chunkId', async () => {
      const store = new QdrantVectorStore();
      let capturedDeleteDocBody: any = null;

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
        capturedDeleteDocBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await store.deleteByDocumentId('doc-to-delete-123');
      expect(capturedDeleteDocBody.documentId).toBe('doc-to-delete-123');
    });

    it('should handle Qdrant search retrieval and document filtering', async () => {
      const store = new QdrantVectorStore();
      const mockPoints = [
        {
          id: 'point-1',
          score: 0.92,
          payload: {
            documentId: 'doc-rag-1',
            chunkId: 'chk-rag-1',
            filename: 'benchmarks.md',
            pageNumber: 1,
            sectionIndex: 0,
            chunkIndex: 0,
            text: 'Inference latency is 45ms on TPU v5e clusters.',
            charCount: 46,
            tokenEstimate: 12,
            startChar: 0,
            endChar: 46,
            indexedTimestamp: Date.now(),
          },
        },
      ];

      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ points: mockPoints }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const queryVector = new Array(768).fill(0.05);
      const results = await store.search(queryVector, {
        topK: 4,
        minSimilarity: 0.3,
        docFilter: 'benchmarks.md',
        queryText: 'latency benchmark',
      });

      expect(results.length).toBe(1);
      expect(results[0].chunk.chunkId).toBe('chk-rag-1');
      expect(results[0].chunk.filename).toBe('benchmarks.md');
      expect(results[0].similarityScore).toBeGreaterThan(0.5);

      const citations = store.generateCitations(results);
      expect(citations.length).toBe(1);
      expect(citations[0].chunkId).toBe('chk-rag-1');
      expect(citations[0].filename).toBe('benchmarks.md');
    });
  });

  describe('5. Full Grounded RAG Pipeline & Graceful Offline Behavior (Phase 3B)', () => {
    const testDoc: DocumentItem = {
      id: 'doc-ai-spec',
      name: 'ai_spec.md',
      type: 'MARKDOWN',
      mimeType: 'text/markdown',
      sizeBytes: 300,
      formattedSize: '300 B',
      uploadTimestamp: Date.now(),
      formattedDate: 'Today',
      status: 'PROCESSED',
      pageCount: 1,
      sectionCount: 1,
      characterCount: 180,
      wordCount: 30,
      chunkCount: 1,
      sections: [
        {
          documentId: 'doc-ai-spec',
          filename: 'ai_spec.md',
          sectionIndex: 0,
          title: 'Latency Benchmarks',
          text: 'The transformer model achieves a 99.4% inference reliability with 45ms P95 latency on dedicated TPU accelerators.',
          charCount: 116,
          wordCount: 18,
        },
      ],
      chunks: [
        {
          chunkId: 'chunk-ai-spec-s0-c0',
          documentId: 'doc-ai-spec',
          filename: 'ai_spec.md',
          sectionIndex: 0,
          chunkIndex: 0,
          text: 'The transformer model achieves a 99.4% inference reliability with 45ms P95 latency on dedicated TPU accelerators.',
          charCount: 116,
          tokenEstimate: 29,
          startChar: 0,
          endChar: 116,
        },
      ],
    };

    const mockSettings: UserSettings = {
      modelPreference: 'gemini-flash',
      autoSummarize: true,
      theme: 'light',
      extractKeywords: true,
      confidenceThreshold: 85,
      chunkingConfig: DEFAULT_CHUNKING_CONFIG,
      vectorSearchConfig: DEFAULT_VECTOR_SEARCH_CONFIG,
    };

    it('should return clear identifiable error when vector search service / Qdrant is disconnected', async () => {
      // In offline / disconnected mode (no mock for fetch or fetch rejected)
      const response = await executeRAGQuery(
        'What is the inference latency?',
        [testDoc],
        mockSettings
      );

      expect(response.answer).toBe(
        'Semantic retrieval is temporarily unavailable because the vector search service is not connected.'
      );
      expect(response.isFallback).toBe(true);
    });

    it('should execute full RAG query and return grounded answer with citations when connected', async () => {
      const mockVector = new Array(768).fill(0.04);
      const mockPoints = [
        {
          id: 'point-ai-spec',
          score: 0.95,
          payload: {
            documentId: 'doc-ai-spec',
            chunkId: 'chunk-ai-spec-s0-c0',
            filename: 'ai_spec.md',
            pageNumber: 1,
            sectionIndex: 0,
            chunkIndex: 0,
            text: 'The transformer model achieves a 99.4% inference reliability with 45ms P95 latency on dedicated TPU accelerators.',
            charCount: 116,
            tokenEstimate: 29,
            startChar: 0,
            endChar: 116,
            indexedTimestamp: Date.now(),
          },
        },
      ];

      // Mock embeddings endpoint, Qdrant search endpoint, and Chat endpoint
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
        const url = String(input?.url || input || '');
        if (url.includes('/api/embeddings')) {
          return new Response(
            JSON.stringify({
              status: 'ok',
              model: 'gemini-embedding-2',
              dimension: 768,
              embeddings: [mockVector],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/api/qdrant/search')) {
          return new Response(JSON.stringify({ points: mockPoints }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/api/chat')) {
          return new Response(
            JSON.stringify({
              reply:
                'Based on the specifications, the model achieves a 45ms P95 latency on dedicated TPU accelerators [cite-1].',
              modelUsed: 'gemini-flash',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const response = await executeRAGQuery(
        'What is the inference latency?',
        [testDoc],
        mockSettings
      );

      expect(response.answer).toBeDefined();
      expect(response.answer).toContain('45ms');
      expect(response.sourceDoc).toContain('ai_spec.md');
      expect(response.sourceChunks).toContain('chunk-ai-spec-s0-c0');
      expect(response.retrievedResults.length).toBe(1);
      expect(response.citations.length).toBe(1);
      expect(response.citations[0].chunkId).toBe('chunk-ai-spec-s0-c0');
      expect(response.isRetrievedViaQdrant).toBe(true);
    });
  });
});

