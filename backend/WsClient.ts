import type { ServerWebSocket } from "bun";
import { encode } from "cbor-x";
import type { ServerToClientMessage, Subscription } from "~/shared";
import { getMomentById } from "./database/utils";
import { start_stream, stop_stream } from "./worker_connect/worker_stream_connector";
import { logger } from "./logger";

export class WsClient {
    private _subscription: Subscription | null | undefined;
    private destroyed: boolean = false;
    constructor(
        public ws: ServerWebSocket,
        public worker_stream: () => Worker,
    ) {

    }

    async updateSubscription(subscription: Subscription | null | undefined) {
        const old_subscription = this._subscription;
        this._subscription = subscription;

        const ephemeral_subs = subscription?.streams.filter(s => s.type === 'ephemeral') || [];

        // We are comparing by session_id
        const new_ephemeral_subs = ephemeral_subs.filter(s => !old_subscription?.streams.some(s2 => s2.type === 'ephemeral' && s2.session_id === s.session_id));
        const old_ephemeral_subs = old_subscription?.streams.filter(s => s.type === 'ephemeral' && !subscription?.streams.some(s2 => s2.type === 'ephemeral' && s2.session_id === s.session_id)) || [];

        // logger.info({
        //     new_ephemeral_subs,
        //     old_ephemeral_subs,
        // }, "Updating subscription");

        // Close old ephemeral streams
        for (const old_sub of old_ephemeral_subs) {
            stop_stream(this.worker_stream(), {
                id: old_sub.id,
            });
        }

        // Open new ephemeral streams
        for (const new_sub of new_ephemeral_subs) {

            if (new_sub.kind === 'moment') {
                // Read database for this moment, the get clip_path
                const moment = await getMomentById(new_sub.id);

                // Check if we are still subscribed to this moment (race condition check)
                const is_still_subscribed = this._subscription?.streams.some(s => s.id === new_sub.id);

                if (is_still_subscribed && moment?.clip_path) {
                    start_stream(this.worker_stream(), {
                        id: new_sub.id,
                        uri: moment.clip_path,
                        is_ephemeral: true,
                        init_seek_sec: new_sub.init_seek_sec,
                        session_id: new_sub.session_id,
                    });
                }
            }
        }
    }

    get subscription() {
        return this.destroyed ? null : this._subscription;
    }

    destroy() {
        this.updateSubscription(null);
        this.destroyed = true;
    }

    send(
        msg: ServerToClientMessage,
    ) {

        if (this.destroyed) return;

        const send = {
            ...msg,
        }
        const encoded = encode(send)
        this.ws.send(encoded);
    }
}
