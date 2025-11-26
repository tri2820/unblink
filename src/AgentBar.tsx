import { formatDistance } from "date-fns";
import { FaSolidChevronLeft, FaSolidChevronRight } from "solid-icons/fa";
import { For, Show, createSignal } from "solid-js";
import type { MediaUnit } from "~/shared";
import LoadingSkeleton from "./search/LoadingSkeleton";
import { cameras, relevantAgentCards } from "./shared";

export function useAgentBar() {
    const [showAgentBar, setShowAgentBar] = createSignal(true);

    const Toggle = () => <button
            onClick={() => setShowAgentBar(prev => !prev)}
            class="btn-small">
            <Show when={showAgentBar()} fallback={<FaSolidChevronLeft class="w-4 h-4 " />}>
                <FaSolidChevronRight class="w-4 h-4 " />
            </Show>
            <div>Agent</div>

        </button>
    return {
        showAgentBar,
        setShowAgentBar,
        Toggle,
        Comp: () => <div
            data-show={showAgentBar()}
            class="flex-none data-[show=true]:w-xl w-0 h-screen transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col">
            <div class="border-l border-neu-800 bg-neu-900 shadow-2xl rounded-2xl flex-1 mr-2 my-2 flex flex-col h-full overflow-hidden">
                <div class="h-14 flex items-center p-2">
                    <Toggle />
                </div>

                <Show when={showAgentBar()}>
                    <div class="flex-1 p-2 overflow-y-auto space-y-4">
                        <Show when={relevantAgentCards().length > 0} fallback={
                            <LoadingSkeleton />
                        }>
                            <For each={relevantAgentCards()}>
                                {(card) => {
                                    const stream_name = () => {
                                        const camera = cameras().find(c => c.id === card.media_id);
                                        return camera ? camera.name : 'Unknown Stream';
                                    }
                                    return <div class="animate-push-down p-4 bg-neu-850 rounded-2xl space-y-2">
                                        <div class="font-semibold">{stream_name()}</div>
                                        <div class="text-neu-400 text-sm">{formatDistance(card.at_time, Date.now(), {
                                            addSuffix: true,
                                            includeSeconds: true
                                        })}</div>
                                        <div>{card.description}</div>
                                        <img src={`/files?path=${card.path}`} class="rounded-lg" />
                                    </div>
                                }}
                            </For>
                        </Show>
                    </div>
                </Show>
            </div>
        </div>
    }
}
