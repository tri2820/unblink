import type { ServerWebSocket } from "bun";
import { decode } from "cbor-x";
import { randomUUID } from "crypto";
import path from "path";
import type { WorkerToServerMessage } from "~/shared";
import type { WebhookMessage } from "~/shared/alert";
import type { Conn } from "~/shared/Conn";
import type { EngineToServer, ServerToEngine } from "~/shared/engine";
import { FRAMES_DIR } from "./appdir";
import { createMediaUnit } from "./database/utils";
import type { WsClient } from "./WsClient";

import type { ServerEphemeralState } from "~/shared";
import { logger } from "./logger";

type ForwardingState = {
    streams: {
        [media_id: string]: {
            [key: string]: number | undefined
        }
    }
};

type ForwardingOpts = {
    clients: Map<ServerWebSocket, WsClient>,
    settings: () => Record<string, string>,
    engine_conn: () => Conn<ServerToEngine, EngineToServer>,
    forward_to_webhook: (msg: WebhookMessage) => Promise<void>,
    state: () => ServerEphemeralState,
};

export const createForwardFunction = (opts: ForwardingOpts) => {
    const state: ForwardingState = {
        streams: {},
    };

    const maybeInitState = (media_id: string) => {
        // Initialize stream state if needed
        if (!state.streams[media_id]) {
            state.streams[media_id] = {}
        }
    }

    return async (msg: MessageEvent) => {
        // Broadcast to all clients
        const encoded = msg.data;
        const decoded = decode(encoded) as WorkerToServerMessage;

        if (decoded.type === 'codec' || decoded.type === 'frame') {
            // Forward to clients
            for (const [, client] of opts.clients) {
                client.send(decoded);
            }
        }


        const builders: {
            [builder_id: string]: {
                keys: string[],
                interval: number,
                should_run: (props: { in_moment: boolean, last_time_run: number }) => boolean,
                write?: (media_id: string, media_unit_id: string, data: Uint8Array) => Promise<void>
            }
        } = {
            'indexing': {
                keys: ['vlm', 'embedding'],
                interval: 3000,
                should_run({ in_moment, last_time_run }) {
                    if (in_moment) return true;
                    const now = Date.now();

                    // Ocassionally run every minute
                    return now - last_time_run > 60000
                },
                async write(media_id: string, media_unit_id: string, data: Uint8Array) {
                    // Write data to file
                    const _path = path.join(FRAMES_DIR, `${media_unit_id}.jpg`);
                    await Bun.write(_path, data);

                    // Store in database
                    const mu = {
                        id: media_unit_id,
                        type: 'frame',
                        at_time: Date.now(), // Using timestamp instead of Date object
                        description: null,
                        embedding: null,
                        media_id,
                        path: _path,
                    };

                    await createMediaUnit(mu)
                }
            },
            'object_detection': {
                keys: ['object_detection'],
                interval: 1000,
                should_run({ in_moment }) {
                    return true
                },
            },
            'motion_energy': {
                keys: ['motion_energy'],
                interval: 1000,
                should_run() {
                    return true
                },
            }
        }


        if (decoded.type === 'frame') {
            const media_unit_id = randomUUID();
            const msg: ServerToEngine = {
                frame: decoded.data,
                frame_id: media_unit_id,
                media_id: decoded.media_id,
                type: 'frame_binary',
                workers: {}
            }

            const in_moment = opts.state().active_moments.has(decoded.media_id);
            maybeInitState(decoded.media_id)
            const now = Date.now();
            for (const [builder_id, builder] of Object.entries(builders)) {
                const last_time_run = state.streams[decoded.media_id]![builder_id] ?? 0;
                if (!builder.should_run({ in_moment, last_time_run })) continue;
                if (now - last_time_run < builder.interval) continue;
                state.streams[decoded.media_id]![builder_id] = now;

                if (builder_id == 'indexing') {
                    console.log('indexing ...', decoded.media_id)
                }
                await builder.write?.(decoded.media_id, media_unit_id, decoded.data)
                for (const key of builder.keys) {
                    msg.workers[key] = true;
                }
            }

            if (Object.values(msg.workers).length > 0) {
                opts.engine_conn().send(msg);
            }
        }
    }
}