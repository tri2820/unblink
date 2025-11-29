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
    deleteEmbedding
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
    const dummyEmbedding = new Float32Array(DATABASE_EMBEDDING_DIMENSION).map(() => Math.random());
    const blob = new Uint8Array(dummyEmbedding.buffer);

    testEmbeddingId = crypto.randomUUID();
    await createEmbedding({
        id: testEmbeddingId,
        value: blob,
        type: 'test_embedding',
        ref_id: testRefId
    });

    const embedding = await getEmbeddingById(testEmbeddingId);
    expect(embedding).toBeDefined();
    expect(embedding?.id).toBe(testEmbeddingId);
    expect(embedding?.type).toBe('test_embedding');
    expect(embedding?.ref_id).toBe(testRefId);
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

test("Get embeddings by ref_id", async () => {
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
    const newEmbedding = new Float32Array(DATABASE_EMBEDDING_DIMENSION).fill(0.5);
    const newBlob = new Uint8Array(newEmbedding.buffer);

    await updateEmbedding(testEmbeddingId, { value: newBlob });
    const updatedEmbedding = await getEmbeddingById(testEmbeddingId);
    expect(updatedEmbedding?.value).toBeArray();
    expect(updatedEmbedding?.value).toHaveLength(DATABASE_EMBEDDING_DIMENSION);
    // The embedding should be preserved as-is after casting
    expect(updatedEmbedding?.value[0]).toBe(0.5);
});

test("Delete embedding and verify", async () => {
    const embeddingId = crypto.randomUUID();
    const dummyEmbedding = new Float32Array(DATABASE_EMBEDDING_DIMENSION).map(() => Math.random());
    const blob = new Uint8Array(dummyEmbedding.buffer);

    await createEmbedding({
        id: embeddingId,
        value: blob,
        type: 'delete_test',
        ref_id: crypto.randomUUID()
    });

    const embedding = await getEmbeddingById(embeddingId);
    expect(embedding).toBeDefined();

    await deleteEmbedding(embeddingId);

    const deletedEmbedding = await getEmbeddingById(embeddingId);
    expect(deletedEmbedding).toBeUndefined();
});

test("Get embeddings by non-existent type returns empty array", async () => {
    const embeddings = await getEmbeddingsByType('non_existent_type');
    expect(embeddings).toBeArray();
    expect(embeddings).toHaveLength(0);
});

test("Get embeddings by non-existent ref_id returns empty array", async () => {
    const embeddings = await getEmbeddingsByRefId('non_existent_ref_id');
    expect(embeddings).toBeArray();
    expect(embeddings).toHaveLength(0);
});