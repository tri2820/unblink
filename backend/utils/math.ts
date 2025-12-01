/**
 * Math utilities for vector operations and similarity calculations
 */

/**
 * Calculate cosine similarity between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Cosine similarity score between -1 and 1
 */
export function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i]!;
    const bVal = b[i]!;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Convert a Uint8Array embedding back to a number array
 * @param embedding Uint8Array containing Float32 values
 * @returns Array of numbers
 */
export function embeddingToArray(embedding: Uint8Array): number[] {
  const floatArray = new Float32Array(embedding.buffer, embedding.byteOffset, embedding.byteLength / 4);
  return Array.from(floatArray);
}

/**
 * Calculate Euclidean distance between two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Euclidean distance
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate dot product of two vectors
 * @param a First vector
 * @param b Second vector
 * @returns Dot product
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!;
  }

  return sum;
}

/**
 * Calculate L2 norm (magnitude) of a vector
 * @param a Vector
 * @returns L2 norm
 */
export function l2Norm(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * a[i]!;
  }
  return Math.sqrt(sum);
}

/**
 * Normalize a vector to unit length
 * @param a Vector to normalize
 * @returns Normalized vector
 */
export function normalize(a: number[]): number[] {
  const norm = l2Norm(a);
  if (norm === 0) {
    return a.slice(); // Return copy if zero vector
  }

  const result = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! / norm;
  }
  return result;
}