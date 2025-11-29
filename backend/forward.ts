import type { ServerWebSocket } from "bun";
import { decode } from "cbor-x";
import { randomUUID } from "crypto";
import type { WorkerToServerMessage } from "~/shared";
import type { WebhookMessage } from "~/shared/alert";
import { updateMoment } from "./database/utils";
import type { WsClient } from "./WsClient";

import type { ServerEphemeralState } from "../index";
import { createRequestBuilder } from "..";
import { create_builders, updateMomentFrames } from "./forward_utils";
import { logger } from "./logger";

type ForwardingState = {
    streams: {
        [media_id: string]: {
            [key: string]: number | undefined
        }
    }
};

export type ForwardingOpts = {
    worker_stream: () => Worker,
    clients: Map<ServerWebSocket, WsClient>,
    settings: () => Record<string, string>,
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
        }

        if (decoded.type === 'codec' || decoded.type === 'frame' || decoded.type === 'ended') {
            // Forward to clients

            for (const [, client] of opts.clients) {
                // Either subscribed ephemeral streams, or live streams (session_id is undefined)
                if (decoded.is_ephemeral) {
                    const stream_sub = client.subscription?.streams.find(s => s.type === 'ephemeral' && s.session_id === decoded.session_id);
                    if (!stream_sub) continue;
                }

                client.send(decoded);
            }
        }

        // logger.info({ decoded_is_ephemeral: decoded.is_ephemeral }, 'Forwarding message');
        if (decoded.type === 'frame' && !decoded.is_ephemeral) {
            const media_unit_id = randomUUID();
            const in_moment = opts.state().active_moments.has(decoded.id);
            maybeInitState(decoded.id)
            const now = Date.now();

            const reqBuilder = createRequestBuilder()
            reqBuilder.add_resource({
                id: media_unit_id,
                type: 'image',
                data: decoded.data
            })

            const builders = create_builders(opts)
            for (const [builder_id, builder] of Object.entries(builders)) {
                const last_time_run = state.streams[decoded.id]![builder_id] ?? 0;
                const time_since_last_run = now - last_time_run;
                
                if (!builder.should_run({ in_moment, last_time_run })) {
                    // logger.debug({ builder_id, in_moment, last_time_run }, 'Builder should_run returned false');
                    continue;
                }
                if (time_since_last_run < builder.interval) {
                    // logger.debug({ 
                    //     builder_id, 
                    //     time_since_last_run, 
                    //     interval: builder.interval,
                    //     time_remaining: builder.interval - time_since_last_run
                    // }, 'Builder skipped due to interval throttling');
                    continue;
                }
                
                logger.debug({ builder_id, time_since_last_run }, 'Running builder');
                state.streams[decoded.id]![builder_id] = now;
                await builder.write?.(decoded.id, media_unit_id, decoded.data)
                for (const worker_type of builder.worker_types) {
                    await builder.build({ reqBuilder,  worker_type, media_id: decoded.id, media_unit_id });
                }
            }

            // if (reqBuilder.req.jobs.length > 0) {
            //     console.log("Sending request to workers", reqBuilder);
            // }
            reqBuilder.send()

            // Buffer frames for moment enrichment
            if (in_moment) {
                updateMomentFrames(opts.state(), decoded.id, media_unit_id, decoded.data, now);
            }
        }
    }
}