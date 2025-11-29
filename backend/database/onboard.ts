import { Database } from '@tursodatabase/database';
import { executeREST } from './rest';

export async function onboardMedia(db: Database) {
    const entries = [
        {
            name: "St. Catherine's School",
            uri: "https://bucket.zapdoslabs.com/st_catherine_school.mp4",
            labels: ["Excavation"]
        },
        {
            name: "Home Construction Site",
            uri: "https://bucket.zapdoslabs.com/home.mp4",
            labels: ["Remodeling"]
        },
        {
            name: "National Museum",
            uri: "https://bucket.zapdoslabs.com/museum.mp4",
            labels: ["Remodeling"]
        },
    ];

    const values = entries.map(entry => ({
        id: crypto.randomUUID(),
        name: entry.name,
        uri: entry.uri,
        labels: JSON.stringify(entry.labels),
        updated_at: Date.now(),
        save_to_disk: 0,
        save_location: null
    }));

    await executeREST({
        type: 'insert',
        table: 'media',
        values: values
    });
}

export async function onboardSettings(db: Database) {
    const entries = [
        { key: 'object_detection_enabled', value: 'true' },
        { key: 'auth_enabled', value: 'false' },
    ];

    await executeREST({
        type: 'insert',
        table: 'settings',
        values: entries
    });
}
