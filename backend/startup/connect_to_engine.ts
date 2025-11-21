import type { ServerWebSocket } from "bun";

import type { ServerEphemeralState, ServerToClientMessage } from "~/shared";
import type { WebhookMessage } from "~/shared/alert";
import { Conn } from "~/shared/Conn";
import type { EngineToServer, ServerRegistrationMessage, ServerToEngine } from "~/shared/engine";
import { createMoment, getMediaUnitById, updateMediaUnit } from "../database/utils";
import { logger } from "../logger";
import { calculateFrameStats, type MomentData } from "../utils/frame_stats";
import type { WsClient } from "../WsClient";


export function connect_to_engine(props: {
    state: () => ServerEphemeralState,
    ENGINE_URL: string,
    forward_to_webhook: (msg: WebhookMessage) => Promise<void>,
    clients: () => Map<ServerWebSocket, WsClient>,
}) {
    const engine_conn = new Conn<ServerRegistrationMessage | ServerToEngine, EngineToServer>(`wss://${props.ENGINE_URL}/ws`, {
        onOpen() {
            const msg: ServerRegistrationMessage = {
                type: "i_am_server",
            }
            engine_conn.send(msg);
        },
        onClose() {
            logger.info("Disconnected from Zapdos Labs engine WebSocket");
        },
        onError(event) {
            logger.error(event, "WebSocket to engine error:");
        },
        async onMessage(decoded) {
            if (decoded.type === 'media_summary') {
                // Handle media summary
                logger.info({ decoded }, `Received media summary`);

                // Legacy moment creation (deprecated - now using real-time deviation detection)
                /* 
                for (const moment of decoded.summary.moments) {
                    await createMoment({
                        id: crypto.randomUUID(),
                        media_id: decoded.media_id,
                        start_time: moment.from_time,
                        end_time: moment.to_time,
                        peak_deviation: null,
                        type: null,
                        title: moment.what_new,
                        short_description: moment.what_old,
                        long_description: null,
                    })
                }
                logger.info(`Stored ${decoded.summary.moments.length} moments for media_id ${decoded.media_id}`);
                */
                return;
            }

            if (decoded.type === 'frame_description') {
                // Store in database
                // logger.info({ decoded }, `Received description`);
                updateMediaUnit(decoded.frame_id, {
                    description: decoded.description,
                })

                const mu = await getMediaUnitById(decoded.frame_id);
                if (!mu) {
                    logger.error(`MediaUnit not found for frame_id ${decoded.frame_id}`);
                    return;
                }

                const msg: ServerToClientMessage = {
                    type: 'agent_card',
                    media_unit: {
                        ...mu,
                        description: decoded.description,
                    }
                }

                // Forward to clients 
                for (const [id, client] of props.clients()) {
                    client.send(msg, false);
                }

                // Also forward to webhook
                props.forward_to_webhook({
                    event: 'description',
                    data: {
                        created_at: new Date().toISOString(),
                        media_id: decoded.media_id,
                        frame_id: decoded.frame_id,
                        description: decoded.description,
                    }
                });
            }

            if (decoded.type === 'frame_embedding') {
                // Convert number[] to Uint8Array for database storage
                const embeddingBuffer = decoded.embedding ? new Uint8Array(new Float32Array(decoded.embedding).buffer) : null;

                // Store in database
                updateMediaUnit(decoded.frame_id, {
                    embedding: embeddingBuffer,
                })
            }

            if (decoded.type === 'frame_object_detection') {
                // // Also forward to webhook
                const msg: WebhookMessage = {
                    type: 'object_detection',
                    data: {
                        created_at: new Date().toISOString(),
                        media_id: decoded.media_id,
                        frame_id: decoded.frame_id,
                        objects: decoded.objects,
                    }
                }
                props.forward_to_webhook(msg);

                // Forward to clients
                for (const [, client] of props.clients()) {
                    client.send(decoded);
                }
            }

            if (decoded.type === 'frame_motion_energy') {
                const state = props.state();

                // Moment detection handler
                const handleMoment = async (moment: MomentData) => {
                    const eventType = moment.type === 'instant' ? '⚡ Instant' : '🎯 Standard';
                    logger.info({ moment }, `${eventType} moment detected!`);

                    try {
                        await createMoment({
                            id: crypto.randomUUID(),
                            media_id: moment.media_id,
                            start_time: moment.start_timestamp,
                            end_time: moment.end_timestamp,
                            peak_deviation: moment.peak_deviation,
                            type: moment.type,
                            title: null,
                            short_description: null,
                            long_description: null,
                        });
                        logger.info(`Saved moment to database for media ${moment.media_id}`);
                    } catch (error) {
                        logger.error({ error, moment }, "Failed to save moment to database");
                    }
                };

                // Calculate frame stats with moment detection
                const frameStats = calculateFrameStats(
                    state.stream_stats_map,
                    decoded.media_id,
                    decoded.frame_id,
                    decoded.motion_energy,
                    Date.now(),
                    handleMoment,
                    // onMaybeMomentStart
                    () => {
                        logger.info(`Maybe moment started for ${decoded.media_id}`);
                        state.active_moments.add(decoded.media_id);
                    },
                    // onMaybeMomentEnd
                    () => {
                        logger.info(`Maybe moment ended for ${decoded.media_id}`);
                        state.active_moments.delete(decoded.media_id);
                    }
                );

                // Create frame_stats message
                const statsMessage = {
                    type: 'frame_stats' as const,
                    media_id: decoded.media_id,
                    frame_id: decoded.frame_id,
                    motion_energy: frameStats.motion_energy,
                    sma10: frameStats.sma10,
                    sma100: frameStats.sma100,
                    timestamp: Date.now(),
                };

                // Forward to clients
                for (const [, client] of props.clients()) {
                    client.send(statsMessage);
                }

                // Only 1000 max
                state.frame_stats_messages.push(statsMessage);
                state.frame_stats_messages = state.frame_stats_messages.slice(-1000);
            }
        }
    });

    return engine_conn;
}