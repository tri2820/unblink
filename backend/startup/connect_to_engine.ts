import type { ServerWebSocket } from "bun";

import type { ServerEphemeralState } from "../../index";
import type { WebhookMessage } from "~/shared/alert";
import { Conn } from "~/shared/Conn";
import type { EngineToServer, RemoteJob, ServerRegistrationMessage, WorkerRequest } from "~/shared/engine";
import { logger } from "../logger";
import type { WsClient } from "../WsClient";


export function connect_to_engine(props: {
    state: () => ServerEphemeralState,
    ENGINE_URL: string,
    forward_to_webhook: (msg: WebhookMessage) => Promise<void>,
    clients: () => Map<ServerWebSocket, WsClient>,
    worker_stream: Worker,
}) {
    const engine_conn = new Conn<ServerRegistrationMessage | WorkerRequest, EngineToServer>(`wss://${props.ENGINE_URL}/ws`, {
        onOpen() {
            const msg: ServerRegistrationMessage = {
                type: "i_am_server",
                version: "1.0.1",
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
            if (decoded.type === 'worker_response') {
                const jobsMap = props.state().remote_worker_jobs_cont;
                const cont = jobsMap.get(decoded.job_id);
                if (!cont) {
                    logger.error(`No continuation found for job_id ${decoded.job_id}`);
                    return;
                }

                cont(decoded.output);
                // Remove continuation
                jobsMap.delete(decoded.job_id);
            }
        }
    });

    return engine_conn;
}