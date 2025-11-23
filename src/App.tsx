
import { createEffect, onMount, untrack, type ValidComponent } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { FrameStatsMessage, ServerEphemeralState } from '~/shared';
import ArkToast from './ark/ArkToast';
import Authed from './Authed';
import HomeContent from './content/HomeContent';
import MomentsContent from './content/MomentsContent';
import SearchContent from './content/SearchContent';
import SearchResultContent from './content/SearchResultContent';
import SettingsContent from './content/SettingsContent';
import { cameras, conn, fetchCameras, setAgentCards, setConn, setStatsMessages, subscription, tab, type Tab } from './shared';
import SideBar from './SideBar';
import { connectWebSocket, newMessage } from './video/connection';
import ViewContent from './ViewContent';

const MAX_MOTION_MESSAGES_LENGTH_EACH = 100;

export default function App() {

    onMount(async () => {
        // fetch server's global states
        try {
            const response = await fetch('/state');
            const data: ServerEphemeralState = await response.json();
            console.log('Fetched global state from server:', data);

            // Group messages by media_id
            const messagesByStream: Record<string, FrameStatsMessage[]> = {};
            for (const msg of data.frame_stats_messages) {
                if (!messagesByStream[msg.media_id]) {
                    messagesByStream[msg.media_id] = [];
                }
                messagesByStream[msg.media_id]!.push(msg);
            }

            // Keep only last 100 messages per stream
            for (const mediaId in messagesByStream) {
                messagesByStream[mediaId] = messagesByStream[mediaId]!.slice(-MAX_MOTION_MESSAGES_LENGTH_EACH);
            }

            setStatsMessages(messagesByStream);
            console.log('messagesByStream', messagesByStream)
        } catch (error) {
            console.error('Error fetching global state from server:', error);
        }
    })

    createEffect(() => {
        const m = newMessage();
        if (!m) return;

        if (m.type === 'frame_stats') {
            const mediaId = m.media_id;
            setStatsMessages(mediaId, (prev = []) => {
                const updated = [...prev, m];
                return updated.slice(-MAX_MOTION_MESSAGES_LENGTH_EACH);
            });
        }
    });

    onMount(() => {
        const conn = connectWebSocket();
        setConn(conn);
        fetchCameras();
    })

    createEffect(() => {
        const m = newMessage();
        if (!m) return;

        if (m.type === 'agent_card') {
            // console.log('Received description for stream', m.media_id, ':', m.description);
            setAgentCards(prev => {
                return [...prev, m.media_unit].slice(-200);
            });
        }
    })

    createEffect(() => {
        const c = conn();
        const _subscription = subscription();
        if (!c) return;
        c.send({ type: 'set_subscription', subscription: _subscription });

    })

    const components = (): Record<Tab['type'], ValidComponent> => {
        return {
            'home': HomeContent,
            'moments': MomentsContent,
            'view': ViewContent,
            'search': SearchContent,
            'search_result': SearchResultContent,
            'settings': SettingsContent,
        }

    }
    const component = () => components()[tab().type]

    return <Authed>
        <div class="h-screen flex items-start bg-neu-925 text-white space-x-2">
            <ArkToast />
            <SideBar />
            <div class="flex-1">
                <Dynamic component={component()} />
            </div>
        </div>
    </Authed>
}