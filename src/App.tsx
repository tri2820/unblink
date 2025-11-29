
import { createEffect, onMount, untrack, type ValidComponent } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { FrameStatsMessage, RESTQuery, MediaUnit } from '~/shared';
import ArkToast from './ark/ArkToast';
import Authed from './Authed';
import HomeContent from './content/HomeContent';
import MomentsContent from './content/MomentsContent';
import MomentPlaybackContent from './content/MomentPlaybackContent';
import SearchContent from './content/SearchContent';
import SearchResultContent from './content/SearchResultContent';
import SettingsContent from './content/SettingsContent';
import AgentsContent from './content/AgentsContent';
import { cameras, conn, fetchCameras, fetchAgentCards, setAgentCards, setConn, setStatsMessages, subscription, tab, viewedMedias, type Tab } from './shared';
import SideBar from './SideBar';
import { connectWebSocket, newMessage } from './video/connection';
import ViewContent from './ViewContent';

const MAX_MOTION_MESSAGES_LENGTH_EACH = 100;

export default function App() {

    onMount(async () => {
        // fetch server's global states
        try {
            const response = await fetch('/frame-stats');
            const data: FrameStatsMessage[] = await response.json();
            console.log('Fetched frame stats messages from server:', data);

            // Group messages by media_id
            const messagesByStream: Record<string, FrameStatsMessage[]> = {};
            for (const msg of data) {
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
            console.error('Error fetching frame stats messages from server:', error);
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
            // Message already has the AgentCard structure
            const { type, ...agentCard } = m;
            setAgentCards(prev => {
                return [...prev, agentCard].slice(-200);
            });
        }
    })

    createEffect(() => {
        const c = conn();
        const _subscription = subscription();
        if (!c) return;
        c.send({ type: 'set_subscription', subscription: _subscription });

    })

    // Fetch agent cards for all medias (5 for each from media_units and agent_responses)
    createEffect(async () => {
        const allCameras = cameras();
        if (!allCameras || allCameras.length === 0) {
            return;
        }

        console.log('Fetching agent cards for all medias:', allCameras);

        const fetchPromises = allCameras.map(camera => fetchAgentCards(camera.id));
        const results = await Promise.all(fetchPromises);
        const allAgentCards = results.flat();
        
        console.log('Fetched agent cards for all cameras:', allAgentCards.length);
        setAgentCards(allAgentCards);
    })

    const components = (): Record<Tab['type'], ValidComponent> => {
        return {
            'home': HomeContent,
            'moments': MomentsContent,
            'moment_playback': MomentPlaybackContent,
            'view': ViewContent,
            'search': SearchContent,
            'search_result': SearchResultContent,
            'settings': SettingsContent,
            'agents': AgentsContent,
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