import { DocumentItem, SearchResult, Citation, UserSettings } from '../../types';
import { generateEmbedding, EMBEDDING_MODEL_NAME } from './embeddingService';
import { globalQdrantStore } from './qdrantStore';

export interface RAGAnswerResponse {
  answer: string;
  sourceDoc: string;
  sourceChunks: string[];
  retrievedResults: SearchResult[];
  citations: Citation[];
  modelUsed: string;
  isFallback?: boolean;
  isRetrievedViaQdrant?: boolean;
}

/**
 * Executes full RAG pipeline:
 * 1. Generates real neural vector embedding for user query (gemini-embedding-2)
 * 2. Performs semantic retrieval + BM25 hybrid ranking in persistent Qdrant vector DB
 * 3. Builds grounded context window strictly from top-K retrieved chunks
 * 4. Calls server-side Gemini API with strict citation rules
 * 5. Returns grounded answer with structured citations
 */
export async function executeRAGQuery(
  query: string,
  documents: DocumentItem[],
  settings: UserSettings,
  docFilter = 'all'
): Promise<RAGAnswerResponse> {
  if (!query || !query.trim()) {
    return {
      answer: 'Please enter a valid question.',
      sourceDoc: 'None',
      sourceChunks: [],
      retrievedResults: [],
      citations: [],
      modelUsed: settings.modelPreference,
    };
  }

  let queryVector: number[];
  try {
    // 1. Generate query embedding using the same embedding model (gemini-embedding-2)
    queryVector = await generateEmbedding(query);
  } catch (err: unknown) {
    console.error('Failed to generate query embedding:', err);
    return {
      answer: 'Semantic retrieval is temporarily unavailable because the vector search service is not connected.',
      sourceDoc: 'None',
      sourceChunks: [],
      retrievedResults: [],
      citations: [],
      modelUsed: settings.modelPreference,
      isFallback: true,
    };
  }

  // 2. Perform semantic search in persistent Qdrant vector store
  let retrievedResults: SearchResult[] = [];
  try {
    retrievedResults = await globalQdrantStore.search(queryVector, {
      topK: settings.vectorSearchConfig.topK,
      minSimilarity: settings.vectorSearchConfig.minSimilarity,
      hybridAlpha: settings.vectorSearchConfig.hybridAlpha,
      docFilter,
      queryText: query,
    });
  } catch (err: unknown) {
    console.error('Failed to query Qdrant vector store:', err);
    return {
      answer: 'Semantic retrieval is temporarily unavailable because the vector search service is not connected.',
      sourceDoc: 'None',
      sourceChunks: [],
      retrievedResults: [],
      citations: [],
      modelUsed: settings.modelPreference,
      isFallback: true,
    };
  }

  // If no chunks match the query threshold
  if (retrievedResults.length === 0) {
    const scopeLabel =
      docFilter !== 'all' ? `document "${docFilter}"` : `all ${documents.length} ingested documents`;
    return {
      answer: `No relevant content was found in ${scopeLabel} matching your query: "${query}".\n\nTry lowering the similarity threshold in Settings or verify that the document is indexed.`,
      sourceDoc: docFilter !== 'all' ? docFilter : 'None',
      sourceChunks: [],
      retrievedResults: [],
      citations: [],
      modelUsed: settings.modelPreference,
      isRetrievedViaQdrant: true,
    };
  }

  // 3. Formulate grounded context blocks
  const contextChunks = retrievedResults.map((r, i) => ({
    id: r.chunk.chunkId,
    rank: i + 1,
    filename: r.chunk.filename,
    pageNumber: r.chunk.pageNumber,
    similarityScore: (r.similarityScore * 100).toFixed(1) + '%',
    text: r.chunk.text,
  }));

  const citations = globalQdrantStore.generateCitations(retrievedResults);
  const sourceDoc =
    docFilter !== 'all'
      ? docFilter
      : retrievedResults[0].chunk.filename +
        (retrievedResults.length > 1 ? ` (+${retrievedResults.length - 1} more)` : '');
  const sourceChunks = retrievedResults.map((r) => r.chunk.chunkId);

  // 4. Send grounded context to server Gemini API
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: query,
        contextChunks,
        modelPreference: settings.modelPreference,
        confidenceThreshold: settings.confidenceThreshold,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.answer) {
        return {
          answer: data.answer,
          sourceDoc,
          sourceChunks,
          retrievedResults,
          citations,
          modelUsed: data.modelUsed || settings.modelPreference,
          isRetrievedViaQdrant: true,
        };
      }
    }
  } catch (err) {
    console.warn('Server chat API unavailable, utilizing grounded fallback synthesis:', err);
  }

  // 5. High-fidelity Grounded Client Synthesis (Local grounded formatter from real retrieved Qdrant chunks)
  const localAnswer = generateLocalGroundedAnswer(query, retrievedResults);

  return {
    answer: localAnswer,
    sourceDoc,
    sourceChunks,
    retrievedResults,
    citations,
    modelUsed: `${settings.modelPreference} (Grounded Qdrant Neural Vector Engine)`,
    isFallback: true,
    isRetrievedViaQdrant: true,
  };
}

/**
 * Grounded fallback formatter based directly on retrieved Qdrant chunks
 */
function generateLocalGroundedAnswer(query: string, results: SearchResult[]): string {
  const topResult = results[0];
  const pageLabel = topResult.chunk.pageNumber
    ? `Page ${topResult.chunk.pageNumber}`
    : `Section ${topResult.chunk.sectionIndex + 1}`;

  let answer = `Based on the retrieved document **${topResult.chunk.filename}** (${pageLabel}, similarity: ${(topResult.similarityScore * 100).toFixed(1)}%):\n\n`;

  if (topResult.matchedSnippets.length > 0) {
    answer += `> "${topResult.matchedSnippets.join(' ')}"\n\n`;
  }

  answer += `${topResult.chunk.text.trim()}\n\n`;

  if (results.length > 1) {
    answer += `### Additional Grounded Evidence:\n`;
    for (let i = 1; i < results.length; i++) {
      const res = results[i];
      const pLabel = res.chunk.pageNumber
        ? `Page ${res.chunk.pageNumber}`
        : `Section ${res.chunk.sectionIndex + 1}`;
      answer += `- **${res.chunk.filename}** (${pLabel}, ${(res.similarityScore * 100).toFixed(1)}% match): \`${res.chunk.chunkId}\`\n`;
    }
  }

  return answer;
}

