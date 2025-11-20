import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from './database';
import {
    getAllSettings,
    getSetting,
    setSetting,
    deleteSetting
} from './utils';

beforeAll(async () => {
    await getDb();
    // Clean up test settings
    const testSetting = await getSetting('test_setting');
    if (testSetting) {
        await deleteSetting('test_setting');
    }
});

afterAll(async () => {
    await deleteSetting('test_setting');
    await closeDb();
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

test("Set a new setting", async () => {
    await setSetting('test_setting', 'test_value');
    const setting = await getSetting('test_setting');
    expect(setting).toBeDefined();
    expect(setting?.value).toBe('test_value');
    await deleteSetting('test_setting');
});

test("Delete setting and verify", async () => {
    await setSetting('test_setting_delete', 'test_value_delete');
    const setting = await getSetting('test_setting_delete');
    expect(setting).toBeDefined();

    await deleteSetting('test_setting_delete');

    const deletedSetting = await getSetting('test_setting_delete');
    expect(deletedSetting).toBeUndefined();
});
