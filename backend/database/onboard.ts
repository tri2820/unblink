import { Database } from '@tursodatabase/database';
import { batch_exec } from './utils';

export async function onboardMedia(db: Database) {
    await batch_exec({
        db,
        table: 'media',
        entries: [
            {
                name: "Building Top",
                uri: "rtsp://www.cactus.tv:1554/cam58",
                labels: ["Urban"]
            },
            {
                name: "Panama Port",
                uri: "http://200.46.196.243/axis-cgi/media.cgi?camera=1&videoframeskipmode=empty&videozprofile=classic&resolution=1280x720&audiodeviceid=0&audioinputid=0&audiocodec=aac&audiosamplerate=16000&audiobitrate=32000&timestamp=0&videocodec=h264&container=mp4",
                labels: ["Transportation Hub"]
            },
            {
                name: "Parking Lot",
                uri: "http://83.48.75.113:8320/axis-cgi/mjpg/video.cgi",
                labels: ["Urban"]
            },
        ],
        statement: `
            INSERT INTO media (id, name, uri, labels, updated_at, saveToDisk, saveDir) 
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
