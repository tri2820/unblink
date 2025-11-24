import { randomUUID } from "crypto";
import path from "path";
import type { ServerEphemeralState } from "~/shared";
import type { Conn } from "~/shared/Conn";
import type { EngineToServer, RemoteJob, ServerRegistrationMessage, WorkerRequest } from "~/shared/engine";
import { FRAMES_DIR } from "../appdir";
import { createMoment } from "../database/utils";
import { logger } from "../logger";
import type { MomentData } from "./frame_stats";

export async function handleMoment(
    moment: MomentData,
    state: ServerEphemeralState,
    momentId: string | null
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

        // // Trigger summarization
        // // momentFrames is already defined above
        // if (momentFrames.length > 0) {
        //     const msg: WorkerRequest = {
        //         type: 'worker_request',
        //         worker_id: 'caption',
        //         identifier: {
        //             media_id: moment.media_id,
        //             moment_id: finalMomentId,
        //         },
        //         resources: momentFrames.map(f => ({
        //             data: f.data,
        //             type: 'image'
        //         })),
        //         query: `Describe specific details of main subjects.
        //         Ignore generic scenery. 
        //         Do not use phrases like 'The image shows', rather start directly with the subject. 
        //         Output a valid JSON object with keys: title (5 words), description (1 sentence or 2 sentences). 
        //         Example: {\"title\": \"...\", \"description\": \"...\"}`
        //     };

        //     engine_conn.send(msg);
        //     logger.info(`Sent moment enrichment request for ${moment.media_id} with ${momentFrames.length} frames`);

        //     // Clear frames for this media
        //     state.moment_frames.delete(moment.media_id);
        // } else {
        //     logger.warn(`No frames buffered for moment ${finalMomentId}, skipping enrichment`);
        // }

    } catch (error) {
        logger.error({ error, moment }, "Failed to save moment to database");
    }
}
