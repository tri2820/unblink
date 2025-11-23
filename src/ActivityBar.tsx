import { createResizeObserver } from "@solid-primitives/resize-observer";
import { Tooltip } from "@ark-ui/solid/tooltip";
import { FaSolidEye, FaSolidEyeSlash } from "solid-icons/fa";
import { createEffect, createSignal, For, Show } from "solid-js";
import type { FrameStatsMessage } from "~/shared";
import { statsMessages } from "./shared";
import { getStreamColor } from "./utils/colors";

type MotionCanvasProps = {
    viewedMedias: () => {
        media_id: string;
    }[];
    cameras: () => { id: string; name: string }[];
}
function MotionCanvas(props: MotionCanvasProps) {
    let canvasRef: HTMLCanvasElement | undefined;
    let containerRef: HTMLDivElement | undefined;

    const [size, setSize] = createSignal({ width: 0, height: 0 });

    // Observe container size and update a signal
    createResizeObserver(() => containerRef, ({ width, height }) => {
        setSize({ width, height });
    });

    // Drawing effect - re-runs when size or statsMessages changes
    createEffect(() => {
        const { width, height } = size();

        if (!canvasRef || width === 0 || height === 0) {
            return;
        }

        const ctx = canvasRef.getContext('2d');
        if (!ctx) return;

        // Collect all messages for viewed streams
        const allMessages: FrameStatsMessage[] = [];
        for (const media of props.viewedMedias()) {
            const messages = statsMessages[media.media_id] || [];
            allMessages.push(...messages);
        }

        // Sort by timestamp to interleave messages from different streams
        allMessages.sort((a, b) => a.timestamp - b.timestamp);

        if (allMessages.length === 0) {
            // Clear canvas
            canvasRef.width = Math.floor(width);
            canvasRef.height = Math.floor(height);
            return;
        }

        // Find max energy for scaling
        let maxEnergy = 0;
        for (const msg of allMessages) {
            if (msg.motion_energy > maxEnergy) {
                maxEnergy = msg.motion_energy;
            }
        }

        // Set canvas resolution
        const canvasWidth = Math.floor(width);
        const canvasHeight = Math.floor(height);
        canvasRef.width = canvasWidth;
        canvasRef.height = canvasHeight;

        const barWidth = canvasWidth / allMessages.length;
        const barSpacing = Math.min(barWidth * 0.2, 2);
        const effectiveBarWidth = Math.max(0.5, barWidth - barSpacing);

        // Draw bars
        allMessages.forEach((msg, idx) => {
            const x = idx * barWidth + barSpacing / 2;
            const energyRatio = maxEnergy > 0 ? msg.motion_energy / maxEnergy : 0;
            const barHeight = energyRatio * canvasHeight;
            const yTop = Math.round(canvasHeight - barHeight);
            const h = canvasHeight - yTop;

            const colors = getStreamColor(msg.media_id);
            ctx.fillStyle = colors.base;
            ctx.fillRect(x, yTop, effectiveBarWidth, h);
        });

        // Draw average lines per stream
        const streamPaths: Record<string, {
            sma10: { x: number, y: number }[],
            sma100: { x: number, y: number }[],
            colors: ReturnType<typeof getStreamColor>
        }> = {};

        allMessages.forEach((msg, idx) => {
            const x = idx * barWidth + barSpacing / 2 + effectiveBarWidth / 2;
            const mediaId = msg.media_id;

            if (!streamPaths[mediaId]) {
                streamPaths[mediaId] = {
                    sma10: [],
                    sma100: [],
                    colors: getStreamColor(mediaId)
                };
            }

            const sma100Ratio = maxEnergy > 0 ? msg.sma100 / maxEnergy : 0;
            const sma100Y = canvasHeight - (sma100Ratio * canvasHeight);
            streamPaths[mediaId]!.sma100.push({ x, y: sma100Y });

            const sma10Ratio = maxEnergy > 0 ? msg.sma10 / maxEnergy : 0;
            const sma10Y = canvasHeight - (sma10Ratio * canvasHeight);
            streamPaths[mediaId]!.sma10.push({ x, y: sma10Y });
        });

        // Draw lines for each stream
        Object.values(streamPaths).forEach(paths => {
            // Draw SMA-100 line
            if (paths.sma100.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = paths.colors.shades[300];
                ctx.lineWidth = 1.5;

                if (paths.sma100.length === 1) {
                    ctx.moveTo(0, paths.sma100[0]!.y);
                    ctx.lineTo(canvasWidth, paths.sma100[0]!.y);
                } else {
                    ctx.moveTo(0, paths.sma100[0]!.y);
                    for (let i = 0; i < paths.sma100.length; i++) {
                        ctx.lineTo(paths.sma100[i]!.x, paths.sma100[i]!.y);
                    }
                    ctx.lineTo(canvasWidth, paths.sma100[paths.sma100.length - 1]!.y);
                }
                ctx.stroke();
            }

            // Draw SMA-10 line
            if (paths.sma10.length > 0) {
                ctx.beginPath();
                ctx.strokeStyle = paths.colors.shades[200];
                ctx.lineWidth = 1.5;

                if (paths.sma10.length === 1) {
                    ctx.moveTo(0, paths.sma10[0]!.y);
                    ctx.lineTo(canvasWidth, paths.sma10[0]!.y);
                } else {
                    ctx.moveTo(0, paths.sma10[0]!.y);
                    for (let i = 0; i < paths.sma10.length; i++) {
                        ctx.lineTo(paths.sma10[i]!.x, paths.sma10[i]!.y);
                    }
                    ctx.lineTo(canvasWidth, paths.sma10[paths.sma10.length - 1]!.y);
                }
                ctx.stroke();
            }
        });
    });

    return (
        <div class="pt-2 border border-neu-800 bg-neu-900 rounded-2xl overflow-hidden relative h-24 cursor-default">
            <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
                <canvas
                    ref={canvasRef}
                    style={{
                        position: "absolute",
                        "z-index": 10,
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        display: "block"
                    }}
                />
            </div>
        </div>
    );
}

