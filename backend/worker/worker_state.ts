export type StreamMomentState = {
    should_write_moment: boolean;
    current_moment_id?: string;
    delete_on_close?: boolean;
}

export type WorkerState = {
    streams: Map<string, StreamMomentState>;
}
