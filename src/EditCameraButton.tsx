import { Dialog } from '@ark-ui/solid/dialog';
import { ArkDialog } from './ark/ArkDialog';
import { createSignal, untrack, onMount, Show } from 'solid-js';
import { fetchCameras, type Camera } from './shared';
import { FiEdit } from 'solid-icons/fi';
import { Switch } from '@ark-ui/solid';
import ArkSwitch from './ark/ArkSwitch';
import { toaster } from './ark/ArkToast';


export default function EditCameraButton(props: { camera: Camera, children: any }) {
    const [name, setName] = createSignal('');
    const [uri, setUri] = createSignal('');
    const [labels, setLabels] = createSignal('');
    const [save_to_disk, setsave_to_disk] = createSignal(false);
    const [save_location, set_save_location] = createSignal('');

    onMount(() => {
        setName(props.camera.name);
        setUri(props.camera.uri);
        setLabels(props.camera.labels.join(', '));
        setsave_to_disk(props.camera.save_to_disk || false);
        set_save_location(props.camera.save_location || '');
    });

    const handleSave = async () => {
        const _name = untrack(name).trim();
        const _uri = untrack(uri).trim();
        const _save_location = untrack(save_location).trim();
        const _save_to_disk = untrack(save_to_disk);
        if (!_name || !_uri) {
            return;
        }

        const labelsArray = labels().split(',').map(l => l.trim()).filter(l => l);

        toaster.promise(async () => {
            const response = await fetch(`/media/${props.camera.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: _name,
                    uri: _uri,
                    labels: labelsArray,
                    save_to_disk: _save_to_disk,
                    save_location: _save_location,
                }),
            });

            if (response.ok) {
                fetchCameras();
            } else {
                throw new Error('Failed to save camera');
            }
        }, {
            loading: {
                title: 'Saving...',
                description: 'Your camera is being updated.',
            },
            success: {
                title: 'Success!',
                description: 'Camera has been updated successfully.',
            },
            error: {
                title: 'Failed',
                description: 'There was an error updating your camera. Please try again.',
            },
        });
    };

    return <ArkDialog
        trigger={(_, setOpen) => <button
            onClick={() => setOpen(true)}
            class="btn-primary">
            {props.children}
        </button>}
        title="Edit camera"
        description="Enter the details for your new camera."
    >
        <div class="mt-4 space-y-4">
            <div>
                <label for="camera-name" class="text-sm font-medium text-neu-300">Camera Name</label>
                <input
                    value={name()}
                    onInput={(e: Event & { currentTarget: HTMLInputElement }) => setName(e.currentTarget.value)}
                    placeholder='Front Gate'
                    type="text" id="camera-name" class="px-3 py-1.5 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500" />
            </div>
            <div>
                <label for="camera-url" class="text-sm font-medium text-neu-300">Camera URL</label>
                <input
                    value={uri()}
                    onInput={(e: Event & { currentTarget: HTMLInputElement }) => setUri(e.currentTarget.value)}
                    placeholder='rtsp://localhost:8554/cam'
                    type="text" id="camera-url" class="px-3 py-1.5 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500" />
            </div>
            <div>
                <label for="camera-labels" class="text-sm font-medium text-neu-300">Labels (comma-separated)</label>
                <input
                    value={labels()}
                    onInput={(e: Event & { currentTarget: HTMLInputElement }) => setLabels(e.currentTarget.value)}
                    placeholder='Outside, Security, Front Door'
                    type="text" id="camera-labels" class="px-3 py-1.5 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500" />
            </div>
            {/* <div class="flex items-center justify-between">
                <ArkSwitch
                    checked={save_to_disk}
                    onCheckedChange={(details) => setsave_to_disk(details.checked)}
                    label="Save to Disk"
                />
            </div> */}
            <div>
                <label for="save-dir" class="text-sm font-medium text-neu-300">Video Directory</label>
                <input
                    value={save_location()}
                    onInput={(e: Event & { currentTarget: HTMLInputElement }) => set_save_location(e.currentTarget.value)}
                    placeholder='/path/to/recordings'
                    type="text" id="save-dir" class="px-3 py-1.5 mt-1 block w-full rounded-lg bg-neu-850 border border-neu-750 text-white focus:outline-none placeholder:text-neu-500" />
            </div>
            <div class="flex justify-end pt-4">
                {/* There should be no asChild here */}
                <Dialog.CloseTrigger>
                    <button
                        onClick={handleSave}
                        class="btn-primary">
                        Save Camera
                    </button>
                </Dialog.CloseTrigger>
            </div>
        </div>
    </ArkDialog>
}