export default function ActivityBar(props: {
    viewedMedias: () => {
        media_id: string;
    }[];
    cameras: () => { id: string; name: string }[];
}) {
    const [show, setShow] = createSignal(true);
    const [tooltipOpen, setTooltipOpen] = createSignal(false);

    // Get stream info for tooltip
    const getStreamInfo = () => {
        const streams: { name: string, color: string, latestValue: number | null }[] = [];
        for (const media of props.viewedMedias()) {
            const colors = getStreamColor(media.media_id);
            const camera = props.cameras().find(c => c.id === media.media_id);

            // Get latest motion_energy for this stream
            const messages = statsMessages[media.media_id] || [];
            const latestValue = messages.length > 0 ? messages[messages.length - 1]!.motion_energy : null;

            streams.push({
                name: camera?.name || media.media_id.slice(0, 8),
                color: colors.base,
                latestValue
            });
        }
        return streams;
    };

    return (
        <Tooltip.Root
            open={tooltipOpen()}
            onOpenChange={(details) => setTooltipOpen(details.open)}
            positioning={{
                placement: 'top',
                offset: { mainAxis: 8 }
            }}
        >
            <Tooltip.Trigger class="relative mr-2 mb-2">
                <div class="relative w-full h-full">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShow(p => !p);
                        }}
                        data-show={show()}
                        class="btn-small data-[show=true]:absolute top-1.5 left-1.5 z-20">
                        <Show when={show()} fallback={<FaSolidEyeSlash class="w-4 h-4 " />}>
                            <FaSolidEye class="w-4 h-4 " />
                        </Show>
                        <div>Activity</div>
                    </button>

                    <Show when={show()}>
                        <MotionCanvas viewedMedias={props.viewedMedias} cameras={props.cameras} />
                    </Show>
                </div>
            </Tooltip.Trigger>
            <Tooltip.Positioner>
                <Tooltip.Content class="z-50 px-3 py-2 text-xs font-medium text-white bg-neu-950/90 border border-neu-700 rounded shadow-lg backdrop-blur-sm">
                    <div class="flex flex-col gap-1">
                        <For each={getStreamInfo()}>
                            {(stream) => (
                                <div class="flex items-center gap-2">
                                    <div
                                        class="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ "background-color": stream.color }}
                                    />
                                    <span class="flex-shrink-0">{stream.name}</span>
                                    <span class="text-neu-300 ml-auto font-mono text-xs">
                                        {stream.latestValue !== null ? stream.latestValue.toFixed(5) : '—'}
                                    </span>
                                </div>
                            )}
                        </For>
                    </div>
                </Tooltip.Content>
            </Tooltip.Positioner>
        </Tooltip.Root>
    );
}