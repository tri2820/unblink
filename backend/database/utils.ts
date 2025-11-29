import type { Database } from '@tursodatabase/database';
import { getDb } from './database';
import type { Media, MediaUnit, Secret, Session, Setting, User, Agent, Moment, AgentResponse } from '~/shared/database';
import type { RESTQuery, RESTSelect, RESTInsert, RESTUpdate, RESTDelete, RESTWhereField } from '~/shared';


import { executeREST } from './rest';

// Media utilities
function processMediaRow(row: any): Media {
    if (!row) return row;
    try {
        if (typeof row.labels === 'string') {
            row.labels = JSON.parse(row.labels);
        }
    } catch (e) {
        console.error(`Failed to parse labels for media ${row.id}:`, row.labels);
        row.labels = []; // Default to empty array on error
    }

    return row as Media;
}

export async function getMediaById(id: string): Promise<Media | undefined> {
    const rows = await executeREST({
        table: 'media',
        where: [{ field: 'id', op: 'equals', value: id }],
        expect: { is: 'single', value_when_no_item: undefined },
        cast: { labels: 'json' }
    });

    if (rows === undefined) return undefined;
    return processMediaRow(rows);
}

export async function getAllMedia(): Promise<Media[]> {
    const rows = await executeREST({
        table: 'media',
        order_by: { field: 'updated_at', direction: 'DESC' },
        limit: 100, // Reasonable limit for "all"
        cast: { labels: 'json' }
    });

    return rows.map(processMediaRow);
}

export async function getMediaByLabel(label: string): Promise<Media[]> {
    const rows = await executeREST({
        table: 'media',
        where: [{ field: 'labels', op: 'like', value: `%"${label}"%` }],
        limit: 100,
        cast: { labels: 'json' }
    });

    return rows.map(processMediaRow);
}

export async function createMedia(media: Media): Promise<void> {
    const updatedAt = Date.now();

    await executeREST({
        type: 'insert',
        table: 'media',
        values: {
            id: media.id,
            name: media.name,
            uri: media.uri,
            labels: media.labels,
            updated_at: updatedAt,
            save_to_disk: media.save_to_disk === undefined ? null : media.save_to_disk,
            save_location: media.save_location === undefined ? null : media.save_location
        },
        cast: { labels: 'json' }
    });
}

export async function updateMedia(id: string, updates: Partial<Omit<Media, 'id'>>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const updatesCopy: any = { ...updates };
    updatesCopy.updated_at = Date.now();

    await executeREST({
        type: 'update',
        table: 'media',
        where: [{ field: 'id', op: 'equals', value: id }],
        values: updatesCopy,
        cast: { labels: 'json' }
    });
}

export async function deleteMedia(id: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'media',
        where: [{ field: 'id', op: 'equals', value: id }]
    });
}

// Settings utilities
export async function getSetting(key: string): Promise<Setting | undefined> {
    return await executeREST({
        table: 'settings',
        where: [{ field: 'key', op: 'equals', value: key }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function getAllSettings(): Promise<Setting[]> {
    const rows = await executeREST({
        table: 'settings',
        limit: 100
    });
    return rows as Setting[];
}

export async function setSetting(key: string, value: string): Promise<void> {
    // Try to update first
    const existing = await getSetting(key);
    if (existing) {
        await executeREST({
            type: 'update',
            table: 'settings',
            where: [{ field: 'key', op: 'equals', value: key }],
            values: { value }
        });
    } else {
        await executeREST({
            type: 'insert',
            table: 'settings',
            values: { key, value }
        });
    }
}

export async function deleteSetting(key: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'settings',
        where: [{ field: 'key', op: 'equals', value: key }]
    });
}




// MediaUnit utilities
export async function createMediaUnit(mediaUnit: MediaUnit) {
    await executeREST({
        type: 'insert',
        table: 'media_units',
        values: {
            id: mediaUnit.id,
            media_id: mediaUnit.media_id,
            at_time: mediaUnit.at_time,
            description: mediaUnit.description || null,
            embedding: mediaUnit.embedding || null,
            path: mediaUnit.path,
            type: mediaUnit.type
        },
        cast: mediaUnit.embedding ? { embedding: 'embedding' } : undefined
    });
}

export async function getMediaUnitById(id: string): Promise<MediaUnit | undefined> {
    return await executeREST({
        table: 'media_units',
        where: [{ field: 'id', op: 'equals', value: id }],
        expect: { is: 'single', value_when_no_item: undefined },
        cast: { embedding: 'embedding' }
    });
}

export async function getMediaUnitsByMediaId(mediaId: string): Promise<MediaUnit[]> {
    const rows = await executeREST({
        table: 'media_units',
        where: [{ field: 'media_id', op: 'equals', value: mediaId }],
        order_by: { field: 'at_time', direction: 'ASC' },
        limit: 1000,
        cast: { embedding: 'embedding' }
    });
    return rows as MediaUnit[];
}

export async function updateMediaUnit(id: string, updates: Partial<Omit<MediaUnit, 'id'>>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    await executeREST({
        type: 'update',
        table: 'media_units',
        where: [{ field: 'id', op: 'equals', value: id }],
        values: updates,
        cast: updates.embedding ? { embedding: 'embedding' } : undefined
    });
}

export async function deleteMediaUnit(id: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'media_units',
        where: [{ field: 'id', op: 'equals', value: id }]
    });
}

