import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from '../database';
import {
    createMedia,
    getAllMedia,
    getMediaById,
    getMediaByLabel,
    updateMedia,
    deleteMedia
} from '../utils';

beforeAll(async () => {
    await getDb();
    // Clean up test media
    const allMedia = await getAllMedia();
    for (const media of allMedia) {
        if (media.name.toLowerCase().includes('test')) {
            await deleteMedia(media.id);
        }
    }
});

afterAll(async () => {
    await closeDb();
});

test("Get all media", async () => {
    const allMedia = await getAllMedia();
    expect(allMedia).toBeArray();
});

test("Get media by ID", async () => {
    const id = crypto.randomUUID();
    await createMedia({
        id,
        name: 'Test Media for ID',
        uri: 'rtsp://test.com/id',
        labels: ['Test'],
        updated_at: Date.now(),
        save_to_disk: 0,
        save_location: null
    });
    const media = await getMediaById(id);
    expect(media).toBeDefined();
    expect(media?.id).toBe(id);
    await deleteMedia(id);
});

test('Get media by label "Urban"', async () => {
    const urbanMedia = await getMediaByLabel('Urban');
    expect(urbanMedia).toBeArray();
    expect(urbanMedia.every(m => m.labels.includes('Urban'))).toBeTrue();
});

test("Create a new media entry", async () => {
    const id = crypto.randomUUID();
    await createMedia({
        id,
        name: 'New Test Camera',
        uri: 'rtsp://example.com/test',
        labels: ['Test', 'New'],
        updated_at: Date.now(),
        save_to_disk: 1,
        save_location: '/test/recordings'
    });
    const media = await getMediaById(id);
    expect(media).toBeDefined();
    expect(media?.name).toBe('New Test Camera');
    await deleteMedia(id);
});

test("Update the media", async () => {
    const id = crypto.randomUUID();
    await createMedia({
        id,
        name: 'Media to Update',
        uri: 'rtsp://example.com/update',
        labels: ['Old'],
        updated_at: Date.now(),
        save_to_disk: 1,
        save_location: null
    });
    await updateMedia(id, {
        name: 'Updated Media',
        save_to_disk: 0
    });
    const updatedMedia = await getMediaById(id);
    expect(updatedMedia?.name).toBe('Updated Media');
    expect(updatedMedia?.save_to_disk).toBe(0);
    await deleteMedia(id);
});

test("Delete media and verify", async () => {
    const id = crypto.randomUUID();
    await createMedia({
        id,
        name: 'Test Media for Delete',
        uri: 'rtsp://test.com/delete',
        labels: ['Test', 'Delete'],
        updated_at: Date.now(),
        save_to_disk: 0,
        save_location: null
    });
    const media = await getMediaById(id);
    expect(media).toBeDefined();

    await deleteMedia(id);

    const deletedMedia = await getMediaById(id);
    expect(deletedMedia).toBeUndefined();
});
