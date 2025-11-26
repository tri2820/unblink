import { Database } from '@tursodatabase/database';
import { batch_exec } from './utils';

export async function onboardMedia(db: Database) {
    await batch_exec({
        db,
        table: 'media',
        entries: [
            {
                name: "Building Top",
                uri: "/home/tri/test_videos/1.mp4",
                labels: ["Urban"]
            },
            {
                name: "Panama Port",
                uri: "/home/tri/test_videos/2.mp4",
                labels: ["Transportation Hub"]
            },
            {
                name: "Parking Lot",
                uri: "/home/tri/test_videos/3.mp4",
                labels: ["Urban"]
            },
        ],
        statement: `
            INSERT INTO media (id, name, uri, labels, updated_at, save_to_disk, save_location) 
            VALUES (?, ?, ?, ?, ?, 0, NULL);
        `,
        transform: (entry) => {
            const id = crypto.randomUUID();
            const labelsStr = JSON.stringify(entry.labels);
            const updatedAt = Date.now();
            return [id, entry.name, entry.uri, labelsStr, updatedAt];
        }

    })
}

export async function onboardSettings(db: Database) {
    await batch_exec({
        db,
        table: 'settings',
        entries: [
            { key: 'object_detection_enabled', value: 'true' },
            { key: 'auth_enabled', value: 'false' },
        ],
        statement: `
            INSERT INTO settings (key, value) 
            VALUES (?, ?);
        `,
        transform: (entry) => {
            return [entry.key, entry.value];
        }
    })
}
