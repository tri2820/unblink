import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from './database';
import {
    createMedia,
    deleteMedia,
    createMoment,
    getMomentById,
    getAllMoments,
    updateMoment,
    deleteMoment,
    getMomentsByMediaId
} from './utils';

let testMediaId: string;

beforeAll(async () => {
    await getDb();
    testMediaId = crypto.randomUUID();
    await createMedia({
        id: testMediaId,
        name: 'Test Media for Moments',
        uri: 'test://moment-media',
        labels: ['moment-test'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });
});

afterAll(async () => {
    if (testMediaId) await deleteMedia(testMediaId);
    await closeDb();
});

test("Create a new moment", async () => {
    const momentId = crypto.randomUUID();
    await createMoment({
        id: momentId,
        media_id: testMediaId,
        start_time: Date.now() - 10000,
        end_time: Date.now(),
        peak_deviation: 1.5,
        type: 'standard',
        title: null,
        short_description: null,
        long_description: null
    });
    const moment = await getMomentById(momentId);
    expect(moment).toBeDefined();
    expect(moment?.id).toBe(momentId);
    expect(moment?.media_id).toBe(testMediaId);
    expect(moment?.peak_deviation).toBe(1.5);
    expect(moment?.type).toBe('standard');
    await deleteMoment(momentId);
});

test("Get all moments", async () => {
    const allMoments = await getAllMoments();
    expect(allMoments).toBeArray();
});

test("Get moment by ID", async () => {
    const momentId = crypto.randomUUID();
    await createMoment({
        id: momentId,
        media_id: testMediaId,
        start_time: Date.now() - 5000,
        end_time: Date.now(),
        peak_deviation: 0.8,
        type: 'instant',
        title: null,
        short_description: null,
        long_description: null
    });
    const moment = await getMomentById(momentId);
    expect(moment).toBeDefined();
    expect(moment?.id).toBe(momentId);
    expect(moment?.media_id).toBe(testMediaId);
    expect(moment?.type).toBe('instant');
    await deleteMoment(momentId);
});

test("Update moment", async () => {
    const momentId = crypto.randomUUID();
    await createMoment({
        id: momentId,
        media_id: testMediaId,
        start_time: Date.now() - 8000,
        end_time: Date.now() - 1000,
        peak_deviation: 0.5,
        type: 'standard',
        title: null,
        short_description: null,
        long_description: null
    });

    await updateMoment(momentId, {
        title: 'Person entering',
        short_description: 'A person entered the room',
        peak_deviation: 1.2
    });

    const updatedMoment = await getMomentById(momentId);
    expect(updatedMoment?.title).toBe('Person entering');
    expect(updatedMoment?.short_description).toBe('A person entered the room');
    expect(updatedMoment?.peak_deviation).toBe(1.2);

    await deleteMoment(momentId);
});

test("Delete moment and verify", async () => {
    const momentId = crypto.randomUUID();
    await createMoment({
        id: momentId,
        media_id: testMediaId,
        start_time: Date.now() - 2000,
        end_time: Date.now(),
        peak_deviation: 0.3,
        type: 'standard',
        title: null,
        short_description: null,
        long_description: null
    });

    const moment = await getMomentById(momentId);
    expect(moment).toBeDefined();

    await deleteMoment(momentId);

    const deletedMoment = await getMomentById(momentId);
    expect(deletedMoment).toBeUndefined();
});

test("Get moments by media ID", async () => {
    const momentId1 = crypto.randomUUID();
    const momentId2 = crypto.randomUUID();

    await createMoment({
        id: momentId1,
        media_id: testMediaId,
        start_time: Date.now() - 10000,
        end_time: Date.now() - 9000,
        peak_deviation: 0.5,
        type: 'standard',
        title: null,
        short_description: null,
        long_description: null
    });

    await createMoment({
        id: momentId2,
        media_id: testMediaId,
        start_time: Date.now() - 5000,
        end_time: Date.now() - 4000,
        peak_deviation: 0.6,
        type: 'instant',
        title: null,
        short_description: null,
        long_description: null
    });

    const moments = await getMomentsByMediaId(testMediaId);
    expect(moments).toBeArrayOfSize(2);
    expect(moments.some(m => m.id === momentId1)).toBeTrue();
    expect(moments.some(m => m.id === momentId2)).toBeTrue();
    expect(moments.every(m => m.media_id === testMediaId)).toBeTrue();

    await deleteMoment(momentId1);
    await deleteMoment(momentId2);
});
