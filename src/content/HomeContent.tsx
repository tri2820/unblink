import { format } from 'date-fns';
import { For, onMount, Show } from 'solid-js';
import { FiCamera, FiMonitor } from 'solid-icons/fi';
import DeleteCameraButton from '~/src/DeleteCameraButton';
import EditCameraButton from '~/src/EditCameraButton';
import { authorized_as_admin, cameras, camerasLoading, fetchCameras } from '~/src/shared';
import LayoutContent from "./LayoutContent";

export default function HomeContent() {
    onMount(fetchCameras);

    return <LayoutContent title="Home">
        <Show when={!camerasLoading()} fallback={
            <div class="h-full flex items-center justify-center">
                <div class="text-neu-500">Loading cameras...</div>
            </div>
        }>
            <Show when={cameras().length > 0} fallback={
                <div class="h-full flex items-center justify-center text-neu-500">
                    <div>
                        <FiCamera class="mb-4 w-12 h-12" />
                        <p>No cameras found</p>
                        <p>Add one to get started</p>
                    </div>
                </div>
            }>
                <div class="relative overflow-x-auto h-full">
                    <table class="w-full text-sm text-left text-neu-400">
                        <thead class="text-neu-400 font-normal">
                            <tr class="">
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Camera Name
                                </th>
                                <th scope="col" class="px-6 py-3 font-medium">
                                    URI
                                </th>
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Labels
                                </th>
                                <th scope="col" class="px-6 py-3 font-medium">
                                    Updated At
                                </th>
                                <Show when={authorized_as_admin()}>
                                    <th scope="col" class="px-6 py-3 font-medium">
                                        Actions
                                    </th>
                                </Show>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={cameras()}>
                                {(camera) => (
                                    <tr class="border-b bg-neu-900 border-neu-800">
                                        <td class="px-6 py-4 font-medium text-white">
                                            {camera.name}
                                        </td>
                                        <td class="px-6 py-4 max-w-[20vw]">
                                            <span class="line-clamp-1 break-all">{camera.uri}</span>
                                        </td>
                                        <td class="px-6 py-4">
                                            <div class="flex flex-wrap gap-1">
                                                <For each={camera.labels}>
                                                    {(label) => (
                                                        <span class="bg-neu-800 text-neu-300 text-xs font-medium px-2.5 py-0.5 rounded whitespace-nowrap">
                                                            {label}
                                                        </span>
                                                    )}
                                                </For>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            {format(camera.updated_at, 'PPpp')}
                                        </td>
                                        <Show when={authorized_as_admin()}>
                                            <td class="px-6 py-4">
                                                <div class="flex items-center gap-2">
                                                    <EditCameraButton camera={camera}>
                                                        Edit
                                                    </EditCameraButton>
                                                    <DeleteCameraButton camera={camera}>
                                                        Delete
                                                    </DeleteCameraButton>
                                                </div>
                                            </td>
                                        </Show>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </Show>
        </Show>
    </LayoutContent>
}