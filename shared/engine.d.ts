export type ServerRegistrationMessage = {
    type: "i_am_server";
    version: string;
    token?: string;
}

export type RemoteJob = {
    job_id: string,
    worker_type: 'caption' | 'embedding' | 'object_detection' | 'motion_energy',
    cross_job_id?: string,
    resources?: {
        id: string,
    }[]
}

export type WorkerRequest = {
    type: "worker_request",
    resources?: {
        id: string,
        type: 'image',
        data: Uint8Array,
    }[],
    jobs: RemoteJob[]
}

export type WorkerResponse = {
    type: "worker_response",
    output: any,
    job_id: string,
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

export type EngineToServer = WorkerResponse

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
}
export type Summary = {
    background: string;
    moments: Moment[],
}