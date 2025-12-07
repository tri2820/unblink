import { createResizeObserver } from "@solid-primitives/resize-observer";
import { Tooltip } from "@ark-ui/solid/tooltip";
import { createEffect, createSignal, For, Show, createMemo } from "solid-js";
import type { FrameStatsMessage } from "~/shared";
import { statsMessages, agents } from "./shared";
import { getStreamColor } from "./utils/colors";
import { ArkSelect, type SelectItem } from "./ark/ArkSelect";

type StatsCanvasProps = {
    viewedMedias: () => {
        media_id: string;
    }[];
    cameras: () => { id: string; name: string }[];
    selectedStatType: () => string;
}
function StatsCanvas(props: StatsCanvasProps) {
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

        // Find max value for scaling based on selected stat type
        let maxValue = 0;
        for (const msg of allMessages) {
            const statValue = msg.stats[props.selectedStatType()]?.value ?? 0;
            if (statValue > maxValue) {
                maxValue = statValue;
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
            const statValue = msg.stats[props.selectedStatType()]?.value ?? 0;
            const valueRatio = maxValue > 0 ? statValue / maxValue : 0;
            const barHeight = valueRatio * canvasHeight;
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

            const sma100Ratio = maxValue > 0 ? (msg.stats[props.selectedStatType()]?.sma100 ?? 0) / maxValue : 0;
            const sma100Y = canvasHeight - (sma100Ratio * canvasHeight);
            streamPaths[mediaId]!.sma100.push({ x, y: sma100Y });

            const sma10Ratio = maxValue > 0 ? (msg.stats[props.selectedStatType()]?.sma10 ?? 0) / maxValue : 0;
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

export default function StatsBar(props: {
    viewedMedias: () => {
        media_id: string;
    }[];
    cameras: () => { id: string; name: string }[];
}) {
    const [tooltipOpen, setTooltipOpen] = createSignal(false);
    const [selectedStatType, setSelectedStatType] = createSignal('motion_energy');

    // Get available stat types from current messages
    const statTypeOptions = createMemo<SelectItem[]>(() => {
        const allStatTypes = new Set<string>();
        
        // Collect all stat types from viewed medias
        for (const media of props.viewedMedias()) {
            const messages = statsMessages[media.media_id] || [];
            for (const message of messages) {
                Object.keys(message.stats).forEach(statType => {
                    allStatTypes.add(statType);
                });
            }
        }

        return Array.from(allStatTypes).map(statType => {
            let label: string;
            if (statType === 'motion_energy') {
                label = 'Motion Energy';
            } else if (statType.startsWith('agent_')) {
                const agentId = statType.replace('agent_', '');
                const agent = agents().find(a => a.id === agentId);
                label = agent ? `Agent: ${agent.name}` : `Agent ${agentId}`;
            } else {
                label = statType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }

            return {
                label,
                value: statType
            };
        }).sort((a, b) => {
            // Sort with motion_energy first, then agents, then others
            if (a.value === 'motion_energy') return -1;
            if (b.value === 'motion_energy') return 1;
            if (a.value.startsWith('agent_') && !b.value.startsWith('agent_')) return -1;
            if (!a.value.startsWith('agent_') && b.value.startsWith('agent_')) return 1;
            return a.label.localeCompare(b.label);
        });
    });

    // Get stream info for tooltip based on selected stat type
    const getStreamInfo = () => {
        const streams: { name: string, color: string, latestValue: number | null }[] = [];
        for (const media of props.viewedMedias()) {
            const colors = getStreamColor(media.media_id);
            const camera = props.cameras().find(c => c.id === media.media_id);

            // Get latest value for selected stat type
            const messages = statsMessages[media.media_id] || [];
            const latestValue = messages.length > 0 ? messages[messages.length - 1]!.stats[selectedStatType()]?.value ?? null : null;

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
                    <div class="absolute top-1.5 right-1.5 z-20">
                        <ArkSelect
                            items={statTypeOptions()}
                            value={selectedStatType}
                            onValueChange={(details) => setSelectedStatType(details.value[0] || 'motion_energy')}
                            placeholder="Select stat type"
                        />
                    </div>
                    <StatsCanvas 
                        viewedMedias={props.viewedMedias} 
                        cameras={props.cameras}
                        selectedStatType={selectedStatType}
                    />
                </div>
            </Tooltip.Trigger>
            <Tooltip.Positioner>
                <Tooltip.Content class="z-50 px-3 py-2 text-xs font-medium text-white bg-neu-950/90 border border-neu-700 rounded shadow-lg backdrop-blur-sm">
                    <div class="flex flex-col gap-1">
                        <div class="text-neu-400 mb-1 font-medium">
                            {statTypeOptions().find(opt => opt.value === selectedStatType())?.label || selectedStatType()}
                        </div>
                        <For each={getStreamInfo()}>
                            {(stream) => (
                                <div class="flex items-center gap-2">
                                    <div
                                        class="w-2 h-2 rounded-full shrink-0"
                                        style={{ "background-color": stream.color }}
                                    />
                                    <span class="shrink-0">{stream.name}</span>
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