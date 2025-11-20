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

export const createForwardFunction = (opts: {
    clients: Map<ServerWebSocket, WsClient>,
    // worker_object_detection: () => Worker,
    settings: () => Record<string, string>,
    engine_conn: () => Conn<ServerToEngine, EngineToServer>,
    forward_to_webhook: (msg: WebhookMessage) => Promise<void>,
}) => {
    const state: {
        streams: {
            [media_id: string]: {
                last_engine_sent__index: number,
                last_engine_sent__object_detection: number,
            }
        }
    } = {
        streams: {},
    };

    return async (msg: MessageEvent) => {
        // Broadcast to all clients
        const encoded = msg.data;
        const decoded = decode(encoded) as WorkerToServerMessage;

        if (decoded.type === 'codec' || decoded.type === 'frame'
            //  || decoded.type === 'object_detection'
        ) {
            // Forward to clients
            for (const [, client] of opts.clients) {
                client.send(decoded);
            }
        }

        // // Only for live streams (no file_name)
        // if (decoded.type === 'object_detection' && decoded.file_name === undefined) {
        //     // Also forward to webhook
        //     opts.forward_to_webhook({
        //         type: 'object_detection',
        //         data: {
        //             created_at: new Date().toISOString(),
        //             media_id: decoded.media_id,
        //             frame_id: decoded.frame_id,
        //             objects: decoded.objects,
        //         }
        //     });
        // }

        // Occasionally, does indexing / object detection on the frame
        if (decoded.type === 'frame') {
            const now = Date.now();
            if (!state.streams[decoded.media_id]) {
                state.streams[decoded.media_id] = {
                    last_engine_sent__index: 0,
                    last_engine_sent__object_detection: 0,
                }
            }

            const frame_id = randomUUID();

            (async () => {
                // Forward to object detection worker if enabled
                const object_detection_enabled = opts.settings()['object_detection_enabled'] === 'true';
                if (!object_detection_enabled) return;
                // Throttle engine forwarding to 1 fps
                if (now - state.streams[decoded.media_id]!.last_engine_sent__object_detection < 1000) return;
                state.streams[decoded.media_id]!.last_engine_sent__object_detection = now;

                // logger.info({ path: decoded.path }, `Forwarding frame ${decoded.frame_id} from stream ${decoded.media_id} to object detection worker.`);

                const msg: ServerToEngine = {
                    type: "frame_binary",
                    workers: {
                        'object_detection': true,
                    },
                    media_id: decoded.media_id,
                    frame_id,
                    frame: decoded.data
                }
                opts.engine_conn().send(msg);
            })();


            (async () => {
                // Throttle engine forwarding to 1 frame every 10 seconds
                if (now - state.streams[decoded.media_id]!.last_engine_sent__index < 10000) return;
                state.streams[decoded.media_id]!.last_engine_sent__index = now;

                // Write data to file
                const _path = path.join(FRAMES_DIR, `${frame_id}.jpg`);
                await Bun.write(_path, decoded.data);

                // Store in database
                const mu = {
                    id: frame_id,
                    type: 'frame',
                    at_time: Date.now(), // Using timestamp instead of Date object
                    description: null,
                    embedding: null,
                    media_id: decoded.media_id,
                    path: _path,
                };

                await createMediaUnit(mu)

                // Forward to AI engine for 
                // 1. Compute embedding  
                // 2. VLM inference
                const engine_conn = opts.engine_conn();

                // Read the frame binary from the file
                const msg: ServerToEngine = {
                    type: "frame_binary",
                    workers: {
                        'vlm': true,
                        'embedding': true,
                    },
                    media_id: decoded.media_id,
                    frame_id,
                    frame: decoded.data,
                }
                engine_conn.send(msg);
            })();
        }
    }

}