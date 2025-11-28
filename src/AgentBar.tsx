import { formatDistance } from "date-fns";
import { FaSolidChevronLeft, FaSolidChevronRight } from "solid-icons/fa";
import { FiEye } from "solid-icons/fi";
import { For, Show, createSignal, createMemo, onMount } from "solid-js";
import LoadingSkeleton from "./search/LoadingSkeleton";
import { cameras, relevantAgentCards, agents, fetchAgents } from "./shared";
import { ArkSelect, type SelectItem } from "./ark/ArkSelect";

export function useAgentBar() {
    const [showAgentBar, setShowAgentBar] = createSignal(true);
    const [selectedAgent, setSelectedAgent] = createSignal('all');

    // Fetch agents when component mounts
    onMount(() => {
        fetchAgents();
    });

    // Get agent names from agents table
    const agentOptions = createMemo<SelectItem[]>(() => {
        const agentsList = agents();
        
        return [
            { label: 'All Agents', value: 'all' },
            ...agentsList.map(agent => ({
                label: agent.name,
                value: agent.name
            }))
        ];
    });

    // Filter cards based on selected agent
    const filteredCards = createMemo(() => {
        const selected = selectedAgent();
        if (selected === 'all') {
            return relevantAgentCards();
        }
        return relevantAgentCards().filter(card => card.agent_name === selected);
    });

    const Toggle = () => <button
            onClick={() => setShowAgentBar(prev => !prev)}
            class="btn-small">
            <Show when={showAgentBar()} fallback={
                <>
                    <FaSolidChevronLeft class="w-4 h-4 " />
                    <div>Agents</div>
                </>
            }>
                <FaSolidChevronRight class="w-4 h-4 " />
            </Show>

        </button>
    return {
        showAgentBar,
        setShowAgentBar,
        Toggle,
        Comp: () => <div
            data-show={showAgentBar()}
            class="flex-none data-[show=true]:w-xl w-0 h-screen transition-[width] duration-300 ease-in-out overflow-hidden flex flex-col">
            <div class="border-l border-neu-800 bg-neu-900 shadow-2xl rounded-2xl flex-1 mr-2 my-2 flex flex-col h-full overflow-hidden">
                <div class="h-14 flex items-center gap-2 p-2">
                    <Toggle />
                    <Show when={showAgentBar()}>
                        <ArkSelect
                            items={agentOptions()}
                            value={selectedAgent}
                            onValueChange={(details) => setSelectedAgent(details.value[0] || 'all')}
                            placeholder="Filter by agent"
                            positioning={{ sameWidth: true }}
                        />
                    </Show>
                </div>

                <Show when={showAgentBar()}>
                    <div class="flex-1 p-2 overflow-y-auto space-y-4">
                        <Show when={relevantAgentCards().length > 0} fallback={
                            <LoadingSkeleton />
                        }>
                            <For each={filteredCards()}>
                                {(card) => {
                                    const stream_name = () => {
                                        const camera = cameras().find(c => c.id === card.media_id);
                                        return camera ? camera.name : 'Unknown Stream';
                                    }
                                    return <div class="animate-push-down p-4 bg-neu-850 rounded-2xl space-y-2">
                                        <div class="flex items-center justify-between">
                                            <div class="font-semibold">{stream_name()}</div>
                                            <Show when={card.agent_name}>
                                                <div class="flex items-center gap-1.5 text-xs px-2 py-1 bg-neu-800 rounded-lg text-neu-300 font-medium">
                                                    <FiEye class="w-3 h-3" />
                                                    {card.agent_name}
                                                </div>
                                            </Show>
                                        </div>
                                        <div class="text-neu-400 text-sm">{formatDistance(card.at_time, Date.now(), {
                                            addSuffix: true,
                                            includeSeconds: true
                                        })}</div>
                                        <div>{card.content}</div>
                                        <Show when={card.media_unit_id}>
                                            <img src={`/media_units/${card.media_unit_id}/image`} class="rounded-lg" />
                                        </Show>
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
