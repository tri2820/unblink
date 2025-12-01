import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from '../database';
import {
    createAgent,
    deleteAgent,
    createMediaUnit,
    createAgentResponse,
    getAgentResponseById,
    getAgentResponsesByMediaUnit,
    getAgentResponsesByAgent,
} from '../utils';

let testAgentId: string;
let testMediaUnitId: string;
let testResponseId1: string;
let testResponseId2: string;

beforeAll(async () => {
    await getDb();
    
    // Create test agent
    testAgentId = crypto.randomUUID();
    await createAgent({
        id: testAgentId,
        name: 'test-response-agent',
        instruction: 'Test instruction for response testing'
    });

    // Create test media unit
    testMediaUnitId = crypto.randomUUID();
    await createMediaUnit({
        id: testMediaUnitId,
        media_id: 'test-media-id',
        at_time: Date.now(),
        description: null,
        path: '/tmp/test.jpg',
        type: 'frame'
    });
});

afterAll(async () => {
    // Clean up test data
    if (testAgentId) await deleteAgent(testAgentId);
    await closeDb();
});

test("Create a new agent response", async () => {
    testResponseId1 = `${testMediaUnitId}_${testAgentId}_${Date.now()}`;
    await createAgentResponse({
        id: testResponseId1,
        agent_id: testAgentId,
        media_unit_id: testMediaUnitId,
        content: 'This is a test response from the agent',
        created_at: Date.now(),
    });
    
    const response = await getAgentResponseById(testResponseId1);
    expect(response).toBeDefined();
    expect(response?.agent_id).toBe(testAgentId);
    expect(response?.media_unit_id).toBe(testMediaUnitId);
    expect(response?.content).toBe('This is a test response from the agent');
});

test("Create second agent response for same media unit", async () => {
    testResponseId2 = `${testMediaUnitId}_${testAgentId}_${Date.now() + 1}`;
    await createAgentResponse({
        id: testResponseId2,
        agent_id: testAgentId,
        media_unit_id: testMediaUnitId,
        content: 'This is a second test response from the agent',
        created_at: Date.now() + 1000,
    });
    
    const response = await getAgentResponseById(testResponseId2);
    expect(response).toBeDefined();
    expect(response?.content).toBe('This is a second test response from the agent');
});

test("Get agent response by ID", async () => {
    expect(testResponseId1).toBeDefined();
    const response = await getAgentResponseById(testResponseId1);
    expect(response).toBeDefined();
    expect(response?.id).toBe(testResponseId1);
    expect(response?.agent_id).toBe(testAgentId);
    expect(response?.media_unit_id).toBe(testMediaUnitId);
});

test("Get all agent responses for a media unit", async () => {
    const responses = await getAgentResponsesByMediaUnit(testMediaUnitId);
    expect(responses.length).toBeGreaterThanOrEqual(2);
    expect(responses.some(r => r.id === testResponseId1)).toBe(true);
    expect(responses.some(r => r.id === testResponseId2)).toBe(true);
});

test("Get all agent responses from a specific agent", async () => {
    const responses = await getAgentResponsesByAgent(testAgentId);
    expect(responses.length).toBeGreaterThanOrEqual(2);
    expect(responses.every(r => r.agent_id === testAgentId)).toBe(true);
});

test("Agent responses are ordered by created_at DESC", async () => {
    const responses = await getAgentResponsesByMediaUnit(testMediaUnitId);
    expect(responses.length).toBeGreaterThanOrEqual(2);
    
    // Check that responses are ordered newest first
    for (let i = 0; i < responses.length - 1; i++) {
        const current = responses[i];
        const next = responses[i + 1];
        if (current && next) {
            expect(current.created_at).toBeGreaterThanOrEqual(next.created_at);
        }
    }
});

test("Multiple agents can respond to same media unit", async () => {
    // Create another agent
    const secondAgentId = crypto.randomUUID();
    await createAgent({
        id: secondAgentId,
        name: 'test-response-agent-2',
        instruction: 'Second test agent'
    });

    // Create response from second agent
    const secondResponseId = `${testMediaUnitId}_${secondAgentId}_${Date.now()}`;
    await createAgentResponse({
        id: secondResponseId,
        agent_id: secondAgentId,
        media_unit_id: testMediaUnitId,
        content: 'Response from second agent',
        created_at: Date.now(),
    });

    // Get all responses for the media unit
    const responses = await getAgentResponsesByMediaUnit(testMediaUnitId);
    expect(responses.length).toBeGreaterThanOrEqual(3);
    
    // Check that we have responses from both agents
    const agentIds = new Set(responses.map(r => r.agent_id));
    expect(agentIds.has(testAgentId)).toBe(true);
    expect(agentIds.has(secondAgentId)).toBe(true);

    // Clean up
    await deleteAgent(secondAgentId);
});

test("Get non-existent agent response returns undefined", async () => {
    const response = await getAgentResponseById('non-existent-id');
    expect(response).toBeUndefined();
});

test("Get responses for non-existent media unit returns empty array", async () => {
    const responses = await getAgentResponsesByMediaUnit('non-existent-media-unit');
    expect(responses).toEqual([]);
});

test("Get responses for non-existent agent returns empty array", async () => {
    const responses = await getAgentResponsesByAgent('non-existent-agent');
    expect(responses).toEqual([]);
});
