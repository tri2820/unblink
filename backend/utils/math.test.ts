import { expect, test } from "bun:test";
import {
    cosineSimilarity,
    embeddingToArray,
    euclideanDistance,
    dotProduct,
    l2Norm,
    normalize
} from './math';

test("cosineSimilarity - identical vectors", () => {
    const vec = [1, 2, 3];
    const similarity = cosineSimilarity(vec, vec);
    expect(similarity).toBeCloseTo(1.0, 5);
});

test("cosineSimilarity - orthogonal vectors", () => {
    const vec1 = [1, 0];
    const vec2 = [0, 1];
    const similarity = cosineSimilarity(vec1, vec2);
    expect(similarity).toBeCloseTo(0.0, 5);
});

test("cosineSimilarity - opposite vectors", () => {
    const vec1 = [1, 2, 3];
    const vec2 = [-1, -2, -3];
    const similarity = cosineSimilarity(vec1, vec2);
    expect(similarity).toBeCloseTo(-1.0, 5);
});

test("cosineSimilarity - different lengths", () => {
    const vec1 = [1, 2, 3];
    const vec2 = [1, 2];
    const similarity = cosineSimilarity(vec1, vec2);
    expect(similarity).toBe(0);
});

test("cosineSimilarity - undefined vectors", () => {
    const similarity = cosineSimilarity(undefined, [1, 2, 3]);
    expect(similarity).toBe(0);
});

test("cosineSimilarity - zero vectors", () => {
    const vec1 = [0, 0, 0];
    const vec2 = [1, 2, 3];
    const similarity = cosineSimilarity(vec1, vec2);
    expect(similarity).toBe(0);
});

test("embeddingToArray - converts Uint8Array to number array", () => {
    const floatArray = new Float32Array([1.5, -2.3, 0.0, 100.7]);
    const uint8Array = new Uint8Array(floatArray.buffer);
    const result = embeddingToArray(uint8Array);

    // Check length and approximate values (Float32 precision)
    expect(result).toHaveLength(4);
    expect(result[0]).toBeCloseTo(1.5, 4);
    expect(result[1]).toBeCloseTo(-2.3, 4);
    expect(result[2]).toBeCloseTo(0.0, 4);
    expect(result[3]).toBeCloseTo(100.7, 4);
});

test("embeddingToArray - handles empty array", () => {
    const uint8Array = new Uint8Array(0);
    const result = embeddingToArray(uint8Array);
    expect(result).toEqual([]);
});

test("euclideanDistance - identical vectors", () => {
    const vec = [1, 2, 3];
    const distance = euclideanDistance(vec, vec);
    expect(distance).toBeCloseTo(0.0, 5);
});

test("euclideanDistance - simple case", () => {
    const vec1 = [0, 0];
    const vec2 = [3, 4];
    const distance = euclideanDistance(vec1, vec2);
    expect(distance).toBeCloseTo(5.0, 5);
});

test("euclideanDistance - different lengths throws error", () => {
    const vec1 = [1, 2, 3];
    const vec2 = [1, 2];
    expect(() => euclideanDistance(vec1, vec2)).toThrow("Vectors must have same length");
});

test("dotProduct - basic calculation", () => {
    const vec1 = [1, 2, 3];
    const vec2 = [4, 5, 6];
    const result = dotProduct(vec1, vec2);
    expect(result).toBe(32); // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
});

test("dotProduct - orthogonal vectors", () => {
    const vec1 = [1, 0];
    const vec2 = [0, 1];
    const result = dotProduct(vec1, vec2);
    expect(result).toBe(0);
});

test("dotProduct - different lengths throws error", () => {
    const vec1 = [1, 2, 3];
    const vec2 = [1, 2];
    expect(() => dotProduct(vec1, vec2)).toThrow("Vectors must have same length");
});

test("l2Norm - unit vector", () => {
    const vec = [1, 0, 0];
    const norm = l2Norm(vec);
    expect(norm).toBeCloseTo(1.0, 5);
});

test("l2Norm - pythagorean triple", () => {
    const vec = [3, 4];
    const norm = l2Norm(vec);
    expect(norm).toBeCloseTo(5.0, 5);
});

test("l2Norm - zero vector", () => {
    const vec = [0, 0, 0];
    const norm = l2Norm(vec);
    expect(norm).toBeCloseTo(0.0, 5);
});

test("normalize - unit vector remains unchanged", () => {
    const vec = [1, 0, 0];
    const result = normalize(vec);
    expect(result).toEqual([1, 0, 0]);
});

test("normalize - normalizes to unit length", () => {
    const vec = [3, 4];
    const result = normalize(vec);
    expect(result[0]).toBeCloseTo(0.6, 5); // 3/5
    expect(result[1]).toBeCloseTo(0.8, 5); // 4/5
    expect(l2Norm(result)).toBeCloseTo(1.0, 5);
});

test("normalize - zero vector returns copy", () => {
    const vec = [0, 0, 0];
    const result = normalize(vec);
    expect(result).toEqual([0, 0, 0]);
});

test("normalize - negative values", () => {
    const vec = [-3, -4];
    const result = normalize(vec);
    expect(result[0]).toBeCloseTo(-0.6, 5);
    expect(result[1]).toBeCloseTo(-0.8, 5);
    expect(l2Norm(result)).toBeCloseTo(1.0, 5);
});

// Integration test combining multiple functions
test("cosine similarity matches normalized dot product", () => {
    const vec1 = [1, 2, 3, 4];
    const vec2 = [2, 3, 1, 5];

    const similarity = cosineSimilarity(vec1, vec2);
    const normalized1 = normalize(vec1);
    const normalized2 = normalize(vec2);
    const dotProd = dotProduct(normalized1, normalized2);

    expect(similarity).toBeCloseTo(dotProd, 5);
});

// Test with typical embedding dimensions
test("embedding operations with realistic dimensions", () => {
    const dim = 384; // Common embedding dimension
    const vec1 = new Array(dim).fill(0).map(() => Math.random() - 0.5);
    const vec2 = new Array(dim).fill(0).map(() => Math.random() - 0.5);

    // Test all operations work with realistic data
    const similarity = cosineSimilarity(vec1, vec2);
    expect(similarity).toBeGreaterThanOrEqual(-1);
    expect(similarity).toBeLessThanOrEqual(1);

    const distance = euclideanDistance(vec1, vec2);
    expect(distance).toBeGreaterThanOrEqual(0);

    const dot = dotProduct(vec1, vec2);
    expect(typeof dot).toBe('number');

    const norm1 = l2Norm(vec1);
    expect(norm1).toBeGreaterThan(0);

    const normalized = normalize(vec1);
    const normNormalized = l2Norm(normalized);
    expect(normNormalized).toBeCloseTo(1.0, 5);
});