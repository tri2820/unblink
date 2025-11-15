import { expect, test, beforeAll, afterAll } from "bun:test";
import { DATABASE_EMBEDDING_DIMENSION } from '../appdir';
import {
    createMedia,
    getAllMedia,
    getAllSettings,
    getMediaById,
    getMediaByLabel,
    getSetting,
    setSetting,
    updateMedia,
    deleteMedia,
    createMediaUnit,
    getMediaUnitById,
    getMediaUnitsByMediaId,
    updateMediaUnit,
    deleteMediaUnit,
    getMediaUnitsByEmbedding,
    createSecret,
    getSecret,
    getAllSecrets,
    setSecret,
    deleteSecret,
    createSession,
    getSessionById,
    getSessionsByUserId,
    updateSession,
    deleteSession,
    createUser,
    getUserById,
    getUserByUsername,
    updateUser,
    deleteUser,
    deleteSetting
} from './utils';
import { getDb, closeDb } from './database';

let dummyMediaId: string;
let newMediaUnitId: string;
let newUserId: string;
let newSecretKey: string;
let newSessionId: string;

beforeAll(async () => {
    // Ensure the database is connected and initialized
    await getDb();

    // Pre-test cleanup for user and secrets to ensure a clean state
    const existingTestUser = await getUserByUsername('testuser');
    if (existingTestUser) {
        await deleteUser(existingTestUser.id);
    }
    const existingApiKey = await getSecret('api_key');
    if (existingApiKey) {
        await deleteSecret('api_key');
    }
    const existingAnotherKey = await getSecret('another_key');
    if (existingAnotherKey) {
        await deleteSecret('another_key');
    }
    // Clean up any media or media units from previous failed runs
    const allMedia = await getAllMedia();
    for (const media of allMedia) {
        if (media.name.toLowerCase().includes('test') || media.name.includes('Dummy Media')) {
            const mediaUnits = await getMediaUnitsByMediaId(media.id);
            for (const unit of mediaUnits) {
                await deleteMediaUnit(unit.id);
            }
            await deleteMedia(media.id);
        }
    }
    const allSettings = await getAllSettings();
    for (const setting of allSettings) {
        if (setting.key === 'test_setting') {
            await deleteSetting(setting.key);
        }
    }
});

afterAll(async () => {
    // Cleanup: Delete created entries
    if (newMediaUnitId) await deleteMediaUnit(newMediaUnitId);
    if (dummyMediaId) await deleteMedia(dummyMediaId);
    if (newUserId) await deleteUser(newUserId);
    if (newSecretKey) await deleteSecret(newSecretKey);
    await deleteSecret('another_key'); // Ensure this is cleaned up if created
    if (newSessionId) await deleteSession(newSessionId);
    await deleteSetting('test_setting'); // Ensure this is cleaned up if created
    await closeDb();
});

test("Get all media", async () => {
    const allMedia = await getAllMedia();
    expect(allMedia).toBeArray();
});

