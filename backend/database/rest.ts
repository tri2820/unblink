import type { Database } from '@tursodatabase/database';
import { getDb } from './database';
import type { RESTQuery, RESTSelect, RESTInsert, RESTUpdate, RESTDelete, RESTWhereField, RESTCastOptions } from '~/shared';

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

// Apply cast to values (for insert/update)
function applyCast(values: Record<string, any>, cast?: Record<string, RESTCastOptions>) {
    if (!cast) return;
    for (const [column, castOptions] of Object.entries(cast)) {
        if (values[column] !== null && values[column] !== undefined) {
            const castType = castOptions.type;
            if (castType === 'json') {
                values[column] = JSON.stringify(values[column]);
            } else if (castType === 'embedding') {
                // Convert number[] or Uint8Array to Buffer
                const value = values[column];
                let buffer: Buffer;
                if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
                    buffer = Buffer.from(value);
                } else if (Array.isArray(value)) {
                    // number[] case
                    const arr = value as number[];
                    buffer = Buffer.alloc(arr.length * 4);
                    new Float32Array(buffer.buffer, buffer.byteOffset, arr.length).set(arr);
                } else {
                    throw new Error(`Invalid embedding type: ${typeof value}`);
                }
                values[column] = buffer;
            }
        }
    }
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

