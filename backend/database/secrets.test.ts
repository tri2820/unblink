import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from './database';
import {
    createSecret,
    getSecret,
    getAllSecrets,
    setSecret,
    deleteSecret
} from './utils';

let testSecretKey: string;

beforeAll(async () => {
    await getDb();
    // Clean up test secrets
    const existingApiKey = await getSecret('api_key');
    if (existingApiKey) await deleteSecret('api_key');
    const existingAnotherKey = await getSecret('another_key');
    if (existingAnotherKey) await deleteSecret('another_key');
});

afterAll(async () => {
    if (testSecretKey) await deleteSecret(testSecretKey);
    await deleteSecret('another_key');
    await closeDb();
});

test("Create a new secret", async () => {
    testSecretKey = await createSecret('api_key', 'supersecretkey');
    expect(testSecretKey).toBeString();
    const secret = await getSecret(testSecretKey);
    expect(secret).toBeDefined();
    expect(secret?.value).toBe('supersecretkey');
});

test("Set secret (update existing)", async () => {
    expect(testSecretKey).toBeDefined();
    await setSecret(testSecretKey, 'updatedsupersecretkey');
    const updatedSecret = await getSecret(testSecretKey);
    expect(updatedSecret?.value).toBe('updatedsupersecretkey');
});

test("Set secret (create new)", async () => {
    await setSecret('another_key', 'another_value');
    const anotherSecret = await getSecret('another_key');
    expect(anotherSecret).toBeDefined();
    expect(anotherSecret?.value).toBe('another_value');
    await deleteSecret('another_key');
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

test("Delete secret and verify", async () => {
    await createSecret('test_secret_delete', 'secret_value_delete');
    const secret = await getSecret('test_secret_delete');
    expect(secret).toBeDefined();

    await deleteSecret('test_secret_delete');

    const deletedSecret = await getSecret('test_secret_delete');
    expect(deletedSecret).toBeUndefined();
});
