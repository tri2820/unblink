import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from '../database';
import { DATABASE_EMBEDDING_DIMENSION } from '../../appdir';
import {
    createMedia,
    deleteMedia,
    createMediaUnit,
    getMediaUnitById,
    getMediaUnitsByMediaId,
    updateMediaUnit,
    deleteMediaUnit,
    getMediaUnitsByEmbedding
} from '../utils';

let testMediaId: string;
let testMediaUnitId: string;

beforeAll(async () => {
    await getDb();
    testMediaId = crypto.randomUUID();
    await createMedia({
        id: testMediaId,
        name: 'Test Media for MediaUnits',
        uri: 'test://media-units',
        labels: ['test'],
        updated_at: Date.now(),
        save_to_disk: 0,
        save_location: null
    });
});

afterAll(async () => {
    if (testMediaUnitId) await deleteMediaUnit(testMediaUnitId);
    if (testMediaId) await deleteMedia(testMediaId);
    await closeDb();
});

test("Create a new media_unit entry with embedding", async () => {
    const dummyEmbedding = new Float32Array(DATABASE_EMBEDDING_DIMENSION).map(() => Math.random());
    const blob = new Uint8Array(dummyEmbedding.buffer);

    testMediaUnitId = crypto.randomUUID();
    await createMediaUnit({
        id: testMediaUnitId,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'A test media unit with an embedding',
        embedding: blob,
        path: '/path/to/media_unit.jpg',
        type: 'image'
    });
    const mediaUnit = await getMediaUnitById(testMediaUnitId);
    expect(mediaUnit).toBeDefined();
    expect(mediaUnit?.id).toBe(testMediaUnitId);
    expect(mediaUnit?.media_id).toBe(testMediaId);
    expect(mediaUnit?.embedding).toBeInstanceOf(Uint8Array);
    expect(mediaUnit?.embedding).toEqual(blob);
});

test("Update media_unit description", async () => {
    expect(testMediaUnitId).toBeDefined();
    await updateMediaUnit(testMediaUnitId, { description: 'Updated description' });
    const updatedMediaUnit = await getMediaUnitById(testMediaUnitId);
    expect(updatedMediaUnit?.description).toBe('Updated description');
});

test("Get media_units by media_id", async () => {
    expect(testMediaId).toBeDefined();
    const mediaUnits = await getMediaUnitsByMediaId(testMediaId);
    expect(mediaUnits).toBeArrayOfSize(1);
    expect(mediaUnits[0]?.id).toBe(testMediaUnitId);
});

test("Delete media_unit and verify", async () => {
    const mediaUnitId = crypto.randomUUID();
    await createMediaUnit({
        id: mediaUnitId,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Test media unit for delete verification',
        embedding: null,
        path: '/path/to/test_delete.jpg',
        type: 'image'
    });
    const mediaUnit = await getMediaUnitById(mediaUnitId);
    expect(mediaUnit).toBeDefined();

    await deleteMediaUnit(mediaUnitId);

    const deletedMediaUnit = await getMediaUnitById(mediaUnitId);
    expect(deletedMediaUnit).toBeUndefined();
});

test("Get media units by embedding similarity", async () => {
    const embedding1 = new Float32Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding1[0] = 1.0;

    const embedding2 = new Float32Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding2[1] = 1.0;

    const embedding3 = new Float32Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding3[0] = 0.9;
    embedding3[1] = 0.1;

    const mediaUnitId1 = crypto.randomUUID();
    await createMediaUnit({
        id: mediaUnitId1,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Vector 1',
        embedding: new Uint8Array(embedding1.buffer),
        path: '/path/to/vector1.jpg',
        type: 'image'
    });

    const mediaUnitId2 = crypto.randomUUID();
    await createMediaUnit({
        id: mediaUnitId2,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Vector 2',
        embedding: new Uint8Array(embedding2.buffer),
        path: '/path/to/vector2.jpg',
        type: 'image'
    });

    const mediaUnitId3 = crypto.randomUUID();
    await createMediaUnit({
        id: mediaUnitId3,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Vector 3 (similar to 1)',
        embedding: new Uint8Array(embedding3.buffer),
        path: '/path/to/vector3.jpg',
        type: 'image'
    });

    const queryEmbedding = Array.from(embedding1);
    const allResults = await getMediaUnitsByEmbedding(queryEmbedding);

    // Filter to only our test media
    const results = allResults.filter(r => r.media_id === testMediaId);

    expect(results).toBeArray();

    // Verify we can find the perfect match (mediaUnitId1)
    const perfectMatch = results.find(r => r.id === mediaUnitId1);
    expect(perfectMatch).toBeDefined();
    expect(perfectMatch!.distance).toBeCloseTo(0, 3); // Perfect match has distance ~0

    // Clean up
    await deleteMediaUnit(mediaUnitId1);
    await deleteMediaUnit(mediaUnitId2);
    await deleteMediaUnit(mediaUnitId3);
});
