import { createSignal, For, onMount } from 'solid-js';
import { ArkDialog } from './ark/ArkDialog';
import { type Agent } from '~/shared';

interface Metric {
    id: string;
    entailment: string;
    contradiction: string;
}

export default function MetricsButton(props: { agent: Agent, children: any }) {
    const [metrics, setMetrics] = createSignal<Metric[]>([]);
    const [loading, setLoading] = createSignal(false);

    const fetchMetrics = async () => {
        if (!props.agent || !props.agent.id) {
            console.error('Agent or agent ID is undefined');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`/agents/${props.agent.id}/metrics`);
            if (response.ok) {
                const data = await response.json();
                setMetrics(data);
            }
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
        } finally {
            setLoading(false);
        }
    };

    return <ArkDialog
        trigger={(_, setOpen) => <button
            onClick={() => {
                if (!props.agent || !props.agent.id) {
                    console.error('Cannot open metrics dialog: agent or agent ID is undefined', props.agent);
                    return;
                }
                setOpen(true);
                fetchMetrics();
            }}
            class="btn-primary">
            {props.children}
        </button>}
        title="Agent Metrics"
        description={`Metrics for agent "${props.agent?.name || 'Unknown'}" (uneditable)`}
    >
        <div class="max-h-96 overflow-y-auto">
            {loading() ? (
                <p class="text-neu-500">Loading metrics...</p>
            ) : metrics().length === 0 ? (
                <p class="text-neu-500">No metrics found</p>
            ) : (
                <div class="space-y-2">
                    <For each={metrics()}>
                        {(metric) => (
                            <div class="p-3 bg-neu-800 rounded-md border border-neu-700">
                                <p class="text-neu-200 text-sm">{metric.entailment}</p>
                            </div>
                        )}
                    </For>
                </div>
            )}
        </div>
    </ArkDialog>;
}