export type ServerRegistrationMessage = {
    type: "i_am_server";
    version: string;
    token?: string;
}

export type ResourceRef = {
    __type: 'resource-ref',
    id: string,
}

export type WorkerType = 'motion_energy' | 'embedding' | 'llm' | 'vlm' | 'caption' | 'object_detection' | 'segmentation';
export type RemoteJob = {
    job_id: string,
    worker_type: WorkerType,
    // An object, where leaf values are either ResourceRef or primitive types
    // Example: { messages: [ { role: 'user', content: 'hello' }, { role: 'assistant', content: { __type: 'resource-ref' } } ] }
    input: Record<string, any>,
}

export type Resource = ({
    type: 'image',
    data: Uint8Array,
} | {
    type: 'document',
    content: string
}) & {
    id: string,
}

export type WorkerRequest = {
    type: "worker_request",
    resources?: Resource[],
    jobs: RemoteJob[]
}

export type WorkerResponse = {
    type: "worker_response",
    output: any,
    job_id: string,
}

export type EngineToServer = WorkerResponse

// ========================================
// Worker Input/Output Shapes
// ========================================

// Motion Energy Worker
export type WorkerInput__MotionEnergy = {
    media_id: string;
    current_frame: ResourceRef;
}

export type WorkerOutput__MotionEnergy = {
    id: string;
    motion_energy?: number;
    error?: string;
}

// Embedding Worker
export type WorkerInput__Embedding = ({
    text: string;
    prompt_name: 'query' | 'passage';
} | {
    filepath: ResourceRef;
})

export type WorkerOutput__Embedding = {
    id: string;
    embedding: number[]; // Vector of size 8192 (Jina model)
}

// LLM Worker
export type WorkerInput__Llm = {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
}

export type WorkerOutput__Llm = {
    id: string;
    response: string;
}

// VLM Worker (Vision Language Model)
export type WorkerInput__Vlm = {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: Array<
            | { type: 'text'; text: string }
            | { type: 'image'; image: ResourceRef }
        >;
    }>;
}

export type WorkerOutput__Vlm = {
    id: string;
    response: string;
}

// Caption Worker (Moondream)
export type WorkerInput__Caption = {
    images: ResourceRef[];
    query?: string;
}

export type WorkerOutput__Caption = {
    id: string;
    response: string;
}

// Object Detection Worker
export type WorkerInput__ObjectDetection = {
    filepath: ResourceRef;
}

export type DetectionObject = {
    label: string;
    score: number;
    box: {
        x_min: number;
        y_min: number;
        x_max: number;
        y_max: number;
    };
}

export type WorkerOutput__ObjectDetection = {
    id: string;
    detections: Array<DetectionObject>;
}

// Segmentation Worker (SAM3)
export type WorkerInput__Segmentation = {
    cross_job_id: string; // Video stream identifier
    current_frame: ResourceRef;
    prompts?: string[]; // Text prompts for detection
    reset_session?: boolean;
}


export type WorkerOutput__Segmentation_Result = {
    frame_count: number;
    objects: number[]; // Object IDs
    scores: number[]; // Confidence scores
    boxes: number[][]; // Bounding boxes [x_min, y_min, x_max, y_max]
    masks: Array<{
        size: [number, number]; // [height, width]
        counts: string; // RLE-encoded mask
    }>;
}

export type WorkerOutput__Segmentation = ({
    id: string;
    cross_job_id: string;   
} & WorkerOutput__Segmentation_Result )| {
    id: string;
    cross_job_id: string;
    error: string;
}