import { createSignal, onMount } from "solid-js";
import LayoutContent from "./LayoutContent";
import ArkSwitch from "./ark/ArkSwitch";

export default function SettingsContent() {
    const [objectDetection, setObjectDetection] = createSignal(false);

    onMount(async () => {
        try {
            const response = await fetch("/settings");
            const data = await response.json();
            const setting = data.find((s: any) => s.key === 'object_detection_enabled');
            if (setting) {
                setObjectDetection(setting.value === 'true');
            }
        } catch (error) {
            console.error("Error fetching settings:", error);
        }
    });

    const handleObjectDetectionChange = (details: { checked: boolean }) => {
        setObjectDetection(details.checked);
    };

    const handleSaveSettings = async () => {
        try {
            await fetch("/settings", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ key: 'object_detection_enabled', value: objectDetection().toString() }),
            });
        } catch (error) {
            console.error("Error updating settings:", error);
        }
    };

    return <LayoutContent title="Settings">
        <div class="p-4">
            <div class="bg-neu-850 border border-neu-800 rounded-lg p-6">
                <div class="flex items-center justify-between">
                    <ArkSwitch
                        checked={objectDetection}
                        onCheckedChange={handleObjectDetectionChange}
                        label="Enable Object Detection"
                    />
                </div>
            </div>
            <div class="flex justify-end mt-4">
                <button
                    onClick={handleSaveSettings}
                    class="px-4 py-2 text-sm font-medium text-white bg-neu-800 rounded-lg hover:bg-neu-850 border border-neu-750 focus:outline-none">
                    Save Settings
                </button>
            </div>
        </div>
    </LayoutContent>
}