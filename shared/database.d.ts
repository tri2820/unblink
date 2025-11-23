
// Type definitions
export interface Media {
    id: string;
    name: string;
    uri: string;
    labels: string[];
    updated_at: number;
    saveToDisk?: number | null;
    saveDir?: string | null;
}

export interface Setting {
    key: string;
    value: string;
}

export interface MediaUnit {
    id: string;
    media_id: string;
    at_time: number;
    description?: string | null;
    embedding?: Uint8Array | null; // Stored as BLOB
    path: string;
    type: string;
}

export interface Secret {
    key: string;
    value: string;
}

export interface Session {
    session_id: string;
    user_id: string;
    created_at: number;
    expires_at: number;
}

export interface User {
    id: string;
    username: string;
    password_hash: string;
    role: string;
}

export interface Moment {
    id: string;
    media_id: string;
    start_time: number;
    end_time: number;
    peak_deviation?: number | null;
    type?: string | null;
    title?: string | null;
    short_description?: string | null;
    long_description?: string | null;
    clip_path?: string | null;
    thumbnail_path?: string | null;
}
