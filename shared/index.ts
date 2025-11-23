
import type { MediaUnit } from "./database";
import type { EngineToServer } from "./engine";

// Frame stats message - calculated on backend from frame_motion_energy
export type FrameStatsMessage = {
    type: "frame_stats";
    media_id: string;
    frame_id: string;
    motion_energy: number;
    sma10: number;
    sma100: number;
    timestamp: number; // Unix timestamp in milliseconds
}

// export type FrameMessage = {
//     type: "frame_file";
//     frame_id: string;
//     path: string;
// }

export type StreamMessage = {
    type: "codec";
    mimeType: string | null;
    videoCodec: string | null;
    audioCodec: string | null;
    codecString: string | null;
    fullCodec: string;
    width: number;
    height: number;
    hasAudio: boolean;
} | {
    type: 'frame';
    data: Uint8Array;
}
// | FrameMessage;


export type Subscription = {
    session_id: string;
    streams: {
        id: string;
    }[];
}

export type ClientToServerMessage = {
    type: 'set_subscription';
    subscription: Subscription | undefined | null;
}

export type WorkerToServerMessage =
    // WorkerObjectDetectionToServerMessage | 
    WorkerStreamToServerMessage
export type ServerToClientMessage = (WorkerToServerMessage | EngineToServer | FrameStatsMessage | {
    type: 'agent_card';
    media_unit: MediaUnit;
}) & {
    session_id?: string;
}

export type WorkerStreamToServerMessage = (StreamMessage & { media_id: string }) | {
    type: "error";
    media_id: string;
} | {
    type: "restarting";
    media_id: string;
} | {
    type: 'starting';
    media_id: string;
} | {
    type: 'moment_clip_saved';
    media_id: string;
    moment_id: string;
    clip_path: string;
}

export type ServerToWorkerStreamMessage_Add_Stream = {
    type: 'start_stream',
    media_id: string,
    uri: string,
    saveDir: string,
}
export type ServerToWorkerStreamMessage_Add_File = {
    type: 'start_stream_file',
    media_id: string,
    file_path: string,
}
export type ServerToWorkerStreamMessage = ServerToWorkerStreamMessage_Add_Stream | ServerToWorkerStreamMessage_Add_File | {
    type: 'stop_stream',
    media_id: string,
} | {
    type: 'set_moment_state',
    media_id: string,
    should_write_moment: boolean,
    current_moment_id?: string,
    delete_on_close?: boolean,
}

// export type ServerToWorkerObjectDetectionMessage = {
//     media_id: string;
//     file_name?: string;
// } & FrameMessage

// export type WorkerObjectDetectionToServerMessage = {
//     type: 'object_detection';
//     media_id: string;
//     frame_id: string;
//     file_name?: string;
//     objects: DetectionObject[];
// }



export type User = Pick<DbUser, 'id' | 'username' | 'role'>;
export type DbUser = {
    id: string;
    username: string;
    role: string;
    password_hash: string;
};

export type DbSession = {
    session_id: string;
    user_id: string;
    created_at: Date;
    expires_at: Date;
};

export type RESTQuery = {
    table: string;
    where?: {
        field: string;
        op: 'equals' | 'in' | 'is_not' | 'like';
        value: any;
    }[];
    select?: string[];
    limit?: number;
    order_by?: {
        field: string;
        direction: 'ASC' | 'DESC';
    };
}

export type ServerEphemeralState = {
    frame_stats_messages: FrameStatsMessage[];
    stream_stats_map: Map<string, {
        last10: number[];
        last100: number[];
        deviationState: {
            active: boolean;
            startTimestamp: number;
            startFrameId: string;
            frameIds: string[];
            peakDeviation: number;
            consecutiveAboveCount: number;
            consecutiveBelowCount: number;
        };
    }>;
    active_moments: Set<string>;
    moment_frames: Map<string, { id: string, at_time: number, data: Uint8Array }[]>;
};