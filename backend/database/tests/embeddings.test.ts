import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from '../database';
import { DATABASE_EMBEDDING_DIMENSION } from '../../appdir';
import {
    createEmbedding,
    getEmbeddingById,
    getEmbeddingsByType,
    getEmbeddingsByRefId,
    getAllEmbeddings,
    updateEmbedding,
    deleteEmbedding,
    getEmbeddingsBySimilarity,
    getEmbeddingByRefAndType
} from '../utils';

let testEmbeddingId: string;
let testRefId: string;

beforeAll(async () => {
    await getDb();
    testRefId = crypto.randomUUID();
});

afterAll(async () => {
    if (testEmbeddingId) await deleteEmbedding(testEmbeddingId);
    await closeDb();
});

test("Create a new embedding entry", async () => {
    const dummyEmbedding = Array.from({ length: DATABASE_EMBEDDING_DIMENSION }, () => Math.random());

    testEmbeddingId = crypto.randomUUID();
    await createEmbedding({
        id: testEmbeddingId,
        value: dummyEmbedding,
        type: 'test_embedding',
        ref_key: { id: testRefId }
    });

    const embedding = await getEmbeddingById(testEmbeddingId);
    expect(embedding).toBeDefined();
    expect(embedding?.id).toBe(testEmbeddingId);
    expect(embedding?.type).toBe('test_embedding');
    expect(embedding?.ref_key).toEqual({ id: testRefId });
    expect(embedding?.value).toBeArray();
    expect(embedding?.value).toHaveLength(DATABASE_EMBEDDING_DIMENSION);
});

test("Get embedding by ID", async () => {
    expect(testEmbeddingId).toBeDefined();
    const embedding = await getEmbeddingById(testEmbeddingId);
    expect(embedding).toBeDefined();
    expect(embedding?.id).toBe(testEmbeddingId);
});

test("Get embeddings by type", async () => {
    const embeddings = await getEmbeddingsByType('test_embedding');
    expect(embeddings).toBeArray();
    expect(embeddings.length).toBeGreaterThan(0);
    const testEmbedding = embeddings.find(e => e.id === testEmbeddingId);
    expect(testEmbedding).toBeDefined();
});

test("Get embeddings by ref_key", async () => {
    const embeddings = await getEmbeddingsByRefId(testRefId);
    expect(embeddings).toBeArray();
    expect(embeddings.length).toBeGreaterThan(0);
    const testEmbedding = embeddings.find(e => e.id === testEmbeddingId);
    expect(testEmbedding).toBeDefined();
});

test("Get all embeddings", async () => {
    const allEmbeddings = await getAllEmbeddings();
    expect(allEmbeddings).toBeArray();
    expect(allEmbeddings.length).toBeGreaterThan(0);
});

test("Update embedding type", async () => {
    expect(testEmbeddingId).toBeDefined();
    await updateEmbedding(testEmbeddingId, { type: 'updated_test_embedding' });
    const updatedEmbedding = await getEmbeddingById(testEmbeddingId);
    expect(updatedEmbedding?.type).toBe('updated_test_embedding');
});

test("Update embedding value", async () => {
    expect(testEmbeddingId).toBeDefined();
    const newEmbedding = Array.from({ length: DATABASE_EMBEDDING_DIMENSION }, () => 0.5);

    await updateEmbedding(testEmbeddingId, { value: newEmbedding });
    const updatedEmbedding = await getEmbeddingById(testEmbeddingId);
    expect(updatedEmbedding?.value).toBeArray();
    expect(updatedEmbedding?.value).toHaveLength(DATABASE_EMBEDDING_DIMENSION);
    // The embedding should be preserved as-is after casting
    expect(updatedEmbedding?.value[0]).toBe(0.5);
});

test("Delete embedding and verify", async () => {
    const embeddingId = crypto.randomUUID();
    const dummyEmbedding = Array.from({ length: DATABASE_EMBEDDING_DIMENSION }, () => Math.random());

    await createEmbedding({
        id: embeddingId,
        value: dummyEmbedding,
        type: 'delete_test',
        ref_key: { id: crypto.randomUUID() }
    });

    const embedding = await getEmbeddingById(embeddingId);
    expect(embedding).toBeDefined();

    await deleteEmbedding(embeddingId);

    const deletedEmbedding = await getEmbeddingById(embeddingId);
    expect(deletedEmbedding).toBeUndefined();
});

