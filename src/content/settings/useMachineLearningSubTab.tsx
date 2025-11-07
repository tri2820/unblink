import type { Accessor, Setter } from "solid-js";
import type { UseSubTab } from "../SettingsContent";
import ArkSwitch from "~/src/ark/ArkSwitch";

export const useMachineLearningSubTab: UseSubTab = (props) => {
    return {
        comp: () => <div>
            <div class="bg-neu-850 border border-neu-800 rounded-lg p-6">
                <div class="flex items-center justify-between">
                    <ArkSwitch
                        checked={() => props.scratchpad()['object_detection_enabled'] === 'true'}
                        onCheckedChange={(details) => props.setScratchpad((prev) => ({
                            ...prev,
                            object_detection_enabled: details.checked ? 'true' : 'false'
                        }))}
                        label="Enable Object Detection"
                    />
                </div>
            </div>
        </div>,
        keys: () => [{
            name: 'object_detection_enabled',
            validate: (value) => {
                if (value !== 'true' && value !== 'false') {
                    return {
                        type: 'error',
                        message: 'Value must be true or false'
                    };
                }
                return {
                    type: 'success',
                };
            }
        }]
    }
}

