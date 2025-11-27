import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { ClientToServerMessage, FrameStatsMessage, ServerToClientMessage, Subscription, ClientUser, AgentCard } from "~/shared";
import type { Conn } from "~/shared/Conn";
import type { MediaUnit, Agent } from "~/shared";

export type { AgentCard };

export type Camera = {
    id: string;
    name: string;
    uri: string;
    labels: string[];
    updated_at: string;
    save_to_disk: boolean;
    save_location: string;
};

export type Tab = {
    type: 'home' | 'search' | 'moments' | 'agents' | 'settings';
} | {
    type: 'view';
    medias: {
        media_id: string;
    }[]
} | {
    type: 'search_result';
    query: string;
} | {
    type: 'moment_playback';
    moment_id: string;
}

export const [isAuthenticated, setIsAuthenticated] = createSignal(false);
export const [user, setUser] = createSignal<ClientUser>();
export const authorized_as_admin = () => {
    if (settings()['auth_enabled'] !== 'true') return true; // if auth screen is disabled, all users are admins  
    const u = user();
    return u && u.role === 'admin';
}

export const [tab, _setTab] = createSignal<Tab>({ type: 'home' });
const tab_history : Tab[] = [];
export const setTab = (t: Tab) => {
    console.log("Setting tab to:", t);
    _setTab(t);
    tab_history.push(t);
}
export const goBackTab = () => {
    if (tab_history.length <= 1) return;
    tab_history.pop();
    const previous_tab = tab_history.pop()!;
    console.log("Going back to tab:", previous_tab);
    setTab(previous_tab);
}
export const canGoBackTab = () => {
    return tab_history.length > 1;
}


export const [cameras, setCameras] = createSignal<Camera[]>([]);
export const [camerasLoading, setCamerasLoading] = createSignal(true);
export const [subscription, setSubscription] = createSignal<Subscription>();
export const [conn, setConn] = createSignal<Conn<ClientToServerMessage, ServerToClientMessage>>();
export const [settingsLoaded, setSettingsLoaded] = createSignal(false);
export const [settings, setSettings] = createSignal<Record<string, string>>({});
export const fetchSettings = async () => {
    try {
        const response = await fetch("/settings");
        const data = await response.json();
        const settingsMap: Record<string, string> = {};
        for (const setting of data) {
            settingsMap[setting.key] = setting.value;
        }

        console.log("Fetched settings:", settingsMap);
        setSettings(settingsMap);
        setSettingsLoaded(true);
    } catch (error) {
        console.error("Error fetching settings:", error);
    }
};
export const fetchCameras = async () => {
    setCamerasLoading(true);
    try {
        const response = await fetch('/media');
        if (response.ok) {
            const data = await response.json();
            setCameras(data);
        } else {
            console.error('Failed to fetch media');
            setCameras([]);
        }
    } catch (error) {
        console.error('Error fetching media:', error);
        setCameras([]);
    } finally {
        setCamerasLoading(false);
    }
};


export const [agents, setAgents] = createSignal<Agent[]>([]);
export const [agentsLoading, setAgentsLoading] = createSignal(true);
export const fetchAgents = async () => {
    setAgentsLoading(true);
    try {
        const response = await fetch('/agents');
        if (response.ok) {
            const data = await response.json();
            setAgents(data);
        } else {
            console.error('Failed to fetch agents');
            setAgents([]);
        }
    } catch (error) {
        console.error('Error fetching agents:', error);
        setAgents([]);
    } finally {
        setAgentsLoading(false);
    }
};

export const [agentCards, setAgentCards] = createSignal<AgentCard[]>([]);

export const fetchAgentCards = async (cameraId: string): Promise<AgentCard[]> => {
    const cards: AgentCard[] = [];

    // Fetch from media_units
    try {
        const mediaUnitsResp = await fetch('/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: {
                    table: 'media_units',
                    where: [{
                        'field': 'media_id', 'op': 'equals', 'value': cameraId,
                    }, {
                        'field': 'description', 'op': 'is_not', 'value': null
                    }],
                    select: ['id', 'media_id', 'at_time', 'description', 'path', 'type'],
                    limit: 5,
                    order_by: { field: 'at_time', direction: 'DESC' }
                },
            }),
        });

        if (mediaUnitsResp.ok) {
            const data = await mediaUnitsResp.json() as { media_units: MediaUnit[] };
            // Convert MediaUnits to AgentCards
            const mediaUnitCards: AgentCard[] = data.media_units.map(unit => ({
                id: unit.id,
                content: unit.description || '',
                media_id: unit.media_id,
                media_unit_id: unit.id,
                at_time: unit.at_time,
                path: unit.path,
                type: unit.type,
            }));
            cards.push(...mediaUnitCards);
        } else {
            console.error(`Failed to fetch media units for camera ${cameraId}`);
        }
    } catch (error) {
        console.error(`Error fetching media units for camera ${cameraId}:`, error);
    }

    // Fetch from agent_responses (need to join with media_units to get media_id)
    try {
        const agentResponsesResp = await fetch('/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: {
                    table: 'agent_responses',
                    joins: [{
                        table: 'media_units',
                        on: { left: 'media_unit_id', right: 'id' }
                    }, {
                        table: 'agents',
                        on: { left: 'agent_id', right: 'id' }
                    }],
                    where: [{
                        'field': 'media_units.media_id', 'op': 'equals', 'value': cameraId,
                    }],
                    select: ['agent_responses.id', 'agent_responses.content', 'agent_responses.created_at', 'agent_responses.media_unit_id', 'agent_responses.agent_id', 'media_units.media_id', 'media_units.at_time', 'media_units.path', 'media_units.type', 'agents.name as agent_name'],
                    limit: 5,
                    order_by: { field: 'agent_responses.created_at', direction: 'DESC' }
                },
            }),
        });

        if (agentResponsesResp.ok) {
            interface AgentResponseRow {
                id: string;
                content: string;
                created_at: number;
                media_unit_id: string;
                agent_id: string;
                media_id: string;
                at_time: number;
                path?: string;
                type?: string;
                agent_name: string;
            }
            
            const data = await agentResponsesResp.json() as { agent_responses: AgentResponseRow[] };
            // Convert AgentResponses to AgentCards
            const agentResponseCards: AgentCard[] = data.agent_responses.map((response) => ({
                id: response.id,
                content: response.content,
                media_id: response.media_id,
                media_unit_id: response.media_unit_id,
                at_time: response.at_time,
                agent_id: response.agent_id,
                agent_name: response.agent_name,
                path: response.path,
                type: response.type,
            }));
            cards.push(...agentResponseCards);
        } else {
            console.error(`Failed to fetch agent responses for camera ${cameraId}`);
        }
    } catch (error) {
        console.error(`Error fetching agent responses for camera ${cameraId}:`, error);
    }

    return cards;
};

export const viewedMedias = () => {
    const t = tab();
    return t.type === 'view' ? t.medias : [];
}

export const relevantAgentCards = () => {
    const cards = agentCards();
    // newest first
    const relevant_cards = cards.filter(c => viewedMedias().some(media => media.media_id === c.media_id)).toSorted((a, b) => b.at_time - a.at_time);

    return relevant_cards;
}

export const [statsMessages, setStatsMessages] = createStore<Record<string, FrameStatsMessage[]>>({});