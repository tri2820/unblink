import { createSignal } from "solid-js";

export const [state, setState] = createSignal<{
    type: "idle" | "autocompleting";
    query?: string;
    autocomplete?: {
        items: { text: string }[];
    };
}>({
    type: "idle",
});