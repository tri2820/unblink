import { randomUUID } from "crypto";
import type { ServerEphemeralState } from "~/shared";
import { logger } from "./logger";

export type Builder = {
    keys: string[],
    interval: number,
    should_run: (props: { in_moment: boolean, last_time_run: number }) => boolean,
    write?: (media_id: string, media_unit_id: string, data: Uint8Array) => Promise<void>
};

export const builders: { [builder_id: string]: Builder } = {
    'motion_energy': {
        keys: ['motion_energy'],
        interval: 1000,
        should_run() {
            return true
        },
    }
};

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
