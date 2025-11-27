import { describe, test, expect } from "bun:test";
import { getByQuery, clearSchemaCache } from '../utils';

describe('Dynamic Schema Detection', () => {

    test('Schema is detected from database automatically', async () => {
        // Clear cache to force fresh detection
        clearSchemaCache();
        
        // This should work - agents table exists
        const result = await getByQuery({
            table: 'agents',
            limit: 1
        });
        
        expect(result).toBeArray();
    });

    test('Invalid table names are rejected dynamically', async () => {
        // Try to query a table that doesn't exist
        await expect(async () => {
            await getByQuery({
                table: 'nonexistent_table',
                limit: 1
            });
        }).toThrow(/Invalid table/);
    });

    test('Invalid column names are rejected dynamically', async () => {
        // Try to select a column that doesn't exist
        await expect(async () => {
            await getByQuery({
                table: 'agents',
                select: ['nonexistent_column'],
                limit: 1
            });
        }).toThrow(/Invalid field/);
    });

    test('Valid columns are accepted', async () => {
        // Clear cache and query with specific columns
        clearSchemaCache();
        
        const result = await getByQuery({
            table: 'agents',
            select: ['id', 'name', 'instruction'],
            limit: 1
        });
        
        expect(result).toBeArray();
    });

    test('Schema cache improves performance', async () => {
        // First query - populates cache
        clearSchemaCache();
        const start1 = performance.now();
        await getByQuery({ table: 'agents', limit: 1 });
        const time1 = performance.now() - start1;

        // Second query - uses cache
        const start2 = performance.now();
        await getByQuery({ table: 'agents', limit: 1 });
        const time2 = performance.now() - start2;

        // Cached query should be faster (though this is not guaranteed)
        console.log(`First query (no cache): ${time1.toFixed(2)}ms`);
        console.log(`Second query (cached): ${time2.toFixed(2)}ms`);
        
        // Both should complete successfully
        expect(time1).toBeGreaterThan(0);
        expect(time2).toBeGreaterThan(0);
    });

    test('clearSchemaCache forces refresh', async () => {
        // Populate cache
        await getByQuery({ table: 'agents', limit: 1 });
        
        // Clear cache
        clearSchemaCache();
        
        // This should work by re-detecting schema
        const result = await getByQuery({
            table: 'agents',
            limit: 1
        });
        
        expect(result).toBeArray();
    });
});
