import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, closeDb } from '../database';
import {
    createAgent,
    getAgentById,
    getAgentByName,
    updateAgent,
    deleteAgent,
    getAllAgents
} from '../utils';

let testAgentId: string;

beforeAll(async () => {
    await getDb();
    // Clean up test agent
    const existingAgent = await getAgentByName('testagent');
    if (existingAgent) {
        await deleteAgent(existingAgent.id);
    }
});

afterAll(async () => {
    if (testAgentId) await deleteAgent(testAgentId);
    await closeDb();
});

test("Create a new agent", async () => {
    testAgentId = crypto.randomUUID();
    await createAgent({
        id: testAgentId,
        name: 'testagent',
        instruction: 'Test instruction for agent',
        metric_ids: ['metric1', 'metric2']
    });
    const agent = await getAgentById(testAgentId);
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('testagent');
    expect(agent?.instruction).toBe('Test instruction for agent');
    expect(agent?.metric_ids).toEqual(['metric1', 'metric2']);
});

test("Get agent by ID", async () => {
    expect(testAgentId).toBeDefined();
    const agent = await getAgentById(testAgentId);
    expect(agent).toBeDefined();
    expect(agent?.id).toBe(testAgentId);
});

test("Get agent by name", async () => {
    expect(testAgentId).toBeDefined();
    const agent = await getAgentByName('testagent');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('testagent');
});

test("Get all agents", async () => {
    const agents = await getAllAgents();
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.some(agent => agent.id === testAgentId)).toBe(true);
});

test("Update agent", async () => {
    expect(testAgentId).toBeDefined();
    await updateAgent(testAgentId, {
        name: 'updatedagent',
        instruction: 'Updated instruction for agent',
        metric_ids: ['updated_metric1']
    });
    const updatedAgent = await getAgentById(testAgentId);
    expect(updatedAgent?.name).toBe('updatedagent');
    expect(updatedAgent?.instruction).toBe('Updated instruction for agent');
    expect(updatedAgent?.metric_ids).toEqual(['updated_metric1']);
});

test("Delete agent and verify", async () => {
    const agentId = crypto.randomUUID();
    await createAgent({
        id: agentId,
        name: 'testagent-delete',
        instruction: 'Instruction for agent to be deleted',
        metric_ids: ['delete_metric']
    });
    const agent = await getAgentById(agentId);
    expect(agent).toBeDefined();

    await deleteAgent(agentId);

    const deletedAgent = await getAgentById(agentId);
    expect(deletedAgent).toBeUndefined();
});