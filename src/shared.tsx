import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type { ClientToServerMessage, FrameStatsMessage, ServerToClientMessage, Subscription, ClientUser } from "~/shared";
import type { Conn } from "~/shared/Conn";
import type { MediaUnit, Agent } from "~/shared";

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

export const [agentCards, setAgentCards] = createSignal<MediaUnit[]>([]);
export const relevantAgentCards = () => {
    const viewedMedias = () => {
        const t = tab();
        return t.type === 'view' ? t.medias : [];
    }
    const cards = agentCards();
    // newest first
    const relevant_cards = cards.filter(c => viewedMedias().some(media => media.media_id === c.media_id)).toSorted((a, b) => new Date(b.at_time).getTime() - new Date(a.at_time).getTime());

    return relevant_cards;
}

export const [statsMessages, setStatsMessages] = createStore<Record<string, FrameStatsMessage[]>>({});