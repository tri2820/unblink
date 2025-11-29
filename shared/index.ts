import type { MediaUnit, User } from "./database";
import type { RemoteJob, WorkerOutput__Segmentation, WorkerRequest } from "./engine";
export * from "./database";

// AgentCard - abstract construct from media units or agent responses
export type AgentCard = {
    id: string;
    content: string;
    media_id: string;
    media_unit_id?: string;
    at_time: number;
    agent_id?: string;
    agent_name?: string;
    type?: string;
}

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

export type SegmentationMessage = {
    type: 'segmentation';
    media_id: string;
    media_unit_id: string;
    frame_count: number;
    objects: number[]; // Instance IDs
    scores: number[];
    boxes: number[][];
    masks: Array<{
        size: [number, number];
        counts: number[] | string;
    }>;
    classes: string[]; // Available class names (e.g., ['person', 'vehicle', 'animal'])
    labels?: string[]; // Per-object labels (same length as objects array)
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
export type ServerToClientMessage = (WorkerToServerMessage | SegmentationMessage | FrameStatsMessage | (AgentCard & {
    type: 'agent_card';
})) & {
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



export type ClientUser = Pick<User, 'id' | 'username' | 'role'>;

export type RESTWhereField = {
    field: string;
    op: 'equals' | 'in' | 'is_not' | 'like' | 'gt' | 'lt' | 'gte' | 'lte' | 'json_extract';
    value: any;
    json_path?: string;
};

export type RESTSelect = {
    type?: 'select';
    table: string;
    joins?: {
        table: string;
        on: {
            left: string;
            right: string;
        };
    }[];
    where?: RESTWhereField[];
    select?: (string | {value: string, alias?: string})[];
    limit?: number;
    order_by?: {
        field: string;
        direction: 'ASC' | 'DESC';
    };
    expect?: { is: 'single', value_when_no_item?: any };
    cast?: Record<string, 'json' | 'embedding'>;
};

export type RESTInsert = {
    type: 'insert';
    table: string;
    values: Record<string, any> | Record<string, any>[];
    cast?: Record<string, 'json' | 'embedding'>;
};

export type RESTUpdate = {
    type: 'update';
    table: string;
    where: RESTWhereField[];
    values: Record<string, any>;
    cast?: Record<string, 'json' | 'embedding'>;
};

export type RESTDelete = {
    type: 'delete';
    table: string;
    where: RESTWhereField[];
    cast?: Record<string, 'json' | 'embedding'>;
};

export type RESTQuery = RESTSelect | RESTInsert | RESTUpdate | RESTDelete;

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