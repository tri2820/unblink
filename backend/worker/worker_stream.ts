import { encode } from "cbor-x";
import type { PassThroughOpts, ServerToWorkerStreamMessage, ServerToWorkerStreamMessage_Add_Stream, WorkerStreamToServerMessage } from "../../shared";
import { logger } from "../logger";
import { streamMedia } from "../stream/index";
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

async function startStream(startArg: ServerToWorkerStreamMessage_Add_Stream, signal: AbortSignal) {
    logger.info(`Starting media stream for ${startArg.id}`);

    await streamMedia({
        ...startArg,
    }, (msg) => {

        // TODO: Use typescript to enforce this
        // Do not pay attention to the types here, it's just a hack
        // Make sure all passthrough fields are passed
        const passthrough = {
            id: startArg.id,
            is_ephemeral: startArg.is_ephemeral,
            session_id: startArg.session_id,
        }

        const worker_msg: WorkerStreamToServerMessage = {
            ...msg,
            ...passthrough,
        }

        // logger.info({ decoded_is_ephemeral: passthrough.is_ephemeral, passthrough }, 'Forwarding message here');
        sendMessage(worker_msg);
    }, signal, () => workerState);
}

async function startFaultTolerantStream(startArg: ServerToWorkerStreamMessage_Add_Stream, signal: AbortSignal) {
    const state = {
        hearts: 5,
    }
    let recovery_timeout: NodeJS.Timeout | null = null;
    while (true) {
        try {
            recovery_timeout = setTimeout(() => {
                logger.info(`Stream ${startArg.id} has been stable for 30 seconds, full recovery.`);
                state.hearts = 5;
            }, 30000);
            await startStream(startArg, signal);
            
            // Is demo video
            if (startArg.uri.startsWith('https://bucket.zapdoslabs.com/')) {
                // let it loop again
                continue;
            }
            
            logger.info('Stream ended gracefully, stopping.')
            break;
        } catch (e) {
            if (recovery_timeout) clearTimeout(recovery_timeout);
            state.hearts -= 1;
            if (state.hearts <= 0) {
                logger.error(e, `Stream for ${startArg.id} has failed too many times, giving up.`);
                return;
            }

            if (signal.aborted) {
                logger.info(`Abort signal received, stopping stream for ${startArg.id}`);
                return;
            }

            logger.error(e, `Error in streaming loop for ${startArg.id}, restarting (${state.hearts} hearts remaining)...`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

self.addEventListener("message", async (event) => {
    const msg: ServerToWorkerStreamMessage = event.data;


    if (msg.type === 'start_stream') {
        // console.log({ msg: JSON.stringify(msg) }, `Starting stream`);

        if (msg.uri) {
            const abortController = new AbortController();
            loops[msg.id] = {
                controller: abortController,
            };

            startFaultTolerantStream(msg, abortController.signal);
        }
    }



    if (msg.type === 'stop_stream') {
        // Stop the stream and clean up resources
        const loop_id = msg.id;
        logger.info(`Stopping stream ${loop_id}`);
        loops[loop_id]?.controller.abort();

        // Clean up state for this stream
        workerState.streams.delete(loop_id);
    }

    if (msg.type === 'set_moment_state') {
        logger.info({
            media_id: msg.media_id,
            should_write_moment: msg.should_write_moment,
            moment_id: msg.current_moment_id,
            discard_previous_maybe_moment: msg.discard_previous_maybe_moment,
        }, 'Setting moment state');

        const streamState = workerState.streams.get(msg.media_id);
        if (streamState) {
            streamState.should_write_moment = msg.should_write_moment;
            streamState.current_moment_id = msg.current_moment_id;
            streamState.discard_previous_maybe_moment = msg.discard_previous_maybe_moment;
        } else {
            // Initialize if doesn't exist
            workerState.streams.set(msg.media_id, {
                should_write_moment: msg.should_write_moment,
                current_moment_id: msg.current_moment_id,
                discard_previous_maybe_moment: msg.discard_previous_maybe_moment,
            });
        }
    }
});
