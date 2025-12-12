import { Database } from '@tursodatabase/database';
import { executeREST } from './rest';

export async function onboardMedia(db: Database) {
    const entries = [
        {
            name: "Car Factory",
            uri: "https://bucket.zapdoslabs.com/car_factory.mp4",
            labels: ["Automotive"]
        },
        {
            name: "Mask Machine",
            uri: "https://bucket.zapdoslabs.com/mask_machine.mp4",
            labels: ["Medical"]
        },
        {
            name: "Mask Production Line",
            uri: "https://bucket.zapdoslabs.com/mask_production_line.mp4",
            labels: ["Medical"]
        },
        {
            name: "Steel Work Production",
            uri: "https://bucket.zapdoslabs.com/steel_work_producion.mp4",
            labels: ["Metal"]
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
