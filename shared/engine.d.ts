export type ServerRegistrationMessage = {
    type: "i_am_server";
    version: string;
    token?: string;
}

export type ServerToEngine =
    | {
        type: "frame_binary";
        workers: {
            [worker_id: string]: true
        }
        frame_id: string;
        media_id: string;
        frame: Uint8Array;
    } | {
        type: "moment_enrichment",
        media_id: string;
        moment_id: string;
        media_units: {
            id: string;
            at_time: number;
            data: Uint8Array;
            type: 'frame'
        }[]
    }

export type DetectionObject = {
    label: string;
    confidence: number;
    box: {
        x_min: number;
        y_min: number;
        x_max: number;
        y_max: number;
    }
}

export type EngineToServer = {
    type: "frame_description";
    frame_id: string;
    media_id: string;
    description: string;
} | {
    type: "frame_embedding";
    frame_id: string;
    media_id: string;
    embedding: number[];
} | {
    type: "frame_object_detection";
    media_id: string;
    frame_id: string;
    objects: DetectionObject[];
} | {
    type: "moment_enrichment",
    media_id: string;
    moment_id: string;
    enrichment: {
        title: string;
        short_description: string;
        long_description: string;
    }
} | FrameMotionEnergyMessage

export type FrameMotionEnergyMessage = {
    type: "frame_motion_energy";
    media_id: string;
    frame_id: string;
    motion_energy: number;
}

export type Moment = {
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
}
export type Summary = {
    background: string;
    moments: Moment[],
}