import { createSignal, For, onMount, Show } from 'solid-js';
import { FiEye } from "solid-icons/fi";
import { authorized_as_admin, agents, agentsLoading, fetchAgents, setAgents } from "../shared";
import LayoutContent from "./LayoutContent";
import DeleteAgentButton from "../DeleteAgentButton";
import MetricsButton from "../MetricsButton";

export default function AgentsContent() {
    onMount(fetchAgents);

    return <LayoutContent title="Agents">
        <Show when={!agentsLoading()} fallback={
            <div class="h-full flex items-center justify-center">
                <div class="text-neu-500">Loading agents...</div>
            </div>
        }>
            <Show when={agents().length > 0} fallback={
                <div class="h-full flex items-center justify-center text-neu-500">
                    <div>
                        <FiEye class="mb-4 w-12 h-12" />
                        <p>No agents found</p>
                        <p>Create your first agent to get started</p>
                    </div>
                </div>
            }>
                <div class="relative overflow-x-auto h-full">
                    <table class="w-full text-sm text-left text-neu-400">
                        <thead class="text-neu-400 font-normal">
                            <tr class="">
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Agent Name
                                </th>
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Instruction
                                </th>
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Objects to Look For
                                </th>
                                <Show when={authorized_as_admin()}>
                                    <th scope="col" class="px-6 py-3 font-medium">
                                        Actions
                                    </th>
                                </Show>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={agents()}>
                                {(agent) => (
                                    <tr class="border-b bg-neu-900 border-neu-800">
                                        <td class="px-6 py-4 font-medium text-white">
                                            {agent.name}
                                        </td>
                                        <td class="px-6 py-4 max-w-[40vw]">
                                            <span class="line-clamp-2 break-all">{agent.instruction}</span>
                                        </td>
                                        <td class="px-6 py-4 max-w-[30vw]">
                                            <div class="flex flex-wrap gap-2">
                                                <For each={agent.objects || []}>
                                                    {(object) => (
                                                        <span class="px-2 py-1 bg-neu-800 text-neu-300 rounded-full text-xs">
                                                            {object}
                                                        </span>
                                                    )}
                                                </For>
                                            </div>
                                        </td>
                                        <Show when={authorized_as_admin()}>
                                            <td class="px-6 py-4">
                                                <div class="flex gap-2">

                                                    <MetricsButton agent={agent}>
                                                        Metrics
                                                    </MetricsButton>

                                                    <DeleteAgentButton agent={agent}>
                                                        Delete
                                                    </DeleteAgentButton>
                                                </div>
                                            </td>
                                        </Show>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>
        </Show>
    </LayoutContent>
}