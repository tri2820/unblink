import type { ObjectDetectionMessage } from ".";

// Webhook Contract
export type WebhookMessage = ({
    event: 'description',
    media_id: string;
    media_unit_id: string;
    description: string;
} | ObjectDetectionMessage) & {
    created_at: string;
}