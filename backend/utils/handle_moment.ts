import { randomUUID } from "crypto";
import path from "path";
import { createRequestBuilder } from "~/index";
import type { ServerEphemeralState } from "../../index";
import type { Resource, WorkerInput__Caption, WorkerInput__Llm, WorkerInput__Vlm, WorkerOutput__Caption, WorkerOutput__Llm, WorkerOutput__Vlm } from "~/shared/engine";
import { FRAMES_DIR } from "../appdir";
import { createMoment, updateMoment } from "../database/utils";
import { logger } from "../logger";
import { parseJsonFromString } from "./dirty_json";
import type { MomentData } from "./frame_stats";

type FrameData = {
    id: string;
    at_time: number;
    data: Uint8Array;
};

async function summarizeMoment(
    frames: FrameData[],
    momentId: string
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

    logger.info({ momentId }, `Starting moment summarization`);

    const reqBuilder = createRequestBuilder();
    reqBuilder.add_resources(image_resources);
    const read_promise = reqBuilder.add_job<WorkerInput__Caption, WorkerOutput__Caption>('caption', {
        images: image_resources.map(r => ({ __type: 'resource-ref' as const, id: r.id })),
        query: 'Describe the activities and events happening in these consecutive camera frames, focusing on any abnormal behavior or notable actions. Pinpoint each individual and object. Pay attention to movements, interactions, and any unusual occurrences, like something entering or leaving the scene or possible safety concerns.'
        // messages: [
        //     {
        //         role: 'system',
        //         content: [{
        //             type: 'text',
        //             text: 'You are a security camera analyst. Describe what you observe in these video frames naturally and in detail.'
        //         }]
        //     },
        //     {
        //         role: 'user',
        //         content: [
        //             {
        //                 type: 'text',
        //                 text: 'These are consecutive frames from a security camera. Describe what is happening. Focus on any abnormal behavior, unusual activities, or significant changes. Pay attention to people, objects, movements, and any concerning patterns. Answer naturally and in detail.'
        //             },
        //             ...image_resources.map(r => ({
        //                 type: 'image' as const,
        //                 image: { __type: 'resource-ref' as const, id: r.id }
        //             }))
        //         ]
        //     }
        // ]
    })


    reqBuilder.send();
    const read_output = await read_promise;

    const llm_reqBuilder = createRequestBuilder();

    const llm_output_promise = llm_reqBuilder.add_job<WorkerInput__Llm, WorkerOutput__Llm>('llm_fast', {
        messages: [
            {
                role: 'system',
                content: 'You are a JSON formatter. Convert security camera observations into structured JSON format. Focus on abnormal behavior and create clear, actionable titles.'
            },
            {
                role: 'user',
                content: `Based on this security camera observation, create a JSON response with two fields:
1. "title": A clear, concise title with SUBJECT and ACTION (e.g., "Person loitering near entrance", "Vehicle blocking driveway", "Package left unattended"). Focus on abnormal or notable behavior.
2. "description": A detailed description of what was observed, including context and any concerns.

Observation:
${read_output.response}

Respond with ONLY valid JSON in this format:
{
  "title": "Subject performing action",
  "description": "Detailed description here"
}`
            }
        ]
    });

    llm_reqBuilder.send();
    const llm_output = await llm_output_promise;
    const llmResponse = llm_output.response;

    // Parse and validate the formatted response
    const parsed = parseJsonFromString(llmResponse);

    logger.info({ parsed }, 'Parsed LLM response');

    const title = parsed.data.title;
    const description = parsed.data.description;
    if (typeof title === 'string' && typeof description === 'string') {
        updateMoment(momentId, {
            title,
            description,
        });
        logger.info({ momentId, title }, "Successfully updated moment with summarization");
    } else {
        logger.error({ response: llmResponse }, "Formatted response missing valid title or description");
    }
}

export async function handleMoment(
    moment: MomentData,
    state: ServerEphemeralState,
    momentId: string | null,
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
            await summarizeMoment(momentFrames, finalMomentId);
            // Clear frames for this media
            state.moment_frames.delete(moment.media_id);
        } else {
            logger.warn(`No frames buffered for moment ${finalMomentId}, skipping enrichment`);
        }

    } catch (error) {
        logger.error({ error, moment }, "Failed to save moment to database");
    }
}