// Secret utilities
export async function createSecret(key: string, value: string): Promise<string> {
    await executeREST({
        type: 'insert',
        table: 'secrets',
        values: { key, value }
    });
    return key;
}

export async function getSecret(key: string): Promise<Secret | undefined> {
    return await executeREST({
        table: 'secrets',
        where: [{ field: 'key', op: 'equals', value: key }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function getAllSecrets(): Promise<Secret[]> {
    const rows = await executeREST({
        table: 'secrets',
        limit: 100
    });
    return rows as Secret[];
}

export async function setSecret(key: string, value: string): Promise<void> {
    const existing = await getSecret(key);
    if (existing) {
        await executeREST({
            type: 'update',
            table: 'secrets',
            where: [{ field: 'key', op: 'equals', value: key }],
            values: { value }
        });
    } else {
        await executeREST({
            type: 'insert',
            table: 'secrets',
            values: { key, value }
        });
    }
}

export async function deleteSecret(key: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'secrets',
        where: [{ field: 'key', op: 'equals', value: key }]
    });
}

// Session utilities
export async function createSession(session: Session): Promise<void> {
    await executeREST({
        type: 'insert',
        table: 'sessions',
        values: {
            session_id: session.session_id,
            user_id: session.user_id,
            created_at: session.created_at,
            expires_at: session.expires_at
        }
    });
}

function processSessionRow(row: any): Session {
    if (!row) return row;
    if (row.created_at) row.created_at = new Date(row.created_at).getTime();
    if (row.expires_at) row.expires_at = new Date(row.expires_at).getTime();
    return row as Session;
}

export async function getSessionById(sessionId: string): Promise<Session | undefined> {
    const result = await executeREST({
        table: 'sessions',
        where: [{ field: 'session_id', op: 'equals', value: sessionId }],
        expect: { is: 'single', value_when_no_item: undefined }
    });

    if (result === undefined) return undefined;
    return processSessionRow(result);
}

export async function getSessionsByUserId(userId: string): Promise<Session[]> {
    const rows = await executeREST({
        table: 'sessions',
        where: [{ field: 'user_id', op: 'equals', value: userId }],
        order_by: { field: 'created_at', direction: 'DESC' },
        limit: 100
    });

    return rows.map(processSessionRow);
}

export async function updateSession(sessionId: string, updates: Partial<Omit<Session, 'session_id'>>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    // Convert Date objects to timestamps if needed
    const updatesCopy: any = { ...updates };
    if (updatesCopy.created_at instanceof Date) {
        updatesCopy.created_at = updatesCopy.created_at.getTime();
    }
    if (updatesCopy.expires_at instanceof Date) {
        updatesCopy.expires_at = updatesCopy.expires_at.getTime();
    }

    await executeREST({
        type: 'update',
        table: 'sessions',
        where: [{ field: 'session_id', op: 'equals', value: sessionId }],
        values: updatesCopy
    });
}

export async function deleteSession(sessionId: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'sessions',
        where: [{ field: 'session_id', op: 'equals', value: sessionId }]
    });
}