// Validate field - allows expressions with optional alias
async function validateField(field: string, allowedTables: Set<string>): Promise<void> {
    // Handle "expression as alias" format
    const asMatch = field.match(/^(.+?)\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
    if (asMatch) {
        const expression = asMatch[1]?.trim();
        const alias = asMatch[2];
        
        if (!expression || !alias) {
            throw new Error(`Invalid field format: ${field}`);
        }
        
        // For expressions, we can't easily validate the expression itself,
        // but we can validate that any identifiers in it are valid
        // For now, just check the alias is valid
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) {
            throw new Error(`Invalid alias: ${alias}`);
        }
        
        // Extract potential column references from the expression
        // This is a simple check - look for word characters that might be column names
        const potentialColumns = expression.match(/\b[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?\b/g) || [];
        for (const col of potentialColumns) {
            // Skip function names and known SQL keywords
            if (!['vector_distance_cos', 'vector32', 'vector768', 'vector', 'cosine_similarity'].includes(col) && 
                !['and', 'or', 'not', 'is', 'null', 'true', 'false'].includes(col.toLowerCase())) {
                await validateColumnReference(col, allowedTables);
            }
        }
        return;
    }
    
    // Original validation for simple identifiers
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

// Helper function to validate column references
async function validateColumnReference(col: string, allowedTables: Set<string>): Promise<void> {
    const schema = await getDatabaseSchema();
    
    if (col.includes('.')) {
        const [tableName, columnName] = col.split('.');
        if (!tableName || !columnName) {
            throw new Error(`Invalid qualified column: ${col}`);
        }
        await validateTable(tableName);
        const allowedColumns = schema[tableName];
        if (!allowedColumns || !allowedColumns.includes(columnName)) {
            throw new Error(`Invalid column ${columnName} for table ${tableName}`);
        }
    } else {
        let found = false;
        for (const table of allowedTables) {
            const columns = schema[table];
            if (columns && columns.includes(col)) {
                found = true;
                break;
            }
        }
        if (!found) {
            throw new Error(`Invalid column reference: ${col}`);
        }
    }
}

export async function executeREST(query: RESTQuery): Promise<any> {
    const db = await getDb();
    const schema = await getDatabaseSchema();

    // Default to select if type is missing
    const type = (query as any).type || 'select';

    switch (type) {
        case 'select':
            return handleSelect(query as RESTSelect, db, schema);
        case 'insert':
            return handleInsert(query as RESTInsert, db, schema);
        case 'update':
            return handleUpdate(query as RESTUpdate, db, schema);
        case 'delete':
            return handleDelete(query as RESTDelete, db, schema);
        default:
            throw new Error(`Unsupported query type: ${type}`);
    }
}

async function handleSelect(query: RESTSelect, db: Database, schema: Record<string, string[]>): Promise<any[]> {
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

        const selectFields: string[] = [];
        for (const field of query.select) {
            if (typeof field === 'string') {
                await validateField(field, allowedTables);
                selectFields.push(field);
            } else {
                // {value: string, alias: string}
                await validateField(`${field.value} as ${field.alias}`, allowedTables);
                selectFields.push(`${field.value} as ${field.alias}`);
            }
        }
        selectClause = selectFields.join(', ');
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

    const { conditions, values } = await buildWhereClause(query.where, allowedTables);

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Validate and build ORDER BY clause
    if (query.order_by) {
        // For ORDER BY, allow aliases and expressions that might not be validated strictly
        // Just check it's a reasonable identifier
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(query.order_by.field)) {
            throw new Error(`Invalid ORDER BY field: ${query.order_by.field}`);
        }

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
    let rows = await stmt.all(...values);

    // Handle cast for selected fields
    if (query.cast) {
        for (const [column, castOptions] of Object.entries(query.cast)) {
            for (const row of rows) {
                const defaultValue = castOptions.default;
                if (row[column] !== null && row[column] !== undefined) {
                    const castType = castOptions.type;
                    try {
                        if (castType === 'json') {
                            row[column] = JSON.parse(row[column]);
                        } else if (castType === 'embedding') {
                            // Assume BLOB is stored as Buffer, convert to number[]
                            const buffer = row[column] as Buffer;
                            const floatArray = new Float32Array(buffer.length / 4);
                            for (let i = 0; i < floatArray.length; i++) {
                                floatArray[i] = buffer.readFloatLE(i * 4);
                            }
                            row[column] = Array.from(floatArray);
                        }
                    } catch (error) {
                        if (defaultValue !== undefined) {
                            row[column] = defaultValue;
                        } else {
                            throw error;
                        }
                    }
                } else if (defaultValue !== undefined) {
                    row[column] = defaultValue;
                }
            }
        }
    }

    // Handle expect
    if (query.expect?.is === 'single') {
        if (rows.length === 0) {
            return query.expect.value_when_no_item;
        }
        if (rows.length > 1) {
            throw new Error('Multiple items found');
        }
        return rows[0];
    }

    return rows;
}

async function handleInsert(query: RESTInsert, db: Database, schema: Record<string, string[]>): Promise<void> {
    await validateTable(query.table);

    // Normalize values to array
    const rows = Array.isArray(query.values) ? query.values : [query.values];
    if (rows.length === 0) return;

    // Apply cast to values
    for (const row of rows) {
        applyCast(row, query.cast);
    }

    // Validate columns from the first row (assuming all rows have same structure)
    const columns = Object.keys(rows[0]);
    const tableColumns = schema[query.table];

    if (!tableColumns) {
        throw new Error(`Schema not found for table ${query.table}`);
    }

    for (const col of columns) {
        if (!tableColumns.includes(col)) {
            throw new Error(`Invalid column ${col} for table ${query.table}`);
        }
    }

    const placeholders = rows[0] ? Object.values(rows[0]).map(() => '?').join(', ') : '';
    const sql = `INSERT INTO ${query.table} (${columns.join(', ')}) VALUES (${placeholders})`;

    const stmt = db.prepare(sql);

    // Use transaction for batch insert
    try {
        // Only use transaction if multiple rows
        if (rows.length > 1) {
            await db.exec("BEGIN TRANSACTION;");
        }

        for (const row of rows) {
            const values = columns.map(col => row[col]);
            await stmt.run(...values);
        }

        if (rows.length > 1) {
            await db.exec("COMMIT;");
        }
    } catch (error) {
        if (rows.length > 1) {
            await db.exec("ROLLBACK;");
        }
        throw error;
    }
}

async function handleUpdate(query: RESTUpdate, db: Database, schema: Record<string, string[]>): Promise<void> {
    await validateTable(query.table);

    // Apply cast to values
    applyCast(query.values, query.cast);

    const columns = Object.keys(query.values);
    const updateValues = Object.values(query.values);

    // Validate columns
    const tableColumns = schema[query.table];
    if (!tableColumns) {
        throw new Error(`Schema not found for table ${query.table}`);
    }
    for (const col of columns) {
        if (!tableColumns.includes(col)) {
            throw new Error(`Invalid column ${col} for table ${query.table}`);
        }
    }

    const setClause = columns.map(col => `${col} = ?`).join(', ');

    const allowedTables = new Set([query.table]);
    const { conditions, values: whereValues } = await buildWhereClause(query.where, allowedTables);

    let sql = `UPDATE ${query.table} SET ${setClause}`;
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = db.prepare(sql);
    await stmt.run(...updateValues, ...whereValues);
}

async function handleDelete(query: RESTDelete, db: Database, schema: Record<string, string[]>): Promise<void> {
    await validateTable(query.table);

    const allowedTables = new Set([query.table]);
    const { conditions, values } = await buildWhereClause(query.where, allowedTables);

    let sql = `DELETE FROM ${query.table}`;
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = db.prepare(sql);
    await stmt.run(...values);
}

async function buildWhereClause(where: RESTWhereField[] | undefined, allowedTables: Set<string>) {
    const conditions: string[] = [];
    const values: any[] = [];

    if (where && where.length > 0) {
        if (where.length > 20) {
            throw new Error('Too many WHERE conditions (max 20)');
        }

        for (const condition of where) {
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
                case 'gt':
                    conditions.push(`${condition.field} > ?`);
                    values.push(condition.value);
                    break;
                case 'lt':
                    conditions.push(`${condition.field} < ?`);
                    values.push(condition.value);
                    break;
                case 'gte':
                    conditions.push(`${condition.field} >= ?`);
                    values.push(condition.value);
                    break;
                case 'lte':
                    conditions.push(`${condition.field} <= ?`);
                    values.push(condition.value);
                    break;
                case 'json_extract':
                    if (!condition.json_path) {
                        throw new Error('json_extract requires json_path');
                    }
                    // SQLite json_extract usage: json_extract(field, path) = value
                    // Ensure path starts with $
                    let path = condition.json_path;
                    if (!path.startsWith('$')) {
                        path = '$.' + path;
                    }
                    conditions.push(`json_extract(${condition.field}, '${path}') = ?`);
                    values.push(condition.value);
                    break;
                default:
                    throw new Error(`Unsupported operation: ${(condition as any).op}`);
            }
        }
    }
    return { conditions, values };
}
