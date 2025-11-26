import type { ServerWebSocket } from "bun";
import { decode } from "cbor-x";
import { randomUUID } from "crypto";
import type { InMemWorkerRequest, WorkerToServerMessage } from "~/shared";
import type { WebhookMessage } from "~/shared/alert";
import { updateMoment } from "./database/utils";
import type { WsClient } from "./WsClient";

import type { ServerEphemeralState } from "~/shared";
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
    send_to_engine: (msg: InMemWorkerRequest) => void,
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
            const req: InMemWorkerRequest = {
                jobs: [],
                type: 'worker_request',
                // Shared image resource for all jobs
                resources: [{
                    id: media_unit_id,
                    type: 'image',
                    data: decoded.data
                }],
            }

            const in_moment = opts.state().active_moments.has(decoded.id);
            maybeInitState(decoded.id)
            const now = Date.now();
            const builders = create_builders(opts)
            for (const [builder_id, builder] of Object.entries(builders)) {
                const last_time_run = state.streams[decoded.id]![builder_id] ?? 0;
                if (!builder.should_run({ in_moment, last_time_run })) continue;
                if (now - last_time_run < builder.interval) continue;
                state.streams[decoded.id]![builder_id] = now;

                // if (builder_id == 'indexing') {
                //     logger.info({ media_id: decoded.id }, 'Indexing ...')
                // }
                await builder.write?.(decoded.id, media_unit_id, decoded.data)
                for (const worker_type of builder.worker_types) {

                    const job = await builder.build({ worker_type, media_id: decoded.id, media_unit_id });
                    req.jobs.push(job);

                    // const cont = builder.mk_cont({ worker_type, media_id: decoded.id, media_unit_id })
                    // req.jobs.push({
                    //     worker_type: worker_type as any,
                    //     resources: [{
                    //         id: media_unit_id,
                    //     }],
                    //     cont,
                    //     // Use media_id as cross_job_id to compare motion_energy between frames of this media
                    //     ...(worker_type == 'motion_energy' ? { cross_job_id: decoded.id } : {})
                    // });
                }
            }

            if (req.jobs.length > 0) {
                opts.send_to_engine(req)
            }

            // Buffer frames for moment enrichment
            if (in_moment) {
                updateMomentFrames(opts.state(), decoded.id, media_unit_id, decoded.data, now);
            }
        }
    }
}