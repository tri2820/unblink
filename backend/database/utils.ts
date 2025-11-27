import type { Database } from '@tursodatabase/database';
import { getDb } from './database';
import type { Media, MediaUnit, Secret, Session, Setting, User, Agent, Moment, AgentResponse } from '~/shared/database';
import type { RESTQuery } from '~/shared';


// Media utilities
export async function getMediaById(id: string): Promise<Media | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM media WHERE id = ?');
    const row = await stmt.get(id) as any;

    if (row) {
        try {
            row.labels = JSON.parse(row.labels);
        } catch (e) {
            console.error(`Failed to parse labels for media ${id}:`, row.labels);
            row.labels = []; // Default to empty array on error
        }

        // Handle better-sqlite3's 0 to null conversion for INTEGER columns like save_to_disk
        if (row.save_to_disk === null) {
            row.save_to_disk = 0;
        } else if (row.save_to_disk !== undefined) {
            row.save_to_disk = Number(row.save_to_disk);
        }
    }
    return row as Media | undefined;
}

export async function getAllMedia(): Promise<Media[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM media ORDER BY updated_at DESC');
    const rows = await stmt.all() as any[];

    return rows.map(row => {
        try {
            row.labels = JSON.parse(row.labels);
        } catch (e) {
            console.error(`Failed to parse labels for media ${row.id}:`, row.labels);
            row.labels = []; // Default to empty array on error
        }
        return row;
    }) as Media[];
}

export async function getMediaByLabel(label: string): Promise<Media[]> {
    const db = await getDb();
    const stmt = db.prepare("SELECT * FROM media WHERE labels LIKE ?");
    const rows = await stmt.all(`%"${label}"%`) as any[]; // Search for label inside JSON array string

    return rows.map(row => {
        try {
            row.labels = JSON.parse(row.labels);
        } catch (e) {
            console.error(`Failed to parse labels for media ${row.id}:`, row.labels);
            row.labels = []; // Default to empty array on error
        }
        return row;
    }) as Media[];
}

export async function createMedia(media: Media): Promise<void> {
    const db = await getDb();
    const updatedAt = Date.now();

    const stmt = db.prepare(`
        INSERT INTO media (id, name, uri, labels, updated_at, save_to_disk, save_location) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
        media.id,
        media.name,
        media.uri,
        JSON.stringify(media.labels),
        updatedAt,
        media.save_to_disk === undefined ? null : media.save_to_disk,
        media.save_location === undefined ? null : media.save_location
    );
}

export async function updateMedia(id: string, updates: Partial<Omit<Media, 'id'>>): Promise<void> {
    const db = await getDb();

    // Build dynamic update query
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const updatesCopy: any = { ...updates };
    if (updatesCopy.labels) {
        updatesCopy.labels = JSON.stringify(updatesCopy.labels);
    }

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updatesCopy[field]);

    const stmt = db.prepare(`UPDATE media SET ${setClause}, updated_at = ? WHERE id = ?`);
    await stmt.run(...values, Date.now(), id);
}

export async function deleteMedia(id: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM media WHERE id = ?');
    await stmt.run(id);
}

// Settings utilities
export async function getSetting(key: string): Promise<Setting | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM settings WHERE key = ?');
    return await stmt.get(key) as Setting | undefined;
}

export async function getAllSettings(): Promise<Setting[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM settings');
    return await stmt.all() as Setting[];
}

export async function setSetting(key: string, value: string): Promise<void> {
    const db = await getDb();

    // Try to update first, if no rows affected then insert
    const updateStmt = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    const result = await updateStmt.run(value, key);

    if (result.changes === 0) {
        // If no rows were updated, insert the new setting
        const insertStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        await insertStmt.run(key, value);
    }
}

export async function deleteSetting(key: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM settings WHERE key = ?');
    await stmt.run(key);
}


export async function batch_exec<T>(props: {
    db: Database;
    table: string;
    entries: T[];
    statement: string;
    // Ordered list of parameters for the prepared statement
    transform: (entry: T) => (string | number | null)[];
}) {
    console.log(`Onboarding entries into table '${props.table}'...`);
    try {
        await props.db.exec("BEGIN TRANSACTION;");

        const stmt = props.db.prepare(props.statement);
        for (const entry of props.entries) {
            const args = props.transform(entry);
            await stmt.run(...args);
        }

        await props.db.exec("COMMIT;");
        console.log(`Successfully onboarded ${props.entries.length} entries into '${props.table}'.`);

    } catch (error) {
        console.error(`Error during '${props.table}' onboarding:`, error);
        await props.db.exec("ROLLBACK;");
        throw error;
    }
}

// MediaUnit utilities
export async function createMediaUnit(mediaUnit: MediaUnit) {
    const db = await getDb();

    const stmt = db.prepare(`
        INSERT INTO media_units (id, media_id, at_time, description, embedding, path, type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return await stmt.run(
        mediaUnit.id,
        mediaUnit.media_id,
        mediaUnit.at_time,
        mediaUnit.description || null,
        mediaUnit.embedding || null,
        mediaUnit.path,
        mediaUnit.type
    );
}

export async function getMediaUnitById(id: string): Promise<MediaUnit | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM media_units WHERE id = ?');
    return await stmt.get(id) as MediaUnit | undefined;
}

export async function getMediaUnitsByMediaId(mediaId: string): Promise<MediaUnit[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM media_units WHERE media_id = ? ORDER BY at_time ASC');
    return await stmt.all(mediaId) as MediaUnit[];
}

export async function updateMediaUnit(id: string, updates: Partial<Omit<MediaUnit, 'id'>>): Promise<void> {
    const db = await getDb();

    const fields = Object.keys(updates);
    if (fields.length === 0) return;


    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => (updates as any)[field]);

    const stmt = db.prepare(`UPDATE media_units SET ${setClause} WHERE id = ?`);
    await stmt.run(...values, id);
}

