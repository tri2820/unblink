import type { ServerToWorkerStreamMessage, ServerToWorkerStreamMessage_Add_File, ServerToWorkerStreamMessage_Add_Stream } from "~/shared";
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
                start_stream({
                    worker: opts.worker_stream,
                    media_id: media.id,
                    uri: media.uri,
                    saveDir: media.saveDir || '',
                });
            }
        }
    } catch (error) {
        logger.error(error, "Error starting streams from database");
    }
}

export function start_stream(opts: Omit<ServerToWorkerStreamMessage_Add_Stream, 'type'> & { worker: Worker, saveDir: string }) {
    const start_msg: ServerToWorkerStreamMessage = {
        type: 'start_stream',
        media_id: opts.media_id,
        uri: opts.uri,
        saveDir: opts.saveDir,
    }

    opts.worker.postMessage(start_msg);
}



export function stop_stream(opts: {
    worker: Worker,
    media_id: string,
}) {
    const stop_msg: ServerToWorkerStreamMessage = {
        type: 'stop_stream',
        media_id: opts.media_id,
    }

    opts.worker.postMessage(stop_msg);
}

export function set_moment_state(opts: {
    worker: Worker,
    media_id: string,
    should_write_moment: boolean,
    current_moment_id?: string,
    delete_on_close?: boolean,
}) {
    const msg: ServerToWorkerStreamMessage = {
        type: 'set_moment_state',
        media_id: opts.media_id,
        should_write_moment: opts.should_write_moment,
        current_moment_id: opts.current_moment_id,
        delete_on_close: opts.delete_on_close,
    }

    opts.worker.postMessage(msg);
}
