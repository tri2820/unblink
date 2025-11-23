import { encode } from "cbor-x";
import path from "path";
import type { ServerToWorkerStreamMessage, WorkerStreamToServerMessage } from "../../shared";
import { RECORDINGS_DIR } from "../appdir";
import { logger } from "../logger";
import { streamMedia, type StartStreamArg } from "../stream/index";
import type { WorkerState } from "./worker_state";
declare var self: Worker;

logger.info("Worker 'stream' started");

const workerState: WorkerState = {
    streams: new Map(),
};

const loops: {
    [loop_id: string]: {
        controller: AbortController;
    }
} = {};


process.on("unhandledRejection", (r) => {
    console.error("[worker] unhandledRejection:", r);
    try { postMessage?.({ __worker_error: String(r) }); } catch (_) { }
});
process.on("uncaughtException", (e) => {
    console.error("[worker] uncaughtException:", e);
    try { postMessage?.({ __worker_error: String(e && e.stack || e) }); } catch (_) { }
});

function sendMessage(msg: WorkerStreamToServerMessage) {
    const worker_msg = encode(msg);
    self.postMessage(worker_msg, [worker_msg.buffer]);
}

async function startStream(stream: StartStreamArg, signal: AbortSignal) {
    logger.info(`Starting media stream for ${stream.id}`);

    await streamMedia(stream, (msg) => {
        const worker_msg: WorkerStreamToServerMessage = {
            ...msg,
            media_id: stream.id,
            file_name: stream.file_name,
        }

        sendMessage(worker_msg);
    }, signal, () => workerState);
}

async function startFaultTolerantStream(stream: StartStreamArg, signal: AbortSignal) {
    const state = {
        hearts: 5,
    }
    let recovery_timeout: NodeJS.Timeout | null = null;
    while (true) {
        try {
            recovery_timeout = setTimeout(() => {
                logger.info(`Stream ${stream.id} has been stable for 30 seconds, full recovery.`);
                state.hearts = 5;
            }, 30000);
            await startStream(stream, signal);
        } catch (e) {
            if (recovery_timeout) clearTimeout(recovery_timeout);
            state.hearts -= 1;
            if (state.hearts <= 0) {
                logger.error(e, `Stream for ${stream.id} has failed too many times, giving up.`);
                return;
            }
            logger.error(e, `Error in streaming loop for ${stream.id}, restarting (${state.hearts} hearts remaining)...`);
            if (signal.aborted) {
                logger.info(`Abort signal received, stopping stream for ${stream.id}`);
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

self.addEventListener("message", async (event) => {
    const msg: ServerToWorkerStreamMessage = event.data;
    if (msg.type === 'start_stream') {
        logger.info(`Starting stream ${msg.media_id} with URI ${msg.uri}`);

        if (msg.uri) {
            const abortController = new AbortController();
            const loop_id = msg.media_id;

            // Initialize state for this stream in global workerState
            workerState.streams.set(msg.media_id, {
                should_write_moment: false,
            });

            loops[loop_id] = {
                controller: abortController,
            };

            startFaultTolerantStream({
                id: msg.media_id,
                uri: msg.uri,
                save_location: msg.saveDir,
            }, abortController.signal);
        }
    }

    if (msg.type === 'start_stream_file') {

        logger.info(`Starting file stream ${msg.media_id} for file ${msg.file_name}`);
        const abortController = new AbortController();
        const loop_id = `${msg.media_id}::${msg.file_name}`;

        // Initialize state for this stream in global workerState
        workerState.streams.set(msg.media_id, {
            should_write_moment: false,
        });

        loops[loop_id] = {
            controller: abortController,
        };
        const dir = `${RECORDINGS_DIR}/${msg.media_id}`;
        const uri = path.join(dir, msg.file_name);
        try {
            await startStream({
                id: msg.media_id,
                uri,
                file_name: msg.file_name,
            }, abortController.signal);
        } catch (error) {
            logger.error(error, `Error starting file stream for ${msg.media_id} file ${msg.file_name}`);
        }
    }

    if (msg.type === 'stop_stream') {
        logger.info(`Stopping stream ${msg.media_id}`);
        // Stop the stream and clean up resources
        const loop_id = msg.file_name ? `${msg.media_id}::${msg.file_name}` : msg.media_id;
        loops[loop_id]?.controller.abort();

        // Clean up state for this stream
        workerState.streams.delete(msg.media_id);
    }

    if (msg.type === 'set_moment_state') {
        logger.info({
            media_id: msg.media_id,
            should_write_moment: msg.should_write_moment,
            moment_id: msg.current_moment_id,
            delete_on_close: msg.delete_on_close,
        }, 'Setting moment state');

        const streamState = workerState.streams.get(msg.media_id);
        if (streamState) {
            streamState.should_write_moment = msg.should_write_moment;
            streamState.current_moment_id = msg.current_moment_id;
            streamState.delete_on_close = msg.delete_on_close;
        } else {
            // Initialize if doesn't exist
            workerState.streams.set(msg.media_id, {
                should_write_moment: msg.should_write_moment,
                current_moment_id: msg.current_moment_id,
                delete_on_close: msg.delete_on_close,
            });
        }
    }
});
