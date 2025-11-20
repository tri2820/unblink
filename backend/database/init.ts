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
    logger.info({ tables: existingTablesArr }, "Existing tables:");
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
                saveToDisk INTEGER,
                saveDir TEXT
            );
        `);
        logger.info("Table 'media' created.");

        // Run onboarding only when table is newly created to avoid schema timing issues
        await onboardMedia(client);
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
        await onboardSettings(client);
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
                short_description TEXT,
                long_description TEXT
            );
        `);
        logger.info("Table 'moments' created.");
    } else {
        // Migration: Check and add new columns if they don't exist
        const columnsResult = await client.prepare("PRAGMA table_info(moments)").all();
        const columnNames = new Set((columnsResult as any[]).map((row: any) => row.name));

        // Ensure media_id exists
        if (!columnNames.has('media_id')) {
            await client.exec("ALTER TABLE moments ADD COLUMN media_id TEXT");
            logger.info("Column 'media_id' added to 'moments' table.");
        }

        // Rename media_id to media_id if needed
        if (columnNames.has('media_id')) {
            // Copy data from media_id to media_id, then drop media_id
            await client.exec("UPDATE moments SET media_id = media_id WHERE media_id IS NULL");
            await client.exec("ALTER TABLE moments DROP COLUMN media_id");
            logger.info("Migrated 'media_id' to 'media_id' and dropped 'media_id' from 'moments' table.");
        }

        // Add new columns if missing
        if (!columnNames.has('start_time') && columnNames.has('from_time')) {
            await client.exec("ALTER TABLE moments RENAME COLUMN from_time TO start_time");
            logger.info("Column 'from_time' renamed to 'start_time' in 'moments' table.");
        }

        if (!columnNames.has('end_time') && columnNames.has('to_time')) {
            await client.exec("ALTER TABLE moments RENAME COLUMN to_time TO end_time");
            logger.info("Column 'to_time' renamed to 'end_time' in 'moments' table.");
        }

        if (!columnNames.has('peak_deviation')) {
            await client.exec("ALTER TABLE moments ADD COLUMN peak_deviation REAL");
            logger.info("Column 'peak_deviation' added to 'moments' table.");
        }

        if (!columnNames.has('type')) {
            await client.exec("ALTER TABLE moments ADD COLUMN type TEXT");
            logger.info("Column 'type' added to 'moments' table.");
        }

        if (!columnNames.has('title')) {
            await client.exec("ALTER TABLE moments ADD COLUMN title TEXT");
            logger.info("Column 'title' added to 'moments' table.");
        }

        if (!columnNames.has('short_description')) {
            await client.exec("ALTER TABLE moments ADD COLUMN short_description TEXT");
            logger.info("Column 'short_description' added to 'moments' table.");
        }

        if (!columnNames.has('long_description')) {
            await client.exec("ALTER TABLE moments ADD COLUMN long_description TEXT");
            logger.info("Column 'long_description' added to 'moments' table.");
        }
    }
}