// User utilities
export async function createUser(user: User): Promise<void> {
    await executeREST({
        type: 'insert',
        table: 'users',
        values: {
            id: user.id,
            username: user.username,
            password_hash: user.password_hash,
            role: user.role
        }
    });
}

export async function getUserById(id: string): Promise<User | undefined> {
    return await executeREST({
        table: 'users',
        where: [{ field: 'id', op: 'equals', value: id }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
    return await executeREST({
        table: 'users',
        where: [{ field: 'username', op: 'equals', value: username }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function updateUser(id: string, updates: Partial<Omit<User, 'id'>>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    await executeREST({
        type: 'update',
        table: 'users',
        where: [{ field: 'id', op: 'equals', value: id }],
        values: updates
    });
}

export async function deleteUser(id: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'users',
        where: [{ field: 'id', op: 'equals', value: id }]
    });
}

export async function getAllUsers(): Promise<User[]> {
    const rows = await executeREST({
        table: 'users',
        limit: 100
    });
    return rows as User[];
}

export async function getAllSessions(): Promise<Session[]> {
    const rows = await executeREST({
        table: 'sessions',
        limit: 100
    });
    return rows.map(processSessionRow);
}

// Function to get media units by embedding (for similarity search)
export async function getMediaUnitsByEmbedding(queryEmbedding: number[], options?: { requireDescription?: boolean }): Promise<(Omit<MediaUnit, 'embedding'> & { distance: number })[]> {
    const whereConditions: RESTWhereField[] = [
        { field: 'embedding', op: 'is_not', value: null }
    ];

    if (options?.requireDescription) {
        whereConditions.push({ field: 'description', op: 'is_not', value: null });
    }

    const vectorStr = `[${queryEmbedding.join(',')}]`;
    const rows = await executeREST({
        table: 'media_units',
        select: [
            'id',
            'media_id', 
            'at_time',
            'description',
            'path',
            'type',
            { value: `vector_distance_cos(embedding, vector32('${vectorStr}'))`, alias: 'distance' }
        ],
        where: whereConditions,
        order_by: { field: 'distance', direction: 'ASC' }, // ASC because lower distance = higher similarity
        limit: 20,
        cast: { embedding: 'embedding' }
    });
    return rows;
}

export async function getMediaUnitsByIds(ids: string[]): Promise<MediaUnit[]> {
    if (ids.length === 0) return [];
    const rows = await executeREST({
        table: 'media_units',
        where: [{ field: 'id', op: 'in', value: ids }],
        limit: ids.length,
        cast: { embedding: 'embedding' }
    });
    return rows as MediaUnit[];
}

export async function getFirstMediaUnitInTimeRange(mediaId: string, startTime: number, endTime: number): Promise<MediaUnit | undefined> {
    return await executeREST({
        table: 'media_units',
        where: [
            { field: 'media_id', op: 'equals', value: mediaId },
            { field: 'at_time', op: 'gte', value: startTime },
            { field: 'at_time', op: 'lte', value: endTime }
        ],
        order_by: { field: 'at_time', direction: 'ASC' },
        expect: { is: 'single', value_when_no_item: undefined },
        cast: { embedding: 'embedding' }
    });
}

export async function getDescribedMediaUnitsInTimeRange(mediaId: string, startTime: number, endTime: number): Promise<MediaUnit[]> {
    const rows = await executeREST({
        table: 'media_units',
        where: [
            { field: 'media_id', op: 'equals', value: mediaId },
            { field: 'at_time', op: 'gte', value: startTime },
            { field: 'at_time', op: 'lte', value: endTime },
            { field: 'description', op: 'is_not', value: null }
        ],
        order_by: { field: 'at_time', direction: 'ASC' },
        limit: 1000,
        cast: { embedding: 'embedding' }
    });
    return rows as MediaUnit[];
}

// Moment utilities
export async function getMomentById(id: string): Promise<Moment | undefined> {
    return await executeREST({
        table: 'moments',
        where: [{ field: 'id', op: 'equals', value: id }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function getAllMoments(): Promise<Moment[]> {
    const rows = await executeREST({
        table: 'moments',
        order_by: { field: 'start_time', direction: 'DESC' },
        limit: 100
    });
    return rows as Moment[];
}

export async function getMomentsByMediaId(mediaId: string): Promise<Moment[]> {
    const rows = await executeREST({
        table: 'moments',
        where: [{ field: 'media_id', op: 'equals', value: mediaId }],
        order_by: { field: 'start_time', direction: 'DESC' },
        limit: 100
    });
    return rows as Moment[];
}

export async function createMoment(moment: Moment): Promise<void> {
    await executeREST({
        type: 'insert',
        table: 'moments',
        values: {
            id: moment.id,
            media_id: moment.media_id,
            start_time: moment.start_time,
            end_time: moment.end_time,
            peak_deviation: moment.peak_deviation || null,
            type: moment.type || null,
            title: moment.title || null,
            description: moment.description || null,
            thumbnail_path: moment.thumbnail_path || null
        }
    });
}

export async function updateMoment(id: string, updates: Partial<Omit<Moment, 'id'>>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    await executeREST({
        type: 'update',
        table: 'moments',
        where: [{ field: 'id', op: 'equals', value: id }],
        values: updates
    });
}

export async function deleteMoment(id: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'moments',
        where: [{ field: 'id', op: 'equals', value: id }]
    });
}

// Agent utilities
export async function createAgent(agent: Agent): Promise<void> {
    await executeREST({
        type: 'insert',
        table: 'agents',
        values: {
            id: agent.id,
            name: agent.name,
            instruction: agent.instruction
        }
    });
}

export async function getAgentById(id: string): Promise<Agent | undefined> {
    return await executeREST({
        table: 'agents',
        where: [{ field: 'id', op: 'equals', value: id }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function getAgentByName(name: string): Promise<Agent | undefined> {
    return await executeREST({
        table: 'agents',
        where: [{ field: 'name', op: 'equals', value: name }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function getAllAgents(): Promise<Agent[]> {
    const rows = await executeREST({
        table: 'agents',
        limit: 100
    });
    return rows as Agent[];
}

export async function updateAgent(id: string, updates: Partial<Omit<Agent, 'id'>>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    await executeREST({
        type: 'update',
        table: 'agents',
        where: [{ field: 'id', op: 'equals', value: id }],
        values: updates
    });
}

export async function deleteAgent(id: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'agents',
        where: [{ field: 'id', op: 'equals', value: id }]
    });
}

// Agent Response functions
export async function createAgentResponse(agentResponse: AgentResponse): Promise<void> {
    await executeREST({
        type: 'insert',
        table: 'agent_responses',
        values: {
            id: agentResponse.id,
            agent_id: agentResponse.agent_id,
            media_unit_id: agentResponse.media_unit_id,
            content: agentResponse.content,
            created_at: agentResponse.created_at
        }
    });
}

export async function getAgentResponsesByMediaUnit(media_unit_id: string): Promise<AgentResponse[]> {
    const rows = await executeREST({
        table: 'agent_responses',
        where: [{ field: 'media_unit_id', op: 'equals', value: media_unit_id }],
        order_by: { field: 'created_at', direction: 'DESC' },
        limit: 100
    });
    return rows as AgentResponse[];
}

export async function getAgentResponsesByAgent(agent_id: string): Promise<AgentResponse[]> {
    const rows = await executeREST({
        table: 'agent_responses',
        where: [{ field: 'agent_id', op: 'equals', value: agent_id }],
        order_by: { field: 'created_at', direction: 'DESC' },
        limit: 100
    });
    return rows as AgentResponse[];
}

export async function getAgentResponseById(id: string): Promise<AgentResponse | undefined> {
    return await executeREST({
        table: 'agent_responses',
        where: [{ field: 'id', op: 'equals', value: id }],
        expect: { is: 'single', value_when_no_item: undefined }
    });
}

export async function getAllAgentResponses(): Promise<AgentResponse[]> {
    const rows = await executeREST({
        table: 'agent_responses',
        order_by: { field: 'created_at', direction: 'DESC' },
        limit: 100
    });
    return rows as AgentResponse[];
}

export async function deleteAgentResponse(id: string): Promise<void> {
    await executeREST({
        type: 'delete',
        table: 'agent_responses',
        where: [{ field: 'id', op: 'equals', value: id }]
    });
}