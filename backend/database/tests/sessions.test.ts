import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from '../database';
import {
    createUser,
    deleteUser,
    createSession,
    getSessionById,
    getSessionsByUserId,
    updateSession,
    deleteSession
} from '../utils';

let testUserId: string;
let testSessionId: string;

beforeAll(async () => {
    await getDb();
    testUserId = crypto.randomUUID();
    await createUser({
        id: testUserId,
        username: 'session-test-user',
        password_hash: 'hash',
        role: 'user'
    });
});

afterAll(async () => {
    if (testSessionId) await deleteSession(testSessionId);
    if (testUserId) await deleteUser(testUserId);
    await closeDb();
});

test("Create a new session", async () => {
    testSessionId = crypto.randomUUID();
    await createSession({
        session_id: testSessionId,
        user_id: testUserId,
        created_at: Date.now(),
        expires_at: Date.now() + 3600000 // 1 hour from now
    });
    const session = await getSessionById(testSessionId);
    expect(session).toBeDefined();
    expect(session?.user_id).toBe(testUserId);
});

test("Get session by ID", async () => {
    expect(testSessionId).toBeDefined();
    const session = await getSessionById(testSessionId);
    expect(session).toBeDefined();
    expect(session?.session_id).toBe(testSessionId);
});

test("Get sessions by user ID", async () => {
    expect(testUserId).toBeDefined();
    const sessions = await getSessionsByUserId(testUserId);
    expect(sessions).toBeArrayOfSize(1);
    expect(sessions[0]?.user_id).toBe(testUserId);
});

test("Update session", async () => {
    expect(testSessionId).toBeDefined();
    const newExpiry = Date.now() + 7200000;
    await updateSession(testSessionId, { expires_at: newExpiry });
    const updatedSession = await getSessionById(testSessionId);
    expect(updatedSession?.expires_at).toBe(newExpiry);
});

test("Delete session and verify", async () => {
    const sessionId = crypto.randomUUID();
    await createSession({
        session_id: sessionId,
        user_id: testUserId,
        created_at: Date.now(),
        expires_at: Date.now() + 3600000
    });
    const session = await getSessionById(sessionId);
    expect(session).toBeDefined();

    await deleteSession(sessionId);

    const deletedSession = await getSessionById(sessionId);
    expect(deletedSession).toBeUndefined();
});
