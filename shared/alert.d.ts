// Webhook Contract
export type WebhookMessage = {
    event: 'description',
    data: {
        created_at: string;
        media_id: string;
        frame_id: string;
        description: string;
    }
} | {
    type: 'object_detection';
    data: {
        created_at: string;
        media_id: string;
        frame_id: string;
        objects: DetectionObject[];
    }
}