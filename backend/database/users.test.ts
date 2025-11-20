import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from './database';
import {
    createUser,
    getUserById,
    getUserByUsername,
    updateUser,
    deleteUser
} from './utils';

let testUserId: string;

beforeAll(async () => {
    await getDb();
    // Clean up test user
    const existingUser = await getUserByUsername('testuser');
    if (existingUser) {
        await deleteUser(existingUser.id);
    }
});

afterAll(async () => {
    if (testUserId) await deleteUser(testUserId);
    await closeDb();
});

test("Create a new user", async () => {
    testUserId = crypto.randomUUID();
    await createUser({
        id: testUserId,
        username: 'testuser',
        password_hash: 'hashedpassword123',
        role: 'admin'
    });
    const user = await getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.username).toBe('testuser');
});

test("Get user by ID", async () => {
    expect(testUserId).toBeDefined();
    const user = await getUserById(testUserId);
    expect(user).toBeDefined();
    expect(user?.id).toBe(testUserId);
});

test("Get user by username", async () => {
    expect(testUserId).toBeDefined();
    const user = await getUserByUsername('testuser');
    expect(user).toBeDefined();
    expect(user?.username).toBe('testuser');
});

test("Update user", async () => {
    expect(testUserId).toBeDefined();
    await updateUser(testUserId, { role: 'editor' });
    const updatedUser = await getUserById(testUserId);
    expect(updatedUser?.role).toBe('editor');
});

test("Delete user and verify", async () => {
    const userId = crypto.randomUUID();
    await createUser({
        id: userId,
        username: 'testuser-delete',
        password_hash: 'hashedpassworddelete',
        role: 'user'
    });
    const user = await getUserById(userId);
    expect(user).toBeDefined();

    await deleteUser(userId);

    const deletedUser = await getUserById(userId);
    expect(deletedUser).toBeUndefined();
});
