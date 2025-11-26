import path from "path";
import type { FrameStatsMessage, InMemJob, InMemWorkerRequest, ObjectDetectionMessage, ServerEphemeralState, ServerToClientMessage } from "~/shared";
import { FRAMES_DIR } from "./appdir";
import { createMediaUnit, getMediaUnitById, updateMediaUnit } from "./database/utils";
import type { ForwardingOpts } from "./forward";
import { logger } from "./logger";
import type { WebhookMessage } from "~/shared/alert";
import { calculateFrameStats, type MomentData } from "./utils/frame_stats";
import { set_moment_state } from "./worker_connect/worker_stream_connector";
import { handleMoment } from "./utils/handle_moment";
import type { WorkerInput__Embedding, WorkerInput__MotionEnergy, WorkerInput__Vlm, WorkerOutput__Embedding, WorkerOutput__MotionEnergy, WorkerOutput__Vlm, WorkerType } from "~/shared/engine";
import { impossible } from "./utils/assert";

export type Builder = {
    worker_types: WorkerType[],
    interval: number,
    should_run: (props: { in_moment: boolean, last_time_run: number }) => boolean,
    write?: (media_id: string, media_unit_id: string, data: Uint8Array) => Promise<void>,
    build: (props: {
        worker_type: WorkerType,
        media_id: string,
        media_unit_id: string,
    }) => Promise<InMemJob>,

};

export const create_builders: (
    opts: ForwardingOpts,
) => { [builder_id: string]: Builder } = (opts) => {
    return {
        'indexing': {
            worker_types: ['vlm', 'embedding'],
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
            },
  
            async build({ worker_type, media_id, media_unit_id }) {
                if (worker_type == 'vlm') {
                    return {
                        worker_type,
                        input: {
                            messages: [
                                { role: 'user', content: [{ type: 'text', text: 'Provide a concise description of the content of this image in a few words.' }] },
                                { role: 'assistant', content: [{ type: 'image', image: { __type: 'resource-ref', id: media_unit_id } }] },
                            ]
                        } as WorkerInput__Vlm,
                        async cont(output: WorkerOutput__Vlm) {
                                let description = output.response;

                            // Try to remove common prefixes
                            // E.g., "This image depicts ...", "This image captures ...", "In this image, ", "The image shows ...", "The image captures ..."
                            const prefixes = [
                                "This is an image of a ",
                                "The image is ",
                                "The image depicts ",
                                "The image captures ",
                                "This image depicts ",
                                "This image captures ",
                                "In this image, ",
                                "The image shows ",
                                "The image captures ",
                                "This photo depicts ",
                                "This photo captures ",
                                "In this photo, ",
                                "The photo shows ",
                                "The photo captures ",
                            ];
                            for (const prefix of prefixes) {
                                if (description.startsWith(prefix)) {
                                    description = description.slice(prefix.length);
                                    // Properly capitalize first letter
                                    description = description.charAt(0).toUpperCase() + description.slice(1);
                                    break;
                                }
                            }

                            const mu = await getMediaUnitById(media_unit_id);
                            if (!mu) {
                                logger.error(`MediaUnit not found for media_unit_id ${media_unit_id}`);
                                return;
                            }

                            const msg: ServerToClientMessage = {
                                type: 'agent_card',
                                media_unit: {
                                    ...mu,
                                    description,
                                }
                            }

                            // Forward to clients 
                            for (const [id, client] of opts.clients.entries()) {
                                client.send(msg);
                            }

                            // Also forward to webhook
                            opts.forward_to_webhook({
                                event: 'description',
                                created_at: new Date().toISOString(),
                                media_unit_id: mu.id,
                                media_id: mu.media_id,
                                description,
                            });

                            // Update media unit in database
                            updateMediaUnit(media_unit_id, {
                                description,
                            })
                        },
                    };
                }
                
                if (worker_type == 'embedding') {
                    return {
                        worker_type,
                        input: {
                            filepath: {
                                __type: 'resource-ref',
                                id: media_unit_id,
                            } 
                        } as WorkerInput__Embedding,
                        async cont(output: WorkerOutput__Embedding) {
                             // Convert number[] to Uint8Array for database storage
                            const embeddingBuffer = output.embedding ? new Uint8Array(new Float32Array(output.embedding).buffer) : null;

                            // Store in database
                            updateMediaUnit(media_unit_id, {
                                embedding: embeddingBuffer,
                            })
                        },
                    };
                }

                impossible(worker_type as never);
            }
        },
//         'object_detection': {
//             worker_types: ['object_detection'],
//             interval: 1000,
//             should_run({ in_moment }) {
//                 return true
//             },
         
//             build({ worker_type, media_id, media_unit_id }) {
//                 return {
//                     worker_type,
//                     input: {
//                         image: {
//                             __type: 'resource-ref',
//                             id: media_unit_id,
//                         }
//                     },
//                     async cont(output: any) {
// const msg: ObjectDetectionMessage = {
//                         type: 'object_detection',
//                         media_id,
//                         media_unit_id,
//                         detections: output.detections,
//                     }
//                     opts.forward_to_webhook({
//                         ...msg,
//                         created_at: new Date().toISOString(),
//                     });

//                     // Forward to clients
//                     for (const [, client] of opts.clients.entries()) {
//                         client.send(msg);
//                     }
//                     }
//                 };
//             }
//         },
        'motion_energy': {
            worker_types: ['motion_energy'],
            interval: 1000,
            should_run() {
                return true
            },
            async build({ worker_type, media_id, media_unit_id }) {
                return {
                    worker_type,
                    input: {
                        current_frame: {
                            __type: 'resource-ref',
                            id: media_unit_id,
                        },
                        media_id,
                    } as WorkerInput__MotionEnergy,
                    async cont(output: WorkerOutput__MotionEnergy) {
                         const state = opts.state();

                    // Moment detection handler
                    const onMoment = (moment: MomentData) => {
                        // Get the moment ID from state (it was set when maybe moment started)
                        const momentId = state.current_moment_ids.get(media_id) || null;
                        handleMoment(moment, state, momentId, opts.send_to_engine);
                    };

                    if (output.motion_energy === undefined) {
                        logger.warn(`No motion_energy in output for media_id ${media_id}, media_unit_id ${media_unit_id}`);
                        return;
                    }

                    // Calculate frame stats with moment detection
                    const frameStats = calculateFrameStats(
                        state.stream_stats_map,
                        media_id,
                        media_unit_id,
                        output.motion_energy,
                        Date.now(),
                        onMoment,
                        // onMaybeMomentStart
                        () => {
                            // Generate moment ID upfront and store in state
                            const newMomentId = crypto.randomUUID();
                            state.current_moment_ids.set(media_id, newMomentId);

                            logger.info(`Maybe moment started for ${media_id}, moment_id: ${newMomentId}`);
                            state.active_moments.add(media_id);

                            // Forward to worker to start recording moment clip with the moment ID
                            set_moment_state(opts.worker_stream(), {
                                media_id,
                                should_write_moment: true,
                                current_moment_id: newMomentId,
                            });
                        },
                        // onMaybeMomentEnd
                        (isMoment) => {
                            logger.info(`Maybe moment ended for ${media_id}. Was moment: ${isMoment}`);
                            state.active_moments.delete(media_id);

                            // Forward to worker to stop recording moment clip
                            // If it wasn't actually a moment, tell worker to delete the file
                            set_moment_state(opts.worker_stream(), {
                                media_id,
                                should_write_moment: false,
                                discard_previous_maybe_moment: !isMoment, // Delete if it was NOT a real moment
                            });

                            // Clear the moment ID from state after use
                            state.current_moment_ids.delete(media_id);
                        }
                    );

                    // Create frame_stats message
                    const statsMessage: FrameStatsMessage = {
                        type: 'frame_stats' as const,
                        media_id,
                        frame_id: media_unit_id,
                        motion_energy: frameStats.motion_energy,
                        sma10: frameStats.sma10,
                        sma100: frameStats.sma100,
                        timestamp: Date.now(),
                    };

                    // Forward to clients
                    for (const [, client] of opts.clients.entries()) {
                        client.send(statsMessage);
                    }

                    // Only 1000 max
                    state.frame_stats_messages.push(statsMessage);
                    state.frame_stats_messages = state.frame_stats_messages.slice(-1000);

                    }
                }
            }
        }
    }
}

