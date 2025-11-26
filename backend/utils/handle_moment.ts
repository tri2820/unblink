import { randomUUID } from "crypto";
import path from "path";
import type { InMemJob, InMemWorkerRequest, ServerEphemeralState } from "~/shared";
import { FRAMES_DIR } from "../appdir";
import { createMoment, updateMoment } from "../database/utils";
import { logger } from "../logger";
import type { MomentData } from "./frame_stats";
import type { Resource, WorkerInput__Vlm } from "~/shared/engine";
import { parseJsonFromString } from "./dirty_json";

type FrameData = {
    id: string;
    at_time: number;
    data: Uint8Array;
};

async function summarizeMoment(
    frames: FrameData[],
    momentId: string,
    send_to_engine: (msg: InMemWorkerRequest) => void,
    retryCount: number = 0,
    maxRetries: number = 3
) {
    if (frames.length === 0) {
        logger.warn(`No frames provided for moment ${momentId}, skipping summarization`);
        return;
    }

    const image_resources: Resource[] = frames.map(f => ({
        id: f.id,
        data: f.data,
        type: 'image'
    }));

    const resources = image_resources;

    logger.info({ momentId, retryCount }, `Starting moment summarization (attempt ${retryCount + 1}/${maxRetries + 1})`);

    const msg: InMemWorkerRequest = {
        type: 'worker_request',
        resources,
        jobs: [
            {
                worker_type: 'vlm',
                // resources: resources.map(r => ({ id: r.id })),
                input: {
                messages: [
                    { 
                        role: 'system', 
                        content: [{ 
                            type: 'text', 
                            text: 'You are a helpful assistant that outputs only valid JSON. You help formatting video content.' 
                        }] 
                    },
                    { 
                        role: 'user', 
                        content: [
                            { 
                                type: 'text', 
                                text: 'These are frames of a video. What is happening? Who are doing what? Output JSON:\n{"title": "who doing what", "description": "concise description"}\nOnly output valid JSON, nothing else.' 
                            },
                            ...image_resources.map(r => ({ 
                                type: 'image' as const, 
                                image: { __type: 'resource-ref' as const, id: r.id } 
                            }))
                        ] 
                    }
                ]
            } as WorkerInput__Vlm,
                async cont(output) {
                    logger.info({ momentId, output }, 'Received summarization response');
                    const parsed = parseJsonFromString(output.response);
                    if (parsed.error) {
                        logger.error({ error: parsed.error, response: output.response, retryCount }, "Failed to parse summarization response");
                        if (retryCount < maxRetries) {
                            logger.info({ momentId, retryCount: retryCount + 1 }, "Retrying summarization");
                            await summarizeMoment(frames, momentId, send_to_engine, retryCount + 1, maxRetries);
                        } else {
                            logger.error({ momentId }, "Max retries reached for summarization");
                        }
                        return;
                    }

                    logger.info({ parsed }, 'Parsed summarization response');

                    const title = parsed.data.title;
                    const description = parsed.data.description;
                    if (typeof title === 'string' && typeof description === 'string') {
                        updateMoment(momentId, {
                            title,
                            description,
                        });
                        logger.info({ momentId }, "Successfully updated moment with summarization");
                    } else {
                        logger.error({ response: output.response, retryCount }, "Summarization response missing valid title or description");
                        if (retryCount < maxRetries) {
                            logger.info({ momentId, retryCount: retryCount + 1 }, "Retrying summarization due to invalid response");
                            await summarizeMoment(frames, momentId, send_to_engine, retryCount + 1, maxRetries);
                        } else {
                            logger.error({ momentId }, "Max retries reached for summarization due to invalid response");
                        }
                    }
                }
            }  as InMemJob
        ],
    };

    send_to_engine(msg);
    logger.info(`Sent moment summarization request for ${momentId} with ${frames.length} frames`);
}

export async function handleMoment(
    moment: MomentData,
    state: ServerEphemeralState,
    momentId: string | null,
    send_to_engine: (msg: InMemWorkerRequest) => void
) {
    const eventType = moment.type === 'instant' ? '⚡ Instant' : '🎯 Standard';
    logger.info({ moment }, `${eventType} moment detected!`);

    // Use provided moment ID or generate new one (fallback for safety)
    const finalMomentId = momentId || randomUUID();

    try {
        // Save thumbnail
        let thumbnailPath: string | null = null;
        const momentFrames = state.moment_frames.get(moment.media_id) || [];

        if (momentFrames.length > 0) {
            // Use middle frame as thumbnail
            const middleIndex = Math.floor(momentFrames.length / 2);
            const thumbnailFrame = momentFrames[middleIndex];

            if (thumbnailFrame) {
                const filename = `${finalMomentId}.jpg`;
                thumbnailPath = path.join(FRAMES_DIR, filename);
                await Bun.write(thumbnailPath, thumbnailFrame.data);
                logger.info({ thumbnailPath }, "Saved moment thumbnail");
            }
        }

        await createMoment({
            id: finalMomentId,
            media_id: moment.media_id,
            start_time: moment.start_timestamp,
            end_time: moment.end_timestamp,
            peak_deviation: moment.peak_deviation,
            type: moment.type,
            title: null,
            description: null,
            clip_path: null,
            thumbnail_path: thumbnailPath,
        });
        logger.info(`Saved moment to database for media ${moment.media_id}`);

        // Trigger summarization
        // momentFrames is already defined above
        if (momentFrames.length > 0) {
            await summarizeMoment(momentFrames, finalMomentId, send_to_engine);

            // Clear frames for this media
            state.moment_frames.delete(moment.media_id);
        } else {
            logger.warn(`No frames buffered for moment ${finalMomentId}, skipping enrichment`);
        }

    } catch (error) {
        logger.error({ error, moment }, "Failed to save moment to database");
    }
}