test("Get embeddings by similarity", async () => {
    // Create multiple embeddings with known values for similarity testing
    const embedding1 = new Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding1[0] = 1.0; // Very different from others

    const embedding2 = new Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding2[1] = 1.0; // Very different from others

    const embedding3 = new Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding3[0] = 0.9; // Similar to embedding1
    embedding3[1] = 0.1;

    const embeddingId1 = crypto.randomUUID();
    await createEmbedding({
        id: embeddingId1,
        value: embedding1,
        type: 'similarity_test',
        ref_key: { id: crypto.randomUUID() }
    });

    const embeddingId2 = crypto.randomUUID();
    await createEmbedding({
        id: embeddingId2,
        value: embedding2,
        type: 'similarity_test',
        ref_key: { id: crypto.randomUUID() }
    });

    const embeddingId3 = crypto.randomUUID();
    await createEmbedding({
        id: embeddingId3,
        value: embedding3,
        type: 'similarity_test',
        ref_key: { id: crypto.randomUUID() }
    });

    // Search for embeddings similar to embedding1
    const similarEmbeddings = await getEmbeddingsBySimilarity(embedding1, ['similarity_test']);

    expect(similarEmbeddings).toBeArray();
    expect(similarEmbeddings.length).toBeGreaterThan(0);

    // The most similar should be embedding1 itself (distance ~0)
    const bestMatch = similarEmbeddings[0];
    expect(bestMatch).toBeDefined();
    expect(bestMatch!.id).toBe(embeddingId1);
    expect(bestMatch!.distance).toBeCloseTo(0, 3);

    // embedding3 should be more similar to embedding1 than embedding2
    const embedding3Result = similarEmbeddings.find(r => r.id === embeddingId3);
    const embedding2Result = similarEmbeddings.find(r => r.id === embeddingId2);
    expect(embedding3Result).toBeDefined();
    expect(embedding2Result).toBeDefined();
    expect(embedding3Result!.distance).toBeLessThan(embedding2Result!.distance);

    // Clean up test embeddings
    await deleteEmbedding(embeddingId1);
    await deleteEmbedding(embeddingId2);
    await deleteEmbedding(embeddingId3);
});

test("Get embeddings by non-existent type returns empty array", async () => {
    const embeddings = await getEmbeddingsByType('non_existent_type');
    expect(embeddings).toBeArray();
    expect(embeddings).toHaveLength(0);
});

test("Get embeddings by non-existent ref_key returns empty array", async () => {
    const embeddings = await getEmbeddingsByRefId('non_existent_ref_key');
    expect(embeddings).toBeArray();
    expect(embeddings).toHaveLength(0);
});

test("Get embedding by ref and type", async () => {
    const metricId = crypto.randomUUID();
    const embeddingId = crypto.randomUUID();
    const dummyEmbedding = Array.from({ length: DATABASE_EMBEDDING_DIMENSION }, () => Math.random());

    // Create an embedding with specific ref_key and type
    await createEmbedding({
        id: embeddingId,
        value: dummyEmbedding,
        type: 'metric_entailment',
        ref_key: { metric_id: metricId, type: 'metric_entailment' }
    });

    // Retrieve it using the new utility function
    const retrievedEmbedding = await getEmbeddingByRefAndType(metricId, 'metric_entailment');
    
    expect(retrievedEmbedding).toBeDefined();
    expect(retrievedEmbedding?.id).toBe(embeddingId);
    expect(retrievedEmbedding?.type).toBe('metric_entailment');
    expect(retrievedEmbedding?.ref_key).toEqual({ metric_id: metricId, type: 'metric_entailment' });
    expect(retrievedEmbedding?.value).toBeArray();
    expect(retrievedEmbedding?.value).toHaveLength(DATABASE_EMBEDDING_DIMENSION);

    // Test with wrong type should return undefined
    const wrongTypeEmbedding = await getEmbeddingByRefAndType(metricId, 'metric_contradiction');
    expect(wrongTypeEmbedding).toBeUndefined();

    // Test with wrong ref_id should return undefined
    const wrongRefEmbedding = await getEmbeddingByRefAndType('wrong_metric_id', 'metric_entailment');
    expect(wrongRefEmbedding).toBeUndefined();

    // Clean up
    await deleteEmbedding(embeddingId);
});