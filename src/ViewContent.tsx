import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { RESTQuery, MediaUnit } from "~/shared";
import ActivityBar from "./ActivityBar";
import CanvasVideo from "./CanvasVideo";
import ConfigureViewDialog from "./ConfigureViewDialog";
import { cameras, setAgentCards, setSubscription, settings, tab } from "./shared";
import { useAgentBar } from "./AgentBar";

const GAP_SIZE = '8px';

const chunk = <T,>(arr: T[]): T[][] => {
    const n = arr.length;
    const size = n === 0 ? 1 : Math.ceil(Math.sqrt(n));
    if (size <= 0) {
        return arr.length ? [arr] : [];
    }
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
        arr.slice(i * size, i * size + size)
    );
}

export default function ViewContent() {
    const [showDetections, setShowDetections] = createSignal(true);


    const viewedMedias = () => {
        const t = tab();
        return t.type === 'view' ? t.medias : [];
    }


    // Handle subscriptions
    createEffect(() => {
        const medias = viewedMedias();
        if (medias && medias.length > 0) {
            console.log('Subscribing to streams:', medias);

            setSubscription({
                streams: medias.map(media => {
                    return { id: media.media_id, kind: 'media' as const }
                }),
            });
        } else {
            setSubscription();
        }
    });

    createEffect(async () => {
        // Get relevant media units for those streams
        const medias = viewedMedias();
        setAgentCards([]); // Clear agent cards when viewed medias change   
        if (!medias || medias.length === 0) {
            return;
        }

        console.log('Viewing medias changed, current medias:', medias);

        const resp = await fetch('/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: {
                    table: 'media_units',
                    where: [{
                        'field': 'media_id', 'op': 'in', 'value': medias.map(m => m.media_id),
                    }, {
                        'field': 'description', 'op': 'is_not', 'value': null
                    }],
                    select: ['id', 'media_id', 'at_time', 'description', 'path', 'type'],
                    limit: 20,
                    order_by: { field: 'at_time', direction: 'DESC' }
                } as RESTQuery,
            }),
        });

        if (resp.ok) {
            const data = await resp.json() as { media_units: MediaUnit[] };
            console.log('data.media_units', data.media_units.length)
            setAgentCards([...data.media_units]);

            console.log('Fetched media units for viewed medias:', data);
        } else {
            console.error('Failed to fetch media units for viewed medias');
        }
    })

    const cols = () => {

        const n = viewedMedias().length;
        return n === 0 ? 1 : Math.ceil(Math.sqrt(n));
    }

    const rowsOfMedias = () => chunk(viewedMedias());


    // Cleanup subscriptions on unmount
    onCleanup(() => {
        console.log('ViewContent unmounting, clearing subscriptions');
        setSubscription();
    });

    const agentBar = useAgentBar();


    return (
        <div class="flex items-start h-screen">
            <div class="flex-1 flex flex-col h-screen ">
                <div class="flex-1 mr-2 my-2">
                    <Show
                        when={rowsOfMedias().length > 0}
                        fallback={<div class="flex justify-center items-center h-full">No camera selected</div>}
                    >
                        <div class="h-full w-full flex flex-col space-y-2">
                            <div class="flex-none flex items-center space-x-2 py-2 px-4 bg-neu-900 rounded-2xl border border-neu-800 h-14">
                                <div class="flex-1 text-sm text-neu-400 line-clamp-1">Viewing {viewedMedias().length} streams</div>
                                <div>
                                    <ConfigureViewDialog
                                        disabled={settings()['object_detection_enabled'] !== 'true'}
                                        showDetections={showDetections}
                                        onSave={(s) => setShowDetections(s.showDetections)}
                                    />
                                </div>

                                <Show when={!agentBar.showAgentBar()}>
                                    <agentBar.Toggle />
                                </Show>
                            </div>
                            <div class="flex-1 flex flex-col" style={{ gap: GAP_SIZE }}>
                                <For each={rowsOfMedias()}>
                                    {(row, rowIndex) => (
                                        <div
                                            class="flex flex-1"
                                            style={{
                                                'justify-content': rowIndex() === rowsOfMedias().length - 1 && row.length < cols() ? 'center' : 'flex-start',
                                                gap: GAP_SIZE,
                                            }}
                                        >
                                            <For each={row}>
                                                {(media) => {
                                                    return <div style={{ width: `calc((100% - (${cols() - 1} * ${GAP_SIZE})) / ${cols()})`, height: '100%' }}>
                                                        <CanvasVideo
                                                            rounded
                                                            id={media.media_id}
                                                            showDetections={showDetections}
                                                            name={() => cameras().find(c => c.id === media.media_id)?.name}
                                                        />
                                                    </div>
                                                }}
                                            </For>
                                        </div>
                                    )}
                                </For>
                            </div>
                        </div>
                    </Show>
                </div>

                <ActivityBar viewedMedias={viewedMedias} cameras={cameras} />
            </div>

            <agentBar.Comp />
        </div>

    );
}