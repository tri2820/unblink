import { Database } from '@tursodatabase/database';
import { logger } from '~/backend/logger';
import { onboardMedia, onboardSettings } from './onboard';

// Type definitions
export interface Media {
    id: string;
    name: string;
    uri: string;
    labels: string[];
    updated_at: number;
    saveToDisk?: number | null;
    saveDir?: string | null;
}

export interface Setting {
    key: string;
    value: string;
}

export interface MediaUnit {
    id: string;
    media_id: string;
    at_time: number;
    description?: string | null;
    embedding?: Uint8Array | null; // Stored as BLOB
    path: string;
    type: string;
}

export interface Secret {
    key: string;
    value: string;
}

export interface Session {
    session_id: string;
    user_id: string;
    created_at: number;
    expires_at: number;
}

export interface User {
    id: string;
    username: string;
    password_hash: string;
    role: string;
}

/**
 * Initializes the Turso database and creates the table schema if it doesn't exist.
 */
export async function initDatabase(client: Database) {
    // Check for existing tables by querying the schema table
    const getTablesStmt = client.prepare("SELECT name FROM sqlite_schema WHERE type='table';");
    const existingTableRows = await getTablesStmt.all() as { name: string }[];
    const existingTables = new Set(existingTableRows.map(row => row.name));
    logger.info({ tables: existingTables }, "Existing tables:");

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
}

