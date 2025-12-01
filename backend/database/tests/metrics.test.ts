import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from '../database';
import {
    createMetric,
    getMetricById,
    getAllMetrics,
    updateMetric,
    deleteMetric
} from '../utils';

let testMetricId: string;

beforeAll(async () => {
    await getDb();
});

afterAll(async () => {
    if (testMetricId) await deleteMetric(testMetricId);
    await closeDb();
});

test("Create a new metric entry", async () => {
    testMetricId = crypto.randomUUID();
    await createMetric({
        id: testMetricId,
        entailment: 'Person is walking',
        contradiction: 'Person is sitting'
    });

    const metric = await getMetricById(testMetricId);
    expect(metric).toBeDefined();
    expect(metric?.id).toBe(testMetricId);
    expect(metric?.entailment).toBe('Person is walking');
    expect(metric?.contradiction).toBe('Person is sitting');
});

test("Get metric by ID", async () => {
    expect(testMetricId).toBeDefined();
    const metric = await getMetricById(testMetricId);
    expect(metric).toBeDefined();
    expect(metric?.id).toBe(testMetricId);
});

test("Get all metrics", async () => {
    const allMetrics = await getAllMetrics();
    expect(allMetrics).toBeArray();
    expect(allMetrics.length).toBeGreaterThan(0);
});

test("Update metric entailment", async () => {
    expect(testMetricId).toBeDefined();
    await updateMetric(testMetricId, { entailment: 'Person is running' });
    const updatedMetric = await getMetricById(testMetricId);
    expect(updatedMetric?.entailment).toBe('Person is running');
});

test("Update metric contradiction", async () => {
    expect(testMetricId).toBeDefined();
    await updateMetric(testMetricId, { contradiction: 'Person is standing still' });
    const updatedMetric = await getMetricById(testMetricId);
    expect(updatedMetric?.contradiction).toBe('Person is standing still');
});

test("Delete metric and verify", async () => {
    const metricId = crypto.randomUUID();
    await createMetric({
        id: metricId,
        entailment: 'Test entailment',
        contradiction: 'Test contradiction'
    });

    const metric = await getMetricById(metricId);
    expect(metric).toBeDefined();

    await deleteMetric(metricId);

    const deletedMetric = await getMetricById(metricId);
    expect(deletedMetric).toBeUndefined();
});

test("Get non-existent metric returns undefined", async () => {
    const metric = await getMetricById('non_existent_id');
    expect(metric).toBeUndefined();
});