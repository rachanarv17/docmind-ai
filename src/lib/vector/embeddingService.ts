import { DocumentChunk } from '../../types';
import { DEV_FALLBACK_ONLY_generateSemanticVector } from './similarity';

/**
 * DocMind AI Embedding Service
 * Centralized service for generating real dense neural embeddings using Google gemini-embedding-2.
 *
 * NOTE: Both document chunks and user queries MUST use the same embedding model and dimensionality.
 */

export const EMBEDDING_MODEL_NAME = 'gemini-embedding-2';
export const EMBEDDING_DIMENSION = 768;
export const EMBEDDING_BATCH_SIZE = 16;

/**
 * Generates a real neural vector embedding for a single text string
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  const response = await fetch('/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding API request failed (${response.status}): ${errText}`);
  }

  const data = await response.json();

  if (data.status === 'no_api_key') {
    throw new Error(
      'Real neural embedding generation failed: GEMINI_API_KEY is not configured on the server. Please configure your API key in settings or .env to generate gemini-embedding-2 vectors.'
    );
  }

  if (data.error) {
    throw new Error(`Embedding generation error: ${data.error}`);
  }

  const vector = data.embeddings?.[0] || data.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Invalid vector returned from embedding service: expected float array');
  }

  if (vector.length !== EMBEDDING_DIMENSION) {
    console.warn(`Vector dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${vector.length}`);
  }

  return vector;
}

/**
 * Generates real neural vector embeddings for a batch of strings or DocumentChunks
 */
export async function generateEmbeddings(
  items: (string | DocumentChunk)[]
): Promise<number[][]> {
  if (items.length === 0) return [];

  const rawTexts = items.map((item) => (typeof item === 'string' ? item : item.text));
  const results: number[][] = [];

  for (let i = 0; i < rawTexts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = rawTexts.slice(i, i + EMBEDDING_BATCH_SIZE);

    const response = await fetch('/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Batch embedding API request failed (${response.status}): ${errText}`);
    }

    const data = await response.json();

    if (data.status === 'no_api_key') {
      throw new Error(
        'Batch neural embedding generation failed: GEMINI_API_KEY is not configured on the server. Real embeddings require a valid API key.'
      );
    }

    if (data.error) {
      throw new Error(`Batch embedding generation error: ${data.error}`);
    }

    if (!Array.isArray(data.embeddings)) {
      throw new Error('Invalid batch embedding response structure: missing embeddings array');
    }

    results.push(...data.embeddings);
  }

  return results;
}

/**
 * DEV_FALLBACK_ONLY:
 * Isolated heuristic pseudo-vector generator strictly reserved for offline unit testing.
 * NEVER use in production ingestion or retrieval paths.
 */
export function DEV_FALLBACK_ONLY_generateEmbedding(
  text: string,
  dimensions = EMBEDDING_DIMENSION
): number[] {
  return DEV_FALLBACK_ONLY_generateSemanticVector(text, dimensions);
}