export function updateMomentFrames(
    state: ServerEphemeralState,
    media_id: string,
    media_unit_id: string,
    data: Uint8Array,
    now: number
) {
    const momentFrames = state.moment_frames.get(media_id) || [];

    // If we have less than 3 frames, just append
    if (momentFrames.length < 3) {
        // Limit to 1fps
        const lastFrame = momentFrames[momentFrames.length - 1];
        if (!lastFrame || now - lastFrame.at_time > 1000) {
            momentFrames.push({
                id: media_unit_id,
                at_time: now,
                data: data
            });
            state.moment_frames.set(media_id, momentFrames);
        }
    } else {
        // We have 3 frames [First, Middle, Last]
        // We want to update this to be the best representation of [Start, End]
        // New frame is the new End.
        // We need to decide if the old Last is a better Middle than the old Middle.

        const first = momentFrames[0];
        const middle = momentFrames[1];
        const last = momentFrames[2];

        // Only update if enough time has passed (1fps)
        // Check if frames are defined to satisfy TS
        if (first && middle && last && now - last.at_time > 1000) {
            const newFrame = {
                id: media_unit_id,
                at_time: now,
                data: data
            };

            const midpoint = first.at_time + (newFrame.at_time - first.at_time) / 2;

            const distMiddle = Math.abs(middle.at_time - midpoint);
            const distLast = Math.abs(last.at_time - midpoint);

            // If the old last frame is closer to the new midpoint, it becomes the new middle
            if (distLast < distMiddle) {
                momentFrames[1] = last;
            }

            // The new frame always becomes the last
            momentFrames[2] = newFrame;

            state.moment_frames.set(media_id, momentFrames);
        }
    }
}