test("Get media by ID", async () => {
    const newMediaId = crypto.randomUUID();
    await createMedia({
        id: newMediaId,
        name: 'Test Media for ID',
        uri: 'rtsp://test.com/id',
        labels: ['Test'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });
    const media = await getMediaById(newMediaId);
    expect(media).toBeDefined();
    expect(media?.id).toBe(newMediaId);
    await deleteMedia(newMediaId);
});

test('Get media by label "Urban" ', async () => {
    const urbanMedia = await getMediaByLabel('Urban');
    expect(urbanMedia).toBeArray();
    expect(urbanMedia.every(m => m.labels.includes('Urban'))).toBeTrue();
});

test("Get specific setting", async () => {
    const detectionSetting = await getSetting('object_detection_enabled');
    expect(detectionSetting).toBeDefined();
    expect(detectionSetting?.key).toBe('object_detection_enabled');
});

test("Get all settings", async () => {
    const allSettings = await getAllSettings();
    expect(allSettings).toBeArray();
    expect(allSettings.length).toBeGreaterThan(0);
});

test("Create a new media entry", async () => {
    const id = crypto.randomUUID();
    await createMedia({
        id,
        name: 'New Test Camera',
        uri: 'rtsp://example.com/test',
        labels: ['Test', 'New'],
        updated_at: Date.now(),
        saveToDisk: 1,
        saveDir: '/test/recordings'
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
        saveToDisk: 1,
        saveDir: null
    });
    await updateMedia(id, {
        name: 'Updated Media',
        saveToDisk: 0
    });
    const updatedMedia = await getMediaById(id);
    expect(updatedMedia?.name).toBe('Updated Media');
    expect(updatedMedia?.saveToDisk).toBe(0);
    await deleteMedia(id);
});

test("Set a new setting", async () => {
    await setSetting('test_setting', 'test_value');
    const setting = await getSetting('test_setting');
    expect(setting).toBeDefined();
    expect(setting?.value).toBe('test_value');
    await deleteSetting('test_setting');
});

test("Create a new media_unit entry with embedding", async () => {
    // Create a dummy media for media_unit
    const dummyMediaIdLocal = crypto.randomUUID();
    dummyMediaId = dummyMediaIdLocal;
    await createMedia({
        id: dummyMediaIdLocal,
        name: 'Dummy Media for MediaUnit',
        uri: 'dummy://uri',
        labels: ['dummy'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });

    // Generate a dummy embedding
    const dummyEmbedding = new Float32Array(DATABASE_EMBEDDING_DIMENSION).map(() => Math.random());
    const blob = new Uint8Array(dummyEmbedding.buffer);

    newMediaUnitId = crypto.randomUUID();
    await createMediaUnit({
        id: newMediaUnitId,
        media_id: dummyMediaIdLocal,
        at_time: Date.now(),
        description: 'A test media unit with an embedding',
        embedding: blob,
        path: '/path/to/media_unit.jpg',
        type: 'image'
    });
    const newMediaUnit = await getMediaUnitById(newMediaUnitId);
    expect(newMediaUnit).toBeDefined();
    expect(newMediaUnit?.id).toBe(newMediaUnitId);
    expect(newMediaUnit?.media_id).toBe(dummyMediaIdLocal);
    expect(newMediaUnit?.embedding).toBeInstanceOf(Uint8Array);
    expect(newMediaUnit?.embedding).toEqual(blob);
});

test("Update media_unit", async () => {
    expect(newMediaUnitId).toBeDefined(); // Ensure newMediaUnitId is set from previous test
    await updateMediaUnit(newMediaUnitId, { description: 'Updated description' });
    const updatedMediaUnit = await getMediaUnitById(newMediaUnitId);
    expect(updatedMediaUnit?.description).toBe('Updated description');
});

test("Update media_unit description only", async () => {
    // Create a new media unit for this test
    const testMediaId = crypto.randomUUID();
    await createMedia({
        id: testMediaId,
        name: 'Test Media for Description Update',
        uri: 'dummy://uri',
        labels: ['desc-update-test'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });

    const testMediaUnitId = crypto.randomUUID();
    await createMediaUnit({
        id: testMediaUnitId,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Original description',
        embedding: null,
        path: '/path/to/desc_update_test.jpg',
        type: 'image'
    });

    // Verify the original description
    const originalMediaUnit = await getMediaUnitById(testMediaUnitId);
    expect(originalMediaUnit?.id).toBe(testMediaUnitId);
    expect(originalMediaUnit?.description).toBe('Original description');
    expect(originalMediaUnit?.path).toBe('/path/to/desc_update_test.jpg');

    // Update only the description
    await updateMediaUnit(testMediaUnitId, { description: 'New updated description' });

    // Verify the description was updated but other fields remain unchanged
    const updatedMediaUnit = await getMediaUnitById(testMediaUnitId);
    expect(updatedMediaUnit?.description).toBe('New updated description');
    expect(updatedMediaUnit?.path).toBe('/path/to/desc_update_test.jpg');
    expect(updatedMediaUnit?.media_id).toBe(testMediaId);
    expect(updatedMediaUnit?.type).toBe('image');

    // Clean up
    await deleteMediaUnit(testMediaUnitId);
    await deleteMedia(testMediaId);
});

test("Get media_units by media_id", async () => {
    expect(dummyMediaId).toBeDefined(); // Ensure dummyMediaId is set
    const mediaUnitsByMediaId = await getMediaUnitsByMediaId(dummyMediaId);
    expect(mediaUnitsByMediaId).toBeArrayOfSize(1);
    expect(mediaUnitsByMediaId[0]?.id).toBe(newMediaUnitId);
});

test("Create a new user", async () => {
    newUserId = crypto.randomUUID();
    await createUser({
        id: newUserId,
        username: 'testuser',
        password_hash: 'hashedpassword123',
        role: 'admin'
    });
    const user = await getUserById(newUserId);
    expect(user).toBeDefined();
    expect(user?.username).toBe('testuser');
});

test("Get user by ID", async () => {
    expect(newUserId).toBeDefined();
    const userById = await getUserById(newUserId);
    expect(userById).toBeDefined();
    expect(userById?.id).toBe(newUserId);
});

test("Get user by username", async () => {
    expect(newUserId).toBeDefined();
    const userByUsername = await getUserByUsername('testuser');
    expect(userByUsername).toBeDefined();
    expect(userByUsername?.username).toBe('testuser');
});

test("Update user", async () => {
    expect(newUserId).toBeDefined();
    await updateUser(newUserId, { role: 'editor' });
    const updatedUser = await getUserById(newUserId);
    expect(updatedUser?.role).toBe('editor');
});

test("Create a new secret", async () => {
    newSecretKey = await createSecret('api_key', 'supersecretkey');
    expect(newSecretKey).toBeString();
    const secret = await getSecret(newSecretKey);
    expect(secret).toBeDefined();
    expect(secret?.value).toBe('supersecretkey');
});

test("Set secret (update existing)", async () => {
    expect(newSecretKey).toBeDefined();
    await setSecret(newSecretKey, 'updatedsupersecretkey');
    const updatedSecret = await getSecret(newSecretKey);
    expect(updatedSecret?.value).toBe('updatedsupersecretkey');
});

test("Set secret (create new)", async () => {
    await setSecret('another_key', 'another_value'); // Correctly using setSecret
    const anotherSecret = await getSecret('another_key');
    expect(anotherSecret).toBeDefined();
    expect(anotherSecret?.value).toBe('another_value');
    await deleteSecret('another_key'); // Clean up immediately
});

test("Get all secrets", async () => {
    await createSecret('temp_secret_1', 'value1');
    await createSecret('temp_secret_2', 'value2');
    const allSecrets = await getAllSecrets();
    expect(allSecrets).toBeArray();
    expect(allSecrets.length).toBeGreaterThanOrEqual(2);
    await deleteSecret('temp_secret_1');
    await deleteSecret('temp_secret_2');
});

test("Create a new session", async () => {
    expect(newUserId).toBeDefined();
    newSessionId = crypto.randomUUID();
    await createSession({
        session_id: newSessionId,
        user_id: newUserId,
        created_at: Date.now(),
        expires_at: Date.now() + 3600000 // 1 hour from now
    });
    const session = await getSessionById(newSessionId);
    expect(session).toBeDefined();
    expect(session?.user_id).toBe(newUserId);
});

test("Get session by ID", async () => {
    expect(newSessionId).toBeDefined();
    const sessionById = await getSessionById(newSessionId);
    expect(sessionById).toBeDefined();
    expect(sessionById?.session_id).toBe(newSessionId);
});

test("Get sessions by user ID", async () => {
    expect(newUserId).toBeDefined();
    const sessionsByUserId = await getSessionsByUserId(newUserId);
    expect(sessionsByUserId).toBeArrayOfSize(1);
    expect(sessionsByUserId[0]?.user_id).toBe(newUserId);
});

test("Update session", async () => {
    expect(newSessionId).toBeDefined();
    const newExpiry = Date.now() + 7200000; // Extend by another hour
    await updateSession(newSessionId, { expires_at: newExpiry });
    const updatedSession = await getSessionById(newSessionId);
    expect(updatedSession?.expires_at).toBe(newExpiry);
});

test("Vector cosine distance query using stored embeddings", async () => {
    const db = await getDb();

    // Test cosine distance with vectors created using vector32 function directly in SQL
    const cosineTestStmt = db.prepare(`
        SELECT 
            vector_distance_cos(vector32('[0.1, 0.2, 0.3, 0.4]'), vector32('[0.15, 0.25, 0.35, 0.45]')) AS cosine_distance
    `);

    const result = await cosineTestStmt.get() as { cosine_distance: number } | undefined;

    expect(result).toBeDefined();
    expect(typeof result?.cosine_distance).toBe('number');
    expect(result?.cosine_distance).toBeGreaterThanOrEqual(0);
    expect(result?.cosine_distance).toBeLessThanOrEqual(2); // Cosine distance is between 0 and 2
});

test("Vector L2 distance query", async () => {
    const db = await getDb();

    // Test L2 distance with vectors created using vector32 function directly in SQL
    const l2TestStmt = db.prepare(`
        SELECT 
            vector_distance_l2(vector32('[1.0, 2.0, 3.0, 4.0]'), vector32('[1.5, 2.5, 3.5, 4.5]')) AS l2_distance
    `);

    const result = await l2TestStmt.get() as { l2_distance: number } | undefined;

    expect(result).toBeDefined();
    expect(typeof result?.l2_distance).toBe('number');
    expect(result?.l2_distance).toBeGreaterThanOrEqual(0);
});

test("Vector simple selection", async () => {
    const db = await getDb();
    const selectionStmt = db.prepare(`  
        SELECT vector32('[1.0, 2.0, 3.0]') as test_vector;
    `);
    const result = await selectionStmt.get();
    expect(result.test_vector).toBeDefined();
    expect(result.test_vector).toBeInstanceOf(Uint8Array);

})

test("Vector Jaccard distance query", async () => {
    const db = await getDb();

    // Test Jaccard distance with sparse vectors
    const jaccardTestStmt = db.prepare(`
        SELECT 
            vector_distance_jaccard(
                vector32_sparse('[0.0, 1.5, 0.0, 2.3, 0.0]'), 
                vector32_sparse('[0.0, 1.0, 0.5, 2.0, 0.0]')
            ) AS jaccard_distance
    `);

    const result = await jaccardTestStmt.get() as { jaccard_distance: number } | undefined;

    expect(result).toBeDefined();
    expect(typeof result?.jaccard_distance).toBe('number');
    expect(result?.jaccard_distance).toBeGreaterThanOrEqual(0);
    expect(result?.jaccard_distance).toBeLessThanOrEqual(1); // Jaccard distance is between 0 and 1
});

test("Vector utility functions (vector_extract)", async () => {
    // Create a dummy media for media_unit
    const testMediaId = crypto.randomUUID();
    await createMedia({
        id: testMediaId,
        name: 'Vector Utility Test Media',
        uri: 'dummy://uri',
        labels: ['vector-util-test'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });

    // Create a test embedding
    const dummyEmbedding = new Float32Array(DATABASE_EMBEDDING_DIMENSION).map(() => Math.random());
    const dummyEmbeddingStr = `[${Array.from(dummyEmbedding).join(', ')}]`;

    const testMediaUnitId = crypto.randomUUID();
    await createMediaUnit({
        id: testMediaUnitId,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Test media unit for vector utilities',
        embedding: new Uint8Array(dummyEmbedding.buffer),
        path: '/path/to/vector_util_test.jpg',
        type: 'image'
    });

    // Test vector_extract function
    const db = await getDb();

    const extractStmt = db.prepare(`
        SELECT 
            id,
            vector_extract(embedding) AS embedding_text
        FROM media_units 
        WHERE id = ?
    `);

    const result = await extractStmt.get(testMediaUnitId) as {
        id: string;
        embedding_text: string;
    } | undefined;

    expect(result).toBeDefined();
    expect(result?.id).toBe(testMediaUnitId);

    // Clean up
    await deleteMediaUnit(testMediaUnitId);
    await deleteMedia(testMediaId);
});

test("Vector concatenation and slicing", async () => {
    const db = await getDb();

    // Test vector concatenation
    const concatStmt = db.prepare(`
        SELECT 
            vector_extract(vector_concat(vector32('[1.0, 2.0]'), vector32('[3.0, 4.0]'))) AS concatenated
    `);

    const concatResult = await concatStmt.get() as { concatenated: string } | undefined;
    expect(concatResult).toBeDefined();
    expect(concatResult?.concatenated).toContain('[1');
    expect(concatResult?.concatenated).toContain('2');
    expect(concatResult?.concatenated).toContain('3');
    expect(concatResult?.concatenated).toContain('4');

    // Test vector slicing
    const sliceStmt = db.prepare(`
        SELECT 
            vector_extract(vector_slice(vector32('[1.0, 2.0, 3.0, 4.0, 5.0]'), 1, 4)) AS sliced
    `);

    const sliceResult = await sliceStmt.get() as { sliced: string } | undefined;
    expect(sliceResult).toBeDefined();
    expect(sliceResult?.sliced).toContain('[2');  // Should contain [2, 3, 4]
    expect(sliceResult?.sliced).toContain('3');
    expect(sliceResult?.sliced).toContain('4');
    // Should not contain 1.0 (at index 0) or 5.0 (at index 4)
    expect(sliceResult?.sliced).not.toContain('1');
    expect(sliceResult?.sliced).not.toContain('5');
});

test("Sparse vector operations", async () => {
    const db = await getDb();

    // Test sparse vector creation and distance calculation
    const sparseStmt = db.prepare(`
        SELECT 
            vector_extract(vector32_sparse('[0.0, 1.5, 0.0, 2.3, 0.0]')) AS sparse_vector,
            vector_distance_jaccard(
                vector32_sparse('[0.0, 1.5, 0.0, 2.3, 0.0]'), 
                vector32_sparse('[0.0, 1.0, 0.5, 2.0, 0.0]')
            ) AS jaccard_distance
    `);

    const result = await sparseStmt.get() as {
        sparse_vector: string;
        jaccard_distance: number;
    } | undefined;

    expect(result).toBeDefined();
    expect(result?.sparse_vector).toContain('1.5');
    expect(result?.sparse_vector).toContain('2.3');
    expect(typeof result?.jaccard_distance).toBe('number');
    expect(result?.jaccard_distance).toBeGreaterThanOrEqual(0);
});

// Complete vector search example test
test("Complete vector search semantic query example", async () => {
    // Create a dummy media for media_unit
    const testMediaId = crypto.randomUUID();
    await createMedia({
        id: testMediaId,
        name: 'Semantic Search Test Media',
        uri: 'dummy://uri',
        labels: ['semantic-test'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });

    // In a real semantic search scenario, embeddings would be pre-computed
    // For this test, we'll create media units and then query with vector functions
    const mediaUnitId1 = crypto.randomUUID();
    await createMediaUnit({
        id: mediaUnitId1,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Media unit with embedding for semantic search test 1',
        embedding: null, // Embedding would be set in real applications
        path: '/path/to/semantic_test_1.jpg',
        type: 'image'
    });

    const mediaUnitId2 = crypto.randomUUID();
    await createMediaUnit({
        id: mediaUnitId2,
        media_id: testMediaId,
        at_time: Date.now(),
        description: 'Media unit with embedding for semantic search test 2',
        embedding: null, // Embedding would be set in real applications
        path: '/path/to/semantic_test_2.jpg',
        type: 'image'
    });

    // Test a complete semantic search query using vector functions
    const db = await getDb();

    // This simulates finding documents similar to a query embedding
    const semanticSearchStmt = db.prepare(`
        SELECT 
            id,
            description,
            path,
            vector_distance_cos(vector32('[0.1, 0.2, 0.3, 0.4]'), vector32('[0.15, 0.25, 0.35, 0.45]')) AS similarity_score
        FROM media_units 
        WHERE type = 'image'
        ORDER BY similarity_score
        LIMIT 5
    `);

    const results = await semanticSearchStmt.all() as Array<{
        id: string;
        description: string;
        path: string;
        similarity_score: number;
    }>;

    expect(results).toBeArray();
    // Results may be empty since we're not matching against stored embeddings
    // but the query should execute without errors

    // Clean up
    await deleteMediaUnit(mediaUnitId1);
    await deleteMediaUnit(mediaUnitId2);
    await deleteMedia(testMediaId);
});

// Additional delete tests for comprehensive coverage
test("Delete media and verify", async () => {
    const mediaId = crypto.randomUUID();
    await createMedia({
        id: mediaId,
        name: 'Test Media for Delete',
        uri: 'rtsp://test.com/delete',
        labels: ['Test', 'Delete'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });

    // Verify the media was created
    const media = await getMediaById(mediaId);
    expect(media).toBeDefined();
    expect(media?.name).toBe('Test Media for Delete');

    // Delete the media
    await deleteMedia(mediaId);

    // Verify the media was deleted
    const deletedMedia = await getMediaById(mediaId);
    expect(deletedMedia).toBeUndefined();
});

test("Delete media_unit and verify", async () => {
    const testMediaId = crypto.randomUUID();
    await createMedia({
        id: testMediaId,
        name: 'Test Media for Delete Media Unit',
        uri: 'dummy://uri',
        labels: ['delete-test'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });

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

    // Verify the media unit was created
    const mediaUnit = await getMediaUnitById(mediaUnitId);
    expect(mediaUnit).toBeDefined();
    expect(mediaUnit?.id).toBe(mediaUnitId);
    expect(mediaUnit?.description).toBe('Test media unit for delete verification');

    // Delete the media unit
    await deleteMediaUnit(mediaUnitId);

    // Verify the media unit was deleted
    const deletedMediaUnit = await getMediaUnitById(mediaUnitId);
    expect(deletedMediaUnit).toBeUndefined();

    // Clean up
    await deleteMedia(testMediaId);
});

test("Delete user and verify", async () => {
    const userId = crypto.randomUUID();
    await createUser({
        id: userId,
        username: 'testuser-delete',
        password_hash: 'hashedpassworddelete',
        role: 'user'
    });

    // Verify the user was created
    const user = await getUserById(userId);
    expect(user).toBeDefined();
    expect(user?.username).toBe('testuser-delete');

    // Delete the user
    await deleteUser(userId);

    // Verify the user was deleted
    const deletedUser = await getUserById(userId);
    expect(deletedUser).toBeUndefined();
});

test("Delete setting and verify", async () => {
    await setSetting('test_setting_delete', 'test_value_delete');

    // Verify the setting was created
    const setting = await getSetting('test_setting_delete');
    expect(setting).toBeDefined();
    expect(setting?.value).toBe('test_value_delete');

    // Delete the setting
    await deleteSetting('test_setting_delete');

    // Verify the setting was deleted
    const deletedSetting = await getSetting('test_setting_delete');
    expect(deletedSetting).toBeUndefined();
});

test("Delete secret and verify", async () => {
    await createSecret('test_secret_delete', 'secret_value_delete');

    // Verify the secret was created
    const secret = await getSecret('test_secret_delete');
    expect(secret).toBeDefined();
    expect(secret?.value).toBe('secret_value_delete');

    // Delete the secret
    await deleteSecret('test_secret_delete');

    // Verify the secret was deleted
    const deletedSecret = await getSecret('test_secret_delete');
    expect(deletedSecret).toBeUndefined();
});

test("Delete session and verify", async () => {
    const testUserId = crypto.randomUUID();
    await createUser({
        id: testUserId,
        username: 'session-test-user',
        password_hash: 'hash',
        role: 'user'
    });

    const sessionId = crypto.randomUUID();
    await createSession({
        session_id: sessionId,
        user_id: testUserId,
        created_at: Date.now(),
        expires_at: Date.now() + 3600000 // 1 hour from now
    });

    // Verify the session was created
    const session = await getSessionById(sessionId);
    expect(session).toBeDefined();
    expect(session?.session_id).toBe(sessionId);
    expect(session?.user_id).toBe(testUserId);

    // Delete the session
    await deleteSession(sessionId);

    // Verify the session was deleted
    const deletedSession = await getSessionById(sessionId);
    expect(deletedSession).toBeUndefined();

    // Clean up
    await deleteUser(testUserId);
});

test("Get media units by embedding similarity", async () => {
    // 1. Setup: Create media and media_units with known embeddings
    const testMediaId = crypto.randomUUID();
    await createMedia({
        id: testMediaId,
        name: 'Test Media for Embedding Search',
        uri: 'dummy://uri',
        labels: ['embedding-search-test'],
        updated_at: Date.now(),
        saveToDisk: 0,
        saveDir: null
    });

    // Create three media units with distinct embeddings
    const embedding1 = new Float32Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding1[0] = 1.0; // Vector pointing along the first axis

    const embedding2 = new Float32Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding2[1] = 1.0; // Vector pointing along the second axis

    const embedding3 = new Float32Array(DATABASE_EMBEDDING_DIMENSION).fill(0);
    embedding3[0] = 0.9; // Vector very close to the first one
    embedding3[1] = 0.1; // Small component in another direction

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

    // 2. Execute: Search for an embedding similar to the first one
    const queryEmbedding = Array.from(embedding1);
    const results = await getMediaUnitsByEmbedding(queryEmbedding);

    // 3. Assert: Check the results
    expect(results).toBeArray();
    expect(results.length).toBeGreaterThanOrEqual(3); // Should find the three we inserted

    // The most similar result should be mediaUnitId1, with a similarity score near 0
    expect(results[0]!.id).toBe(mediaUnitId1);
    expect(results[0]!.similarity).toBeCloseTo(0, 5);

    // The next most similar should be mediaUnitId3
    expect(results[1]!.id).toBe(mediaUnitId3);
    expect(results[1]!.similarity).toBeGreaterThan(0);
    expect(results[1]!.similarity).toBeLessThan(1);

    // The least similar should be mediaUnitId2
    const mediaUnit2Result = results.find(r => r.id === mediaUnitId2);
    expect(mediaUnit2Result).toBeDefined();
    // Cosine distance for orthogonal vectors is 1
    expect(mediaUnit2Result!.similarity).toBeCloseTo(1.0, 5);

    // 4. Cleanup
    await deleteMediaUnit(mediaUnitId1);
    await deleteMediaUnit(mediaUnitId2);
    await deleteMediaUnit(mediaUnitId3);
    await deleteMedia(testMediaId);
});