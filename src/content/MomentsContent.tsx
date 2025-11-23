import { createResource, For, Show } from "solid-js";
import { FiImage } from "solid-icons/fi";
import LayoutContent from "./LayoutContent";
import type { Moment } from "../../shared/database";

type MomentWithThumbnail = Moment;

const fetchMoments = async (): Promise<MomentWithThumbnail[]> => {
    const response = await fetch("/moments");
    if (!response.ok) {
        throw new Error("Failed to fetch moments");
    }
    return response.json();
};

export default function MomentsContent() {
    const [moments] = createResource(fetchMoments);

    return (
        <LayoutContent title="Moments">
            <div class="h-full p-6 overflow-y-auto">
                <Show when={!moments.loading} fallback={<div class="text-neu-400">Loading moments...</div>}>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        <For each={moments()}>
                            {(moment) => (
                                <div class="moment-card">
                                    <div class="aspect-video bg-neu-900 relative">
                                        <Show when={moment.thumbnail_path} fallback={<div class="absolute inset-0 flex items-center justify-center text-neu-600">No Preview</div>}>
                                            <img
                                                src={`/moments/${moment.id}/thumbnail`}
                                                alt={moment.title || "Moment"}
                                                class="w-full h-full object-cover"
                                            />
                                        </Show>

                                    </div>
                                    <div class="p-4">
                                        <h3 class="text-lg font-semibold text-neu-100 mb-1 truncate">
                                            {moment.title || "Untitled Moment"}
                                        </h3>
                                        <p class="text-sm text-neu-400 line-clamp-2">
                                            {moment.short_description || "No description available"}
                                        </p>
                                        <div class="mt-3 flex items-center justify-between text-xs text-neu-500">
                                            <span>{new Date(moment.start_time).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </For>
                    </div>
                    <Show when={moments()?.length === 0}>
                        <div class="h-full flex items-center justify-center text-neu-500">
                            <div>
                                <FiImage class="mb-4 w-12 h-12" />
                                <p>No moments found</p>
                                <p>Events detected in your streams will appear here</p>
                            </div>
                        </div>
                    </Show>
                </Show>
            </div>
        </LayoutContent>
    );
}