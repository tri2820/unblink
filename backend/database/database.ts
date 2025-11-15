import { connect, Database } from '@tursodatabase/database';
import { initDatabase } from './init';
import { DATABASE_FILE_PATH } from '../appdir';
import { logger } from '../logger';


// Database connection utility
let dbInstance: Database | null = null;
export async function getDb(): Promise<Database> {
    if (!dbInstance) {
        logger.info(`Connecting to Turso database at ${DATABASE_FILE_PATH}...`);
        dbInstance = await connect(DATABASE_FILE_PATH);
        await initDatabase(dbInstance);
        logger.info("Database connected.");
    }
    return dbInstance;
}

// Utility to close database connection if needed
export async function closeDb(): Promise<void> {
    if (dbInstance) {
        // Assuming there's a way to truly close the connection if better-sqlite3 provides it
        // For now, just nullify the instance
        dbInstance = null;
        logger.info("Database connection closed.");
    }
}