import { batch, createEffect, createResource, createSignal, onCleanup, Show, untrack } from "solid-js";
import { v4 as uuid } from 'uuid';
import { FaSolidPlay, FaSolidPause } from 'solid-icons/fa';
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

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function MomentPlaybackContent() {
    const currentTab = tab();
    const momentId = currentTab.type === 'moment_playback' ? currentTab.moment_id : '';

    const [moment] = createResource(() => momentId, fetchMoment);
    const [showDetections] = createSignal(false); // Moments don't have object detection
    const [state, setState] = createSignal<'stopped' | 'playing' | 'pausing'>('stopped')

    const [currentTimeMs, setCurrentTimeMs] = createSignal(0); // Track current time in ms
    const progress = () => {
        const m = untrack(moment);
        const t = currentTimeMs();
        if (!m) return 0;
        // start_time: 1763974713872
        // end_time: 1763974723872
        const duration = m.end_time - m.start_time;
        const p = Math.min(100, Math.max(0, (t / duration) * 100));
        return p;
    }

    // Get camera name for display
    const cameraName = () => {
        const m = moment();
        if (!m) return undefined;
        const camera = cameras().find(c => c.id === m.media_id);
        return camera?.name;
    };


    // Cleanup subscription on unmount or when stopping
    onCleanup(() => {
        console.log('MomentPlaybackContent unmounting, clearing subscription');
        setSubscription(undefined);
    });


    const playFrom = (seekTimeMs: number) => {
        const session_id = uuid();
        setState('playing');
        setSubscription({
            streams: [{
                session_id,
                type: 'ephemeral' as const,
                kind: 'moment' as const,
                id: momentId,
                init_seek_sec: seekTimeMs / 1000,
            }]
        });
    }

    const pauseVideo = () => {
        setState('pausing');
        setSubscription(undefined);
    }

    const handleSeek = (e: MouseEvent) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));

        const m = moment();
        if (!m || !m.start_time || !m.end_time) return;

        const durationMs = m.end_time - m.start_time;
        const seekTimeMs = (durationMs * percentage);

        console.log('Seek to:', seekTimeMs, 'ms');

        setCurrentTimeMs(seekTimeMs);
        const s = state();
        if (s === 'pausing') {
            // no-op
        } else if (s === 'playing') {
            // pauseVideo();
            playFrom(seekTimeMs);
            // setTimeout(() => {
            //     playFrom(seekTimeMs);
            // }, 1000);
        }
    };

    // Listen for stream ended message to reset play state
    createEffect(() => {
        const message = newMessage();
        if (!message) return;
        const s = subscription();
        if (!s) return;

        // Check if this is an 'ended' message for our moment
        const stream_sub = s.streams.find(stream => stream.id === momentId);
        if (!stream_sub || stream_sub.type !== 'ephemeral') return;

        if (message.type === 'ended' && message.id === momentId && message.session_id === stream_sub.session_id) {
            console.log('Moment playback ended, resetting to play button');
            setState('stopped');
            setSubscription(undefined);
        }
    });

    const ButtonOverlay = () => {
        return <div class="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors" >
            <div class="rounded-full bg-white/90 group-hover:bg-white p-6 transition-colors">
                <FaSolidPlay size={48} class="text-black ml-1" />
            </div>
        </div >
    }

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
                                    {m().description || "No description available"}
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
                            <div class="flex-1 bg-black relative group">
                                <Show
                                    when={m().clip_path}
                                    fallback={
                                        <div class="h-full flex items-center justify-center text-neu-400">
                                            No video clip available for this moment
                                        </div>
                                    }
                                >
                                    <Show
                                        when={state() === 'stopped'}>
                                        <div
                                            class="absolute inset-0 cursor-pointer group"
                                            onClick={() => {
                                                setCurrentTimeMs(0);
                                                playFrom(0);
                                            }}
                                        >
                                            {/* Thumbnail */}
                                            <Show when={m().thumbnail_path}>
                                                <img
                                                    src={`/moments/${momentId}/thumbnail`}
                                                    alt="Moment thumbnail"
                                                    class="absolute inset-0 w-full h-full object-contain"
                                                />
                                            </Show>

                                            <ButtonOverlay />
                                        </div>
                                    </Show>

                                    <Show
                                        when={state() === 'playing' || state() === 'pausing'}
                                    >
                                        <div class="relative h-full" onClick={() => {
                                            if (state() === 'playing') {
                                                pauseVideo()
                                            } else if (state() === 'pausing') {
                                                playFrom(currentTimeMs())
                                            }
                                        }}>

                                            <CanvasVideo
                                                id={momentId}
                                                showDetections={showDetections}
                                                // name={cameraName}
                                                onTimestamp={(ts) => {
                                                    const m = moment();
                                                    if (!m || !m.start_time || !m.end_time) return;
                                                    setCurrentTimeMs(ts);
                                                }}
                                            />

                                            {/* Controls Overlay */}
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                }}
                                                class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                {/* Progress Bar */}
                                                <div
                                                    class="relative h-1 bg-white/30 cursor-pointer mb-4 group/progress"
                                                    onClick={handleSeek}
                                                >
                                                    <div
                                                        class="absolute top-0 left-0 h-full bg-[#FF0000]"
                                                        style={{ width: `${progress()}%` }}
                                                    >
                                                        <div class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#FF0000] rounded-full scale-0 group-hover/progress:scale-100 transition-transform" />
                                                    </div>
                                                </div>

                                                {/* Controls Row */}
                                                <div class="flex items-center gap-4">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (state() === 'playing') {
                                                                pauseVideo()
                                                            } else if (state() === 'pausing') {
                                                                playFrom(currentTimeMs())
                                                            }
                                                        }}
                                                        class="text-white hover:text-gray-200 transition-colors"
                                                    >
                                                        <Show when={state() === 'playing'} fallback={<FaSolidPlay size={20} />}>
                                                            <FaSolidPause size={20} />
                                                        </Show>
                                                    </button>

                                                    <div class="text-white text-sm font-medium">
                                                        {formatTime(currentTimeMs() / 1000)} / {formatTime(Math.round((m().end_time - m().start_time) / 1000))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
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
