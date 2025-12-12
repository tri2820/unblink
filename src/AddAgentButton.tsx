import { AiOutlineRobot } from 'solid-icons/ai';
import { Dialog } from '@ark-ui/solid/dialog';
import { ArkDialog } from './ark/ArkDialog';
import { createSignal, untrack } from 'solid-js';
import { toaster } from './ark/ArkToast';
import { fetchAgents, setTab, tab } from './shared';
import AgentPlusSVG from '~/assets/icons/AgentPlus.svg';

const AGENT_TEMPLATES = [
    {
        name: 'Jam Detector',
        instruction: 'Monitor production line to detect when products stop moving on the conveyor belt, indicating a jam or production downtime.',
    },
    {
        name: 'Bin Full Monitor',
        instruction: 'Monitor reject bins and finished goods bins to detect when they are nearly full or overflowing before overflow occurs.',
    },
    {
        name: 'Defect Detector',
        instruction: 'Detect quality issues by spotting obvious deformities, defects, or irregularities on products at inspection points.',
    },
];

export default function AddAgentButton() {
    const [name, setName] = createSignal('');
    const [instruction, setInstruction] = createSignal('');

    const applyTemplate = (template: typeof AGENT_TEMPLATES[0]) => {
        setName(template.name);
        setInstruction(template.instruction);
    };

    const handleSave = async () => {
        const _name = untrack(name).trim();
        const _instruction = untrack(instruction).trim();
        if (!_name || !_instruction) {
            return;
        }

        toaster.promise(async () => {
            setTab({ type: 'agents' }); // Redirect to agents tab
            const response = await fetch('/agents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: _name, instruction: _instruction }),
            });

            if (response.ok) {
                setName('');
                setInstruction('');
                await fetchAgents(); // Refetch agents after successful creation
            } else {
                throw new Error('Failed to create agent');
            }
        }, {
            loading: {
                title: 'Creating...',
                description: 'Your agent is being created.',
            },
            success: {
                title: 'Success!',
                description: 'Agent has been created successfully.',
            },
            error: {
                title: 'Failed',
                description: 'There was an error creating your agent. Please try again.',
            },
        })
    };

    return <ArkDialog
        trigger={(_, setOpen) => <button
            onClick={() => setOpen(true)}
            class="w-full btn-primary">
            <img src={AgentPlusSVG} class="w-6 h-6" style="filter: brightness(0) invert(1)" />
            <div>
                Create Agent
            </div>
        </button>}
        title="Create a new agent"
        description="Enter the details for your new agent."
    >
        <div class="mt-4 space-y-4">
            <div>
                <label class="text-sm font-medium text-neu-300 block mb-2">Templates</label>
                <div class="flex gap-2">
                    {AGENT_TEMPLATES.map((template) => (
                        <button
                            onClick={() => applyTemplate(template)}
                            class="text-xs flex-1 px-3 py-2 rounded-lg bg-neu-850 border border-neu-750 text-neu-300 hover:bg-neu-800 hover:border-neu-700 transition-colors truncate"
                        >
                            {template.name}
                        </button>
                    ))}
                </div>
            </div>
            <div>
                <label for="agent-name" class="text-sm font-medium text-neu-300">Agent Name</label>
                <input
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder='Detector'
                    type="text" id="agent-name" class="px-4 py-2 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500" />
            </div>
            <div>
                <label for="agent-instruction" class="text-sm font-medium text-neu-300">Instruction</label>
                <textarea
                    value={instruction()}
                    onInput={(e) => setInstruction(e.currentTarget.value)}
                    placeholder='what happened in the video?'
                    id="agent-instruction" class="min-h-52 px-4 py-2 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500 resize-none" rows="3" />
            </div>
            <div class="flex justify-end pt-4">
                {/* There should be no asChild here */}
                <Dialog.CloseTrigger>
                    <button
                        onClick={handleSave}
                        class="btn-primary">
                        Create Agent
                    </button>
                </Dialog.CloseTrigger>
            </div>
        </div>
    </ArkDialog>
}