export async function deleteMediaUnit(id: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM media_units WHERE id = ?');
    await stmt.run(id);
}

// Secret utilities
export async function createSecret(key: string, value: string): Promise<string> {
    const db = await getDb();
    const stmt = db.prepare('INSERT INTO secrets (key, value) VALUES (?, ?)');
    await stmt.run(key, value);
    return key;
}

export async function getSecret(key: string): Promise<Secret | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM secrets WHERE key = ?');
    return await stmt.get(key) as Secret | undefined;
}

export async function getAllSecrets(): Promise<Secret[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM secrets');
    return await stmt.all() as Secret[];
}

export async function setSecret(key: string, value: string): Promise<void> {
    const db = await getDb();
    const updateStmt = db.prepare('UPDATE secrets SET value = ? WHERE key = ?');
    const result = await updateStmt.run(value, key);

    if (result.changes === 0) {
        const insertStmt = db.prepare('INSERT INTO secrets (key, value) VALUES (?, ?)');
        await insertStmt.run(key, value);
    }
}

export async function deleteSecret(key: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM secrets WHERE key = ?');
    await stmt.run(key);
}

// Session utilities
export async function createSession(session: Session): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare(`
        INSERT INTO sessions (session_id, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    `);
    await stmt.run(session.session_id, session.user_id, session.created_at, session.expires_at);
}

export async function getSessionById(sessionId: string): Promise<Session | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    const row = await stmt.get(sessionId) as any;

    if (row) {
        // Convert timestamps to numbers if they're stored as Date objects
        if (row.created_at) row.created_at = new Date(row.created_at).getTime();
        if (row.expires_at) row.expires_at = new Date(row.expires_at).getTime();
    }

    return row as Session | undefined;
}

export async function getSessionsByUserId(userId: string): Promise<Session[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC');
    const rows = await stmt.all(userId) as any[];

    // Convert timestamps if needed
    return rows.map(row => {
        if (row.created_at) row.created_at = new Date(row.created_at).getTime();
        if (row.expires_at) row.expires_at = new Date(row.expires_at).getTime();
        return row as Session;
    });
}

export async function updateSession(sessionId: string, updates: Partial<Omit<Session, 'session_id'>>): Promise<void> {
    const db = await getDb();
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

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updatesCopy[field]);

    const stmt = db.prepare(`UPDATE sessions SET ${setClause} WHERE session_id = ?`);
    await stmt.run(...values, sessionId);
}

export async function deleteSession(sessionId: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM sessions WHERE session_id = ?');
    await stmt.run(sessionId);
}

// User utilities
export async function createUser(user: User): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare(`
        INSERT INTO users (id, username, password_hash, role)
        VALUES (?, ?, ?, ?)
    `);
    await stmt.run(user.id, user.username, user.password_hash, user.role);
}

