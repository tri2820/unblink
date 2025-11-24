
import type { MediaUnit } from "./database";
import type { DetectionObject, EngineToServer, WorkerRequest, WorkerResponse } from "./engine";

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
    timestamp?: number;
} | {
    type: 'moment_clip_saved';
    moment_id: string;
    clip_path: string;
} | {
    type: 'ended';
};

export type ObjectDetectionMessage = {
    type: 'object_detection';
    media_id: string;
    media_unit_id: string;
    detections: DetectionObject[];
}


export type Subscription = {
    streams: (({
        type?: undefined
        kind: 'media'
        id: string;
    } | {
        type: 'ephemeral',
        kind: 'moment',
        id: string,
        init_seek_sec?: number,
        session_id: string;
    }))[];
}

export type ClientToServerMessage = {
    type: 'set_subscription';
    subscription: Subscription | undefined | null;
}

export type WorkerToServerMessage =
    // WorkerObjectDetectionToServerMessage | 
    WorkerStreamToServerMessage
export type ServerToClientMessage = (WorkerToServerMessage | ObjectDetectionMessage | FrameStatsMessage | {
    type: 'agent_card';
    media_unit: MediaUnit;
}) & {
    session_id?: string;
}

export type WorkerStreamToServerMessage = (StreamMessage | {
    type: "error";
} | {
    type: "restarting";
} | {
    type: 'starting';
}) & PassThroughOpts

export type ServerToWorkerStreamMessage_Add_Stream = {
    type: 'start_stream';
    uri: string;
    save_location?: string;
    init_seek_sec?: number;
} & PassThroughOpts

export type ServerToWorkerStreamMessage_Stop_Stream = {
    type: 'stop_stream',
    id: string,
}
export type ServerToWorkerStreamMessage_Set_Moment_State = {
    type: 'set_moment_state',
    media_id: string,
    should_write_moment?: boolean,
    current_moment_id?: string,
    discard_previous_maybe_moment?: boolean,
}
export type PassThroughOpts = {
    id: string,
    session_id?: string,
    is_ephemeral?: boolean
}
export type ServerToWorkerStreamMessage =
    | ServerToWorkerStreamMessage_Add_Stream
    | ServerToWorkerStreamMessage_Stop_Stream
    | ServerToWorkerStreamMessage_Set_Moment_State



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
    remote_worker_jobs_cont: Map<string, (output: any) => void>
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
    current_moment_ids: Map<string, string>; // media_id -> moment_id for active moments
};
export type InMemWorkerRequest = Omit<WorkerRequest, 'jobs'> & {
    jobs: (Omit<WorkerRequest['jobs'][number], 'job_id'> & {
        cont: (output: any) => void;
    })[];
};

