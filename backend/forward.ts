import type { ServerWebSocket } from "bun";
import { decode } from "cbor-x";
import { randomUUID } from "crypto";
import type { WorkerToServerMessage } from "~/shared";
import type { WebhookMessage } from "~/shared/alert";
import type { Conn } from "~/shared/Conn";
import type { EngineToServer, ServerToEngine } from "~/shared/engine";
import { updateMoment } from "./database/utils";
import type { WsClient } from "./WsClient";

import type { ServerEphemeralState } from "~/shared";
import { builders, updateMomentFrames } from "./forward_utils";
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

        // Handle moment clip saved message
        if (decoded.type === 'moment_clip_saved') {
            logger.info({ moment_id: decoded.moment_id, clip_path: decoded.clip_path }, 'Moment clip saved, updating database');
            try {
                await updateMoment(decoded.moment_id, {
                    clip_path: decoded.clip_path,
                });
            } catch (error) {
                logger.error({ error, moment_id: decoded.moment_id }, 'Failed to update moment with clip path');
            }
            return; // Don't forward this message to clients
        }

        if (decoded.type === 'codec' || decoded.type === 'frame') {
            // Forward to clients
            for (const [, client] of opts.clients) {
                client.send(decoded);
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
                    logger.info({ media_id: decoded.media_id }, 'Indexing ...')
                }
                await builder.write?.(decoded.media_id, media_unit_id, decoded.data)
                for (const key of builder.keys) {
                    msg.workers[key] = true;
                }
            }

            if (Object.values(msg.workers).length > 0) {
                opts.engine_conn().send(msg);
            }

            // Buffer frames for moment enrichment
            if (in_moment) {
                updateMomentFrames(opts.state(), decoded.media_id, media_unit_id, decoded.data, now);
            }
        }
    }
}