export async function getUserById(id: string): Promise<User | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return await stmt.get(id) as User | undefined;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    return await stmt.get(username) as User | undefined;
}

export async function updateUser(id: string, updates: Partial<Omit<User, 'id'>>): Promise<void> {
    const db = await getDb();
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => (updates as any)[field]);

    const stmt = db.prepare(`UPDATE users SET ${setClause} WHERE id = ?`);
    await stmt.run(...values, id);
}

export async function deleteUser(id: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    await stmt.run(id);
}

export async function getAllUsers(): Promise<User[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM users');
    return await stmt.all() as User[];
}

export async function getAllSessions(): Promise<Session[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM sessions');
    return await stmt.all() as Session[];
}

// Function to get media units by embedding (for similarity search)
export async function getMediaUnitsByEmbedding(queryEmbedding: number[], options?: { requireDescription?: boolean }): Promise<(Omit<MediaUnit, 'embedding'> & { similarity: number })[]> {
    const db = await getDb();
    const queryEmbeddingStr = `[${queryEmbedding.join(',')}]`;
    
    let whereClause = 'WHERE embedding IS NOT NULL';
    if (options?.requireDescription) {
        whereClause += ' AND description IS NOT NULL';
    }
    
    const stmt = db.prepare(`
        SELECT 
            id, 
            media_id, 
            at_time, 
            description, 
            vector_distance_cos(embedding, vector32('${queryEmbeddingStr}')) AS similarity,
            path, 
            type
        FROM media_units 
        ${whereClause}
        ORDER BY similarity
        LIMIT 20
    `);

    // Execute the query and return results
    const rows = await stmt.all();
    return rows;
}

// Cache for database schema
let schemaCache: Record<string, string[]> | null = null;

