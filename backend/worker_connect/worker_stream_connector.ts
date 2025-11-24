import type { ServerToWorkerStreamMessage, ServerToWorkerStreamMessage_Add_Stream } from "~/shared";
import { getAllMedia } from "../database/utils";
import { logger } from "../logger";

export async function start_streams(opts: {
    worker_stream: Worker
}) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // stagger starts
    try {
        const allMedia = await getAllMedia();
        for (const media of allMedia) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // stagger starts
            if (media.id && media.uri) {
                logger.info({ media }, `Starting stream:`);
                start_stream(opts.worker_stream, {
                    id: media.id,
                    uri: media.uri,
                    save_location: media.save_location || '',
                });
            }
        }
    } catch (error) {
        logger.error(error, "Error starting streams from database");
    }
}

export function start_stream(worker: Worker, opts: Omit<ServerToWorkerStreamMessage_Add_Stream, 'type'>) {
    const start_msg: ServerToWorkerStreamMessage = {
        type: 'start_stream',
        ...opts,
    }

    worker.postMessage(start_msg);
}

export function stop_stream(worker: Worker, opts: {
    id: string,
}) {
    const stop_msg: ServerToWorkerStreamMessage = {
        type: 'stop_stream',
        id: opts.id,
    }

    worker.postMessage(stop_msg);
}

export function set_moment_state(worker: Worker, opts: {
    media_id: string,
    should_write_moment?: boolean,
    current_moment_id?: string,
    discard_previous_maybe_moment?: boolean,
}) {
    const msg: ServerToWorkerStreamMessage = {
        type: 'set_moment_state',
        media_id: opts.media_id,
        should_write_moment: opts.should_write_moment,
        current_moment_id: opts.current_moment_id,
        discard_previous_maybe_moment: opts.discard_previous_maybe_moment,
    }

    worker.postMessage(msg);
}
