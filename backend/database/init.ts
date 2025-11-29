import { Database } from '@tursodatabase/database';
import { logger } from '~/backend/logger';
import { onboardMedia, onboardSettings } from './onboard';

/**
 * Initializes the Turso database and creates the table schema if it doesn't exist.
 */
export async function initDatabase(client: Database) {
    // Check for existing tables by querying the schema table
    const getTablesStmt = client.prepare("SELECT name FROM sqlite_schema WHERE type='table';");
    const existingTableRows = await getTablesStmt.all() as { name: string }[];
    const existingTablesArr = existingTableRows.map(row => row.name)
    const existingTables = new Set(existingTablesArr);

    // Create 'media_units' table
    if (!existingTables.has('media_units')) {
        await client.exec(`
            CREATE TABLE media_units (
                id TEXT PRIMARY KEY,
                media_id TEXT NOT NULL,
                at_time INTEGER NOT NULL,
                description TEXT,
                embedding BLOB,
                path TEXT NOT NULL,
                type TEXT NOT NULL
            );
        `);
        logger.info("Table 'media_units' created.");
    }

    // Create 'media' table
    if (!existingTables.has('media')) {
        // Use exec for DDL operations to ensure immediate schema changes
        await client.exec(`
            CREATE TABLE media (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                uri TEXT NOT NULL,
                labels TEXT,
                updated_at INTEGER NOT NULL,
                save_to_disk INTEGER,
                save_location TEXT
            );
        `);
        logger.info("Table 'media' created.");

        // Run onboarding only when table is newly created to avoid schema timing issues
        // Moved to end
    }

    // Create 'settings' table
    if (!existingTables.has('settings')) {
        await client.exec(`
            CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);
        logger.info("Table 'settings' created.");

        // Run onboarding only when table is newly created to avoid schema timing issues
        // Moved to end
    }

    // Create 'secrets' table
    if (!existingTables.has('secrets')) {
        await client.exec(`
            CREATE TABLE secrets (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);
        logger.info("Table 'secrets' created.");
    }

    // Create 'sessions' table
    if (!existingTables.has('sessions')) {
        await client.exec(`
            CREATE TABLE sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
        `);
        logger.info("Table 'sessions' created.");
    }

    // Create 'users' table
    if (!existingTables.has('users')) {
        await client.exec(`
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL
            );
        `);
        logger.info("Table 'users' created.");
    }

    // Create 'moments' table
    if (!existingTables.has('moments')) {
        await client.exec(`
            CREATE TABLE moments (
                id TEXT PRIMARY KEY,
                media_id TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER NOT NULL,
                peak_deviation REAL,
                type TEXT,
                title TEXT,
                description TEXT,
                clip_path TEXT,
                thumbnail_path TEXT
            );
        `);
        logger.info("Table 'moments' created.");
    }

    // Create 'agents' table
    if (!existingTables.has('agents')) {
        await client.exec(`
            CREATE TABLE agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                instruction TEXT NOT NULL
            );
        `);
        logger.info("Table 'agents' created.");
    }

    // Create 'agent_responses' table
    if (!existingTables.has('agent_responses')) {
        await client.exec(`
            CREATE TABLE agent_responses (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                media_unit_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (agent_id) REFERENCES agents(id),
                FOREIGN KEY (media_unit_id) REFERENCES media_units(id)
            );
        `);
        logger.info("Table 'agent_responses' created.");
    }

    // Run onboarding after all tables are created
    // Check if media table is empty
    const mediaCount = await client.prepare('SELECT COUNT(*) as count FROM media').get() as { count: number };
    if (mediaCount.count === 0) {
        await onboardMedia(client);
    }
    // Check if settings table is empty
    const settingsCount = await client.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number };
    if (settingsCount.count === 0) {
        await onboardSettings(client);
    }
}

