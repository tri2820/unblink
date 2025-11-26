import { Dialog } from '@ark-ui/solid/dialog';
import { ArkDialog } from './ark/ArkDialog';
import { fetchAgents, setAgents } from './shared';
import { type Agent } from '~/shared';
import { toaster } from './ark/ArkToast';

export default function DeleteAgentButton(props: { agent: Agent, children: any }) {
    const handleDelete = async () => {
        toaster.promise(async () => {
            const response = await fetch(`/agents/${props.agent.id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                setAgents(prev => prev.filter(agent => agent.id !== props.agent.id));
            } else {
                throw new Error('Failed to delete agent');
            }
        }, {
            loading: {
                title: 'Deleting...',
                description: `Deleting agent "${props.agent.name}".`,
            },
            success: {
                title: 'Success!',
                description: `Agent "${props.agent.name}" has been deleted.`,
            },
            error: {
                title: 'Failed',
                description: 'There was an error deleting the agent. Please try again.',
            },
        });
    };

    return <ArkDialog
        trigger={(_, setOpen) => <button
            onClick={() => setOpen(true)}
            class="btn-primary">
            {props.children}
        </button>}
        title="Delete agent"
        description={`Are you sure you want to delete "${props.agent.name}"? This action cannot be undone.`}
    >
        <div class="flex justify-end pt-4">
            <Dialog.CloseTrigger>
                <button
                    onClick={handleDelete}
                    class="btn-danger">
                    Delete Agent
                </button>
            </Dialog.CloseTrigger>
        </div>
    </ArkDialog>;
}