// Get database schema dynamically
async function getDatabaseSchema(): Promise<Record<string, string[]>> {
    if (schemaCache) {
        return schemaCache;
    }

    const db = await getDb();
    const schema: Record<string, string[]> = {};

    // Get all table names
    const tables = await db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%'
    `).all() as { name: string }[];

    // For each table, get its columns
    for (const table of tables) {
        const columns = await db.prepare(`PRAGMA table_info(${table.name})`).all() as { name: string }[];
        schema[table.name] = columns.map(col => col.name);
    }

    schemaCache = schema;
    return schema;
}

// Clear schema cache (useful for testing or after schema changes)
export function clearSchemaCache(): void {
    schemaCache = null;
}

// SQL identifier validation - alphanumeric, underscore, and dot only
function isValidIdentifier(identifier: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?( as [a-zA-Z_][a-zA-Z0-9_]*)?$/.test(identifier);
}

// Validate table name exists in schema
async function validateTable(table: string): Promise<void> {
    const schema = await getDatabaseSchema();
    if (!(table in schema)) {
        throw new Error(`Invalid table: ${table}. Allowed tables: ${Object.keys(schema).join(', ')}`);
    }
}

// Validate field is either in table's whitelist or is a qualified field (table.column)
async function validateField(field: string, allowedTables: Set<string>): Promise<void> {
    if (!isValidIdentifier(field)) {
        throw new Error(`Invalid field identifier: ${field}`);
    }

    // Handle "table.column" or "table.column as alias"
    const parts = field.split(/\s+as\s+/i);
    const fieldPath = parts[0]?.trim();
    
    if (!fieldPath) {
        throw new Error(`Invalid field: ${field}`);
    }
    
    const schema = await getDatabaseSchema();
    
    if (fieldPath.includes('.')) {
        const splitParts = fieldPath.split('.');
        const tableName = splitParts[0];
        const columnName = splitParts[1];
        
        if (!tableName || !columnName) {
            throw new Error(`Invalid qualified field: ${field}`);
        }
        
        await validateTable(tableName);
        
        const allowedColumns = schema[tableName];
        if (!allowedColumns || !allowedColumns.includes(columnName)) {
            throw new Error(`Invalid column ${columnName} for table ${tableName}`);
        }
    } else {
        // For non-qualified fields, check if any allowed table has this column
        let found = false;
        for (const table of allowedTables) {
            const columns = schema[table];
            if (columns && columns.includes(fieldPath)) {
                found = true;
                break;
            }
        }
        if (!found) {
            throw new Error(`Invalid field: ${fieldPath}`);
        }
    }
}

export async function getByQuery(query: RESTQuery): Promise<any[]> {
    const db = await getDb();

    // Get schema once for all validations
    const schema = await getDatabaseSchema();

    // Validate main table
    await validateTable(query.table);
    
    // Track all tables involved for field validation
    const allowedTables = new Set<string>([query.table]);

    // Validate and build select clause
    let selectClause = '*';
    if (query.select && query.select.length > 0) {
        if (query.select.length > 50) {
            throw new Error('Too many select fields (max 50)');
        }
        
        for (const field of query.select) {
            await validateField(field, allowedTables);
        }
        selectClause = query.select.join(', ');
    }

    let sql = `SELECT ${selectClause} FROM ${query.table}`;
    
    // Validate and handle joins
    if (query.joins && query.joins.length > 0) {
        if (query.joins.length > 10) {
            throw new Error('Too many joins (max 10)');
        }
        
        for (const join of query.joins) {
            await validateTable(join.table);
            allowedTables.add(join.table);
            
            // Validate join fields
            if (!isValidIdentifier(join.on.left) || !isValidIdentifier(join.on.right)) {
                throw new Error(`Invalid join field identifiers`);
            }
            
            const leftColumns = schema[query.table];
            const rightColumns = schema[join.table];
            
            if (!leftColumns || !leftColumns.includes(join.on.left)) {
                throw new Error(`Invalid left join field: ${join.on.left}`);
            }
            if (!rightColumns || !rightColumns.includes(join.on.right)) {
                throw new Error(`Invalid right join field: ${join.on.right}`);
            }
            
            sql += ` LEFT JOIN ${join.table} ON ${query.table}.${join.on.left} = ${join.table}.${join.on.right}`;
        }
    }

    const conditions: string[] = [];
    const values: any[] = [];

    // Validate and build WHERE clause
    if (query.where && query.where.length > 0) {
        if (query.where.length > 20) {
            throw new Error('Too many WHERE conditions (max 20)');
        }
        
        for (const condition of query.where) {
            await validateField(condition.field, allowedTables);
            
            switch (condition.op) {
                case 'equals':
                    conditions.push(`${condition.field} = ?`);
                    values.push(condition.value);
                    break;
                case 'in':
                    if (!Array.isArray(condition.value)) {
                        throw new Error('IN operator requires array value');
                    }
                    if (condition.value.length > 100) {
                        throw new Error('Too many values in IN clause (max 100)');
                    }
                    const placeholders = condition.value.map(() => '?').join(', ');
                    conditions.push(`${condition.field} IN (${placeholders})`);
                    values.push(...condition.value);
                    break;
                case 'is_not':
                    conditions.push(`${condition.field} IS NOT ?`);
                    values.push(condition.value);
                    break;
                case 'like':
                    if (typeof condition.value !== 'string') {
                        throw new Error('LIKE operator requires string value');
                    }
                    conditions.push(`${condition.field} LIKE ?`);
                    values.push(condition.value);
                    break;
                default:
                    throw new Error(`Unsupported operation: ${condition.op}`);
            }
        }
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Validate and build ORDER BY clause
    if (query.order_by) {
        await validateField(query.order_by.field, allowedTables);
        
        if (query.order_by.direction !== 'ASC' && query.order_by.direction !== 'DESC') {
            throw new Error('Invalid ORDER BY direction');
        }
        
        sql += ` ORDER BY ${query.order_by.field} ${query.order_by.direction}`;
    }

    // Validate and apply LIMIT
    let limit = query.limit || 50;
    if (typeof limit !== 'number' || limit < 1 || limit > 200) {
        limit = Math.min(Math.max(1, limit), 200);
    }
    sql += ` LIMIT ?`;
    values.push(limit);

    const stmt = db.prepare(sql);
    const rows = await stmt.all(...values);
    return rows;
}

export async function getMediaUnitsByIds(ids: string[]): Promise<MediaUnit[]> {
    if (ids.length === 0) return [];
    const db = await getDb();

    const placeholders = ids.map(() => '?').join(', ');
    const sql = `SELECT * FROM media_units WHERE id IN (${placeholders})`;

    const stmt = db.prepare(sql);
    const rows = await stmt.all(...ids) as MediaUnit[];
    return rows;
}

export async function getFirstMediaUnitInTimeRange(mediaId: string, startTime: number, endTime: number): Promise<MediaUnit | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM media_units WHERE media_id = ? AND at_time >= ? AND at_time <= ? ORDER BY at_time ASC LIMIT 1');
    return await stmt.get(mediaId, startTime, endTime) as MediaUnit | undefined;
}

export async function getDescribedMediaUnitsInTimeRange(mediaId: string, startTime: number, endTime: number): Promise<MediaUnit[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM media_units WHERE media_id = ? AND at_time >= ? AND at_time <= ? AND description IS NOT NULL ORDER BY at_time ASC');
    return await stmt.all(mediaId, startTime, endTime) as MediaUnit[];
}

// Moment utilities
export async function getMomentById(id: string): Promise<Moment | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM moments WHERE id = ?');
    return await stmt.get(id) as Moment | undefined;
}

export async function getAllMoments(): Promise<Moment[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM moments ORDER BY start_time DESC');
    return await stmt.all() as Moment[];
}

export async function getMomentsByMediaId(mediaId: string): Promise<Moment[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM moments WHERE media_id = ? ORDER BY start_time DESC');
    return await stmt.all(mediaId) as Moment[];
}

export async function createMoment(moment: Moment): Promise<void> {
    const db = await getDb();

    const stmt = db.prepare(`
        INSERT INTO moments (id, media_id, start_time, end_time, peak_deviation, type, title, description, thumbnail_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
        moment.id,
        moment.media_id,
        moment.start_time,
        moment.end_time,
        moment.peak_deviation || null,
        moment.type || null,
        moment.title || null,
        moment.description || null,
        moment.thumbnail_path || null
    );
}

export async function updateMoment(id: string, updates: Partial<Omit<Moment, 'id'>>): Promise<void> {
    const db = await getDb();

    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => (updates as any)[field]);

    const stmt = db.prepare(`UPDATE moments SET ${setClause} WHERE id = ?`);
    await stmt.run(...values, id);
}

export async function deleteMoment(id: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM moments WHERE id = ?');
    await stmt.run(id);
}

// Agent utilities
export async function createAgent(agent: Agent): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare(`
        INSERT INTO agents (id, name, instruction)
        VALUES (?, ?, ?)
    `);
    await stmt.run(agent.id, agent.name, agent.instruction);
}

export async function getAgentById(id: string): Promise<Agent | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM agents WHERE id = ?');
    return await stmt.get(id) as Agent | undefined;
}

export async function getAgentByName(name: string): Promise<Agent | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM agents WHERE name = ?');
    return await stmt.get(name) as Agent | undefined;
}

export async function getAllAgents(): Promise<Agent[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM agents');
    return await stmt.all() as Agent[];
}

export async function updateAgent(id: string, updates: Partial<Omit<Agent, 'id'>>): Promise<void> {
    const db = await getDb();
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => (updates as any)[field]);

    const stmt = db.prepare(`UPDATE agents SET ${setClause} WHERE id = ?`);
    await stmt.run(...values, id);
}

export async function deleteAgent(id: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
    await stmt.run(id);
}

// Agent Response functions
export async function createAgentResponse(agentResponse: AgentResponse): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare(`
        INSERT INTO agent_responses (id, agent_id, media_unit_id, content, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    await stmt.run(
        agentResponse.id,
        agentResponse.agent_id,
        agentResponse.media_unit_id,
        agentResponse.content,
        agentResponse.created_at
    );
}

export async function getAgentResponsesByMediaUnit(media_unit_id: string): Promise<AgentResponse[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM agent_responses WHERE media_unit_id = ? ORDER BY created_at DESC');
    return await stmt.all(media_unit_id) as AgentResponse[];
}

export async function getAgentResponsesByAgent(agent_id: string): Promise<AgentResponse[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM agent_responses WHERE agent_id = ? ORDER BY created_at DESC');
    return await stmt.all(agent_id) as AgentResponse[];
}

export async function getAgentResponseById(id: string): Promise<AgentResponse | undefined> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM agent_responses WHERE id = ?');
    return await stmt.get(id) as AgentResponse | undefined;
}

export async function getAllAgentResponses(): Promise<AgentResponse[]> {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM agent_responses ORDER BY created_at DESC');
    return await stmt.all() as AgentResponse[];
}

export async function deleteAgentResponse(id: string): Promise<void> {
    const db = await getDb();
    const stmt = db.prepare('DELETE FROM agent_responses WHERE id = ?');
    await stmt.run(id);
}