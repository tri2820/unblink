import { FaSolidArrowLeft } from "solid-icons/fa";
import { createEffect, createSignal, For, Show } from "solid-js";


import type { MediaUnit } from "~/shared";
import IslandRow from "./search/IslandRow";
import LoadingSkeleton from "./search/LoadingSkeleton";
import SearchBar from "./SearchBar";
import { tab } from "./shared";
import LayoutContent from "./LayoutContent";

export type Island = (MediaUnit & { _distance: number })[]

// State is updated to include a nullable summary field
type SearchState = {
    type: "idle"
} | {
    type: "searching"
    query: string,
} | {
    type: "error",
} | {
    type: "result",
    query: string,
    result: any;
}

export default function SearchResultContent() {
    const [searchState, setSearchState] = createSignal<SearchState>({
        type: "idle",
    });

    const q = () => {
        const t = tab();
        if (t.type === "search_result") {
            return t.query;
        }
        return null;
    }
    createEffect(async () => {
        const query = q();
        if (!query) return;

        setSearchState({ type: "searching", query });
        try {
            // Generate the embedding for the query
            const response = await fetch(`/api/worker/fast_embedding`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query }),
            });

            if (!response.ok || !response.body) {
                throw new Error("Search request failed");
            }

            const data = await response.json();
            console.log("Embedding results:", data);

        } catch (error) {
            console.error("Failed to fetch search results:", error);
            setSearchState({ type: "error" });
        }
    });


    return <LayoutContent
        title="Search Results"
    >

    </LayoutContent>
}