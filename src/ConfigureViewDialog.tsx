import { Dialog } from "@ark-ui/solid";
import { createEffect, createSignal, type Accessor } from "solid-js";
import { ArkDialog } from "./ark/ArkDialog";
import ArkSwitch from "./ark/ArkSwitch";
import { FiSettings } from "solid-icons/fi";

interface ConfigureViewDialogProps {
    showDetections: Accessor<boolean>;
    showStatsBar: Accessor<boolean>;
    onSave: (settings: { showDetections: boolean; showStatsBar: boolean }) => void;
    disabled?: boolean;
}

export default function ConfigureViewDialog(props: ConfigureViewDialogProps) {
    const [localShowDetections, setLocalShowDetections] = createSignal<boolean>(props.showDetections());
    const [localShowStatsBar, setLocalShowStatsBar] = createSignal<boolean>(props.showStatsBar());

    // Sync local state when prop changes (e.g. when dialog opens/re-renders if parent changes)
    createEffect(() => {
        const sd = props.showDetections();
        setLocalShowDetections(sd);
    });

    createEffect(() => {
        const ssb = props.showStatsBar();
        setLocalShowStatsBar(ssb);
    });

    const handleSave = (setOpen: (open: boolean) => void) => {
        props.onSave({ showDetections: localShowDetections(), showStatsBar: localShowStatsBar() });
        setOpen(false);
    };

    return (
        <ArkDialog
            trigger={(_, setOpen) => (
                <button onClick={() => setOpen(true)} class="btn-small">
                    <FiSettings class="w-4 h-4" />
                    <div>Configure View</div>
                </button>
            )}
            title="Configure View"
            description="Customize your visual experience. Focus on what matters."
        >
            {(setOpen) => (
                <div
                    data-disabled={props.disabled}
                    class="mt-4 space-y-4 data-[disabled=true]:opacity-50 data-[disabled=true]:pointer-events-none"
                >
                    <ArkSwitch
                        label="Show Detection Masks"
                        checked={localShowDetections}
                        onCheckedChange={(e) => setLocalShowDetections(e.checked)}
                    />

                    <ArkSwitch
                        label="Show Stats Bar"
                        checked={localShowStatsBar}
                        onCheckedChange={(e) => setLocalShowStatsBar(e.checked)}
                    />

                    <div class="flex justify-end pt-4">
                        <button
                            onClick={() => handleSave(setOpen)}
                            class="btn-primary"
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}
        </ArkDialog>
    );
}
