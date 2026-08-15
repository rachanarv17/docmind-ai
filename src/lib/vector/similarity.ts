/**
 * Mathematical vector operations and semantic similarity utilities
 */

/**
 * Computes dot product between two numeric vectors
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Calculates Euclidean norm (magnitude) of a vector
 */
export function vectorNorm(v: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) {
    sumSq += v[i] * v[i];
  }
  return Math.sqrt(sumSq);
}

/**
 * Normalizes vector to unit length (L2 norm)
 */
export function normalizeVector(v: number[]): number[] {
  const norm = vectorNorm(v);
  if (norm === 0) return v.slice();
  return v.map((val) => val / norm);
}

/**
 * Computes Cosine Similarity between two vectors: (A . B) / (||A|| * ||B||)
 * Returns a value bounded between 0.0 and 1.0 (clamped for non-negative embeddings)
 */
export function cosineSimilarity(a: number[], b: number[], normA?: number, normB?: number): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: vector A (${a.length}) vs vector B (${b.length})`);
  }
  const nA = normA ?? vectorNorm(a);
  const nB = normB ?? vectorNorm(b);

  if (nA === 0 || nB === 0) return 0;

  const dot = dotProduct(a, b);
  const rawCos = dot / (nA * nB);
  // Clamp between 0.0 and 1.0
  return Math.max(0, Math.min(1, (rawCos + 1) / 2));
}

/**
 * DEV_FALLBACK_ONLY:
 * Handcrafted n-gram character/sub-word hashing heuristic.
 * WARNING: This is NOT a neural embedding model. It is solely used for isolated offline unit tests.
 */
export function DEV_FALLBACK_ONLY_generateSemanticVector(text: string, dimensions = 768): number[] {
  const vector = new Array(dimensions).fill(0);
  if (!text || !text.trim()) return normalizeVector(vector);

  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);

  // 1. Unigram & Bigram word frequency hashing with Murmur-style distribution
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordHash = hashString(word);
    const pos = Math.abs(wordHash) % dimensions;
    const sign = wordHash % 2 === 0 ? 1 : -1;
    vector[pos] += sign * (1 + Math.log(word.length));

    // Bigram
    if (i < words.length - 1) {
      const bigram = `${word}_${words[i + 1]}`;
      const biHash = hashString(bigram);
      const biPos = Math.abs(biHash) % dimensions;
      const biSign = biHash % 2 === 0 ? 1.2 : -1.2;
      vector[biPos] += biSign * 1.5;
    }
  }

  // 2. Character 3-gram and 4-gram sliding window for typo resilience and morphology
  for (let n = 3; n <= 4; n++) {
    for (let i = 0; i <= clean.length - n; i++) {
      const ngram = clean.substring(i, i + n);
      const ngHash = hashString(ngram);
      const ngPos = Math.abs(ngHash) % dimensions;
      const ngSign = ngHash % 2 === 0 ? 0.8 : -0.8;
      vector[ngPos] += ngSign * 0.5;
    }
  }

  return normalizeVector(vector);
}

/**
 * @deprecated Use real neural embeddings via embeddingService.ts in production.
 * Kept strictly for backward compatibility with existing unit test assertions.
 */
export function generateDeterministicSemanticVector(text: string, dimensions = 384): number[] {
  return DEV_FALLBACK_ONLY_generateSemanticVector(text, dimensions);
}

/**
 * Simple 32-bit integer string hash function
 */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

/**
 * PROTOTYPE BM25:
 * Calculates chunk-level term frequency lexical score for hybrid retrieval prototyping.
 * Note: Full corpus-level IDF index is scheduled for Phase 3C.
 */
export function calculateBM25Score(
  query: string,
  docText: string,
  avgDocLength = 200,
  k1 = 1.2,
  b = 0.75
): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (queryTerms.length === 0) return 0;

  const docWords = docText.toLowerCase().split(/\s+/).filter(Boolean);
  const docLength = docWords.length;
  if (docLength === 0) return 0;

  // Build term frequency map for document
  const tfMap = new Map<string, number>();
  docWords.forEach((word) => {
    tfMap.set(word, (tfMap.get(word) || 0) + 1);
  });

  let score = 0;
  for (const term of queryTerms) {
    const tf = tfMap.get(term) || 0;
    if (tf > 0) {
      // Okapi BM25 TF component
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLength / Math.max(1, avgDocLength)));
      score += numerator / Math.max(1, denominator);
    }
  }

  // Normalize score between 0.0 and 1.0 based on query length
  const maxPossible = queryTerms.length * (k1 + 1);
  return maxPossible > 0 ? Math.min(1, score / maxPossible) : 0;
}

/**
 * Combines dense semantic vector similarity and sparse BM25 lexical score
 * Score = alpha * DenseScore + (1 - alpha) * SparseScore
 */
export function calculateHybridScore(
  denseScore: number,
  sparseScore: number,
  alpha = 0.7
): number {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return clampedAlpha * denseScore + (1 - clampedAlpha) * sparseScore;
}

