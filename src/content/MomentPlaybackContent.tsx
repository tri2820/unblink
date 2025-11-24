import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js";
import { v4 as uuid } from 'uuid';
import { FaSolidPlay } from 'solid-icons/fa';
import LayoutContent from "./LayoutContent";
import type { Moment } from "../../shared/database";
import { cameras, setSubscription, subscription, tab } from "../shared";
import CanvasVideo from "../CanvasVideo";
import { newMessage } from "../video/connection";

const fetchMoment = async (id: string): Promise<Moment> => {
    const response = await fetch(`/moments/${id}`);
    if (!response.ok) {
        throw new Error("Failed to fetch moment");
    }
    const moment: Moment = await response.json();
    console.log('moment', moment);
    return moment;
};

export default function MomentPlaybackContent() {
    const currentTab = tab();
    const momentId = currentTab.type === 'moment_playback' ? currentTab.moment_id : '';

    const [moment] = createResource(() => momentId, fetchMoment);
    const [showDetections] = createSignal(false); // Moments don't have object detection
    const [isPlaying, setIsPlaying] = createSignal(false); // Track playing state

    // Get camera name for display
    const cameraName = () => {
        const m = moment();
        if (!m) return undefined;
        const camera = cameras().find(c => c.id === m.media_id);
        return camera?.name;
    };

    // Handle subscription for moment playback - only when playing
    createEffect(() => {
        const m = moment();
        if (m && m.clip_path && isPlaying()) {
            console.log('Setting up moment playback subscription for:', momentId);
            const session_id = uuid();

            setSubscription({
                session_id,
                streams: [{
                    type: 'ephemeral' as const,
                    kind: 'moment' as const,
                    id: momentId
                }]
            });
        }
    });

    // Cleanup subscription on unmount or when stopping
    onCleanup(() => {
        console.log('MomentPlaybackContent unmounting, clearing subscription');
        setSubscription(undefined);
    });

    // Handle play button click
    const handlePlay = () => {
        setIsPlaying(true);
    };

    // Listen for stream ended message to reset play state
    createEffect(() => {
        const message = newMessage();
        if (!message) return;
        const s = subscription();
        if (!s) return;

        // Check if this is an 'ended' message for our moment
        if (message.type === 'ended' && message.id === momentId && message.session_id === s.session_id) {
            console.log('Moment playback ended, resetting to play button');
            setIsPlaying(false);
            setSubscription(undefined);
        }
    });

    return (
        <LayoutContent title="Moment Playback">
            <div class="h-full flex flex-col">
                <Show when={!moment.loading && moment()} fallback={
                    <div class="flex-1 flex items-center justify-center text-neu-400">
                        Loading moment...
                    </div>
                }>
                    {(m) => (
                        <>
                            {/* Moment Info Header */}
                            <div class="p-4 bg-neu-900 border-b border-neu-800">
                                <h2 class="text-xl font-semibold text-neu-100 mb-1">
                                    {m().title || "Untitled Moment"}
                                </h2>
                                <p class="text-sm text-neu-400">
                                    {m().short_description || "No description available"}
                                </p>
                                <div class="mt-2 text-xs text-neu-500">
                                    <span>{new Date(m().start_time).toLocaleString()}</span>
                                    {m().end_time && (
                                        <span class="ml-4">
                                            Duration: {Math.round((m().end_time - m().start_time) / 1000)}s
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Video Player */}
                            <div class="flex-1 bg-black relative">
                                <Show
                                    when={m().clip_path}
                                    fallback={
                                        <div class="h-full flex items-center justify-center text-neu-400">
                                            No video clip available for this moment
                                        </div>
                                    }
                                >
                                    <Show
                                        when={isPlaying()}
                                        fallback={
                                            <div
                                                class="absolute inset-0 cursor-pointer group"
                                                onClick={handlePlay}
                                            >
                                                {/* Thumbnail */}
                                                <Show when={m().thumbnail_path}>
                                                    <img
                                                        src={`/moments/${momentId}/thumbnail`}
                                                        alt="Moment thumbnail"
                                                        class="absolute inset-0 w-full h-full object-contain"
                                                    />
                                                </Show>

                                                {/* Play Button Overlay */}
                                                <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                                                    <div class="rounded-full bg-white/90 group-hover:bg-white p-6 transition-colors">
                                                        <FaSolidPlay size={48} class="text-black ml-1" />
                                                    </div>
                                                </div>
                                            </div>
                                        }
                                    >
                                        <CanvasVideo
                                            id={momentId}
                                            showDetections={showDetections}
                                            name={cameraName}
                                        />
                                    </Show>
                                </Show>
                            </div>
                        </>
                    )}
                </Show>
            </div>
        </LayoutContent>
    );
}
