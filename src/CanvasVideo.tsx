import { createResizeObserver } from "@solid-primitives/resize-observer";
import { FaSolidSpinner } from "solid-icons/fa";
import { createEffect, createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js";
import { newMessage } from "./video/connection";
import type { ServerToClientMessage, Subscription, SegmentationMessage } from "~/shared";
import { subscription } from "./shared";

type SegmentationData = {
    objects: number[];
    scores: number[];
    boxes: number[][];
    masks: Array<{
        size: [number, number];
        counts: number[] | string;
    }>;
    classes: string[];
    labels?: string[];
};

class MjpegPlayer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private img: HTMLImageElement | null = null;
    private segmentationData: SegmentationData | null = null;
    private animationFrameId = 0;
    private isDestroyed = false;
    private sourceWidth = 0;
    private sourceHeight = 0;
    private onDrawingStateChange: (isDrawing: boolean) => void;
    public _showSegmentation = true;
    public cameraName: string | undefined;
    public rounded: boolean;
    private onTimestamp?: (timestamp: number) => void;
    
    // FPS tracking for segmentation
    private segmentationFrameCount = 0;
    private segmentationLastTime = performance.now();
    private renderFrameCount = 0;
    private renderLastTime = performance.now();
    
    // Cache rendered segmentation to avoid re-rendering every frame
    private cachedSegmentationCanvas: OffscreenCanvas | null = null;
    private lastSegmentationData: SegmentationData | null = null;
    private isProcessingSegmentation = false;
    
    // Object tracking for consistent IDs and colors across frames
    private objectIdMap = new Map<number, number>(); // detection index -> stable ID
    private nextObjectId = 0;
    private previousDetections: Array<{idx: number, box: number[], label: string, id: number}> = [];

    constructor(
        canvas: HTMLCanvasElement,
        onDrawingStateChange: (isDrawing: boolean) => void,
        rounded: boolean = false,
        onTimestamp?: (timestamp: number) => void
    ) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.onDrawingStateChange = onDrawingStateChange;
        this.rounded = rounded;
        this.onTimestamp = onTimestamp;
        this.startRenderLoop();
    }

    public handleMessage(message: ServerToClientMessage): void {
        if (this.isDestroyed) return;

        if (message.type === 'segmentation') {
            // Skip if already processing segmentation
            if (this.isProcessingSegmentation) {
                return;
            }
            
            this.segmentationData = {
                objects: message.objects,
                scores: message.scores,
                boxes: message.boxes,
                masks: message.masks,
                classes: message.classes,
                labels: message.labels,
            };
            
            // Track segmentation FPS
            this.segmentationFrameCount++;
            const now = performance.now();
            if (now - this.segmentationLastTime >= 2000) {
                const fps = (this.segmentationFrameCount / ((now - this.segmentationLastTime) / 1000)).toFixed(1);
                console.log(`Segmentation FPS: ${fps}`);
                this.segmentationFrameCount = 0;
                this.segmentationLastTime = now;
            }
            
            return;
        }

        if (message.type === 'codec') {
            this.sourceWidth = message.width;
            this.sourceHeight = message.height;
            return;
        }

        if (message.type === 'frame' && message.data) {
            const blob = new Blob([message.data as any], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);

            const img = new Image();
            img.onload = () => {
                if (this.img) {
                    URL.revokeObjectURL(this.img.src);
                }
                this.img = img;
                if (!this.sourceWidth || !this.sourceHeight) {
                    this.sourceWidth = img.naturalWidth;
                    this.sourceHeight = img.naturalHeight;
                }
                this.onDrawingStateChange(true);
            };
            img.src = url;

            if (message.timestamp !== undefined && this.onTimestamp) {
                this.onTimestamp(message.timestamp);
            }
        }
    }

    private render = (one_time: boolean = false) => {
        if (this.isDestroyed) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.img) {
            const geom = this.calculateRenderGeometry();

            const x = geom.offsetX;
            const y = geom.offsetY;
            const w = geom.renderWidth;
            const h = geom.renderHeight;

            this.ctx.save();

            if (this.rounded) {
                const r = 16;
                this.ctx.beginPath();
                this.ctx.moveTo(x + r, y);
                this.ctx.lineTo(x + w - r, y);
                this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                this.ctx.lineTo(x + w, y + h - r);
                this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                this.ctx.lineTo(x + r, y + h);
                this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                this.ctx.lineTo(x, y + r);
                this.ctx.quadraticCurveTo(x, y, x + r, y);
                this.ctx.closePath();
                this.ctx.clip();
            }

            this.ctx.drawImage(
                this.img,
                geom.offsetX,
                geom.offsetY,
                geom.renderWidth,
                geom.renderHeight
            );
            this.ctx.restore();

            if (this._showSegmentation) {
                this.drawSegmentation(geom);
            }

            this.drawCameraName(geom);
        }
        
        // Track render FPS
        if (!one_time) {
            this.renderFrameCount++;
            const now = performance.now();
            if (now - this.renderLastTime >= 2000) {
                const fps = (this.renderFrameCount / ((now - this.renderLastTime) / 1000)).toFixed(1);
                console.log(`Render FPS: ${fps}`);
                this.renderFrameCount = 0;
                this.renderLastTime = now;
            }
            this.animationFrameId = requestAnimationFrame(() => this.render());
        }

    }

    private calculateRenderGeometry() {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        const videoWidth = this.sourceWidth || this.img?.naturalWidth || 1;
        const videoHeight = this.sourceHeight || this.img?.naturalHeight || 1;

        const canvasAspect = canvasWidth / canvasHeight;
        const videoAspect = videoWidth / videoHeight;

        let renderWidth: number, renderHeight: number, offsetX: number, offsetY: number;

        if (canvasAspect > videoAspect) {
            renderHeight = canvasHeight;
            renderWidth = renderHeight * videoAspect;
            offsetX = (canvasWidth - renderWidth) / 2;
            offsetY = 0;
        } else {
            renderWidth = canvasWidth;
            renderHeight = renderWidth / videoAspect;
            offsetX = 0;
            offsetY = (canvasHeight - renderHeight) / 2;
        }

        return { renderWidth, renderHeight, offsetX, offsetY };
    }

    private calculateIoU(box1: number[], box2: number[]): number {
        // Calculate Intersection over Union for two bounding boxes
        // box format: [x_min, y_min, x_max, y_max]
        if (box1.length < 4 || box2.length < 4) return 0;
        
        const x1_min = box1[0]!, y1_min = box1[1]!, x1_max = box1[2]!, y1_max = box1[3]!;
        const x2_min = box2[0]!, y2_min = box2[1]!, x2_max = box2[2]!, y2_max = box2[3]!;
        
        // Calculate intersection
        const intersect_x_min = Math.max(x1_min, x2_min);
        const intersect_y_min = Math.max(y1_min, y2_min);
        const intersect_x_max = Math.min(x1_max, x2_max);
        const intersect_y_max = Math.min(y1_max, y2_max);
        
        if (intersect_x_max < intersect_x_min || intersect_y_max < intersect_y_min) {
            return 0; // No intersection
        }
        
        const intersect_area = (intersect_x_max - intersect_x_min) * (intersect_y_max - intersect_y_min);
        
        // Calculate union
        const box1_area = (x1_max - x1_min) * (y1_max - y1_min);
        const box2_area = (x2_max - x2_min) * (y2_max - y2_min);
        const union_area = box1_area + box2_area - intersect_area;
        
        return union_area > 0 ? intersect_area / union_area : 0;
    }

    private decodeMaskRLE(mask: { size: [number, number]; counts: number[] | string }): Uint8Array {
        const [height, width] = mask.size;
        const decoded = new Uint8Array(height * width);
        const counts = Array.isArray(mask.counts) ? mask.counts : JSON.parse(mask.counts);
        
        let pos = 0;
        // SAM3 RLE convention: alternates between 0 and 1, starting with 0
        // First run is for value 0 (background), second for value 1 (foreground), etc.
        let val = 0;
        
        for (let i = 0; i < counts.length; i++) {
            const count = counts[i];
            
            // Fill 'count' pixels with current value
            for (let j = 0; j < count; j++) {
                if (pos < decoded.length) {
                    decoded[pos++] = val;
                }
            }
            
            // Toggle value for next run
            val = 1 - val;  // Toggle between 0 and 1
        }
        
        return decoded;
    }

    private drawSegmentation(geom: { renderWidth: number; renderHeight: number; offsetX: number; offsetY: number }) {
        if (!this.segmentationData || this.segmentationData.objects.length === 0 || !this.sourceWidth || !this.sourceHeight) return;

        // Check if we need to re-render segmentation (only when data changes)
        if (this.segmentationData !== this.lastSegmentationData) {
            this.renderSegmentationToCache();
            this.lastSegmentationData = this.segmentationData;
        }
        
        // Draw cached segmentation if available
        if (this.cachedSegmentationCanvas) {
            this.ctx.save();
            this.ctx.drawImage(
                this.cachedSegmentationCanvas,
                0, 0, this.cachedSegmentationCanvas.width, this.cachedSegmentationCanvas.height,
                geom.offsetX, geom.offsetY, geom.renderWidth, geom.renderHeight
            );
            this.ctx.restore();
        }
    }
    
    private renderSegmentationToCache() {
        if (!this.segmentationData || this.segmentationData.objects.length === 0 || !this.sourceWidth || !this.sourceHeight) return;

        // Mark as processing
        this.isProcessingSegmentation = true;
        
        const videoWidth = this.sourceWidth;
        const videoHeight = this.sourceHeight;
        
        // Create cache canvas at video resolution
        this.cachedSegmentationCanvas = new OffscreenCanvas(videoWidth, videoHeight);
        const cacheCtx = this.cachedSegmentationCanvas.getContext('2d')!;
        
        // Ensure proper alpha blending
        cacheCtx.globalCompositeOperation = 'source-over';

        // Define colors for different objects (pre-parsed RGB values)
        const colors = [
            { rgba: 'rgba(255, 0, 0, 0.4)', rgb: [255, 0, 0], stroke: 'rgba(255, 0, 0, 1)' },
            { rgba: 'rgba(0, 255, 0, 0.4)', rgb: [0, 255, 0], stroke: 'rgba(0, 255, 0, 1)' },
            { rgba: 'rgba(0, 0, 255, 0.4)', rgb: [0, 0, 255], stroke: 'rgba(0, 0, 255, 1)' },
            { rgba: 'rgba(255, 255, 0, 0.4)', rgb: [255, 255, 0], stroke: 'rgba(255, 255, 0, 1)' },
            { rgba: 'rgba(255, 0, 255, 0.4)', rgb: [255, 0, 255], stroke: 'rgba(255, 0, 255, 1)' },
            { rgba: 'rgba(0, 255, 255, 0.4)', rgb: [0, 255, 255], stroke: 'rgba(0, 255, 255, 1)' },
        ];

        // Match current detections with previous ones to assign stable IDs
        const currentDetections: Array<{idx: number, box: number[], label: string, id: number}> = [];
        const usedPreviousIds = new Set<number>();
        
        this.segmentationData.masks.forEach((mask, idx) => {
            const box = this.segmentationData!.boxes[idx];
            const labels = this.segmentationData!.labels;
            const label = (labels && labels[idx]) || 'unknown';
            
            if (!box || box.length < 4) return;
            
            // Find best match from previous frame
            type PrevDetection = {idx: number, box: number[], label: string, id: number};
            let bestMatch: {detection: PrevDetection, iou: number} | null = null;
            
            for (const prevDetection of this.previousDetections) {
                // Skip if already matched or different class
                if (usedPreviousIds.has(prevDetection.id) || prevDetection.label !== label) continue;
                
                const iou = this.calculateIoU(box, prevDetection.box);
                if (iou > 0.3 && (!bestMatch || iou > bestMatch.iou)) {
                    bestMatch = { detection: prevDetection, iou };
                }
            }
            
            // Assign ID: use matched ID or create new one
            const assignedId = bestMatch ? bestMatch.detection.id : this.nextObjectId++;
            if (bestMatch) {
                usedPreviousIds.add(bestMatch.detection.id);
            }
            
            this.objectIdMap.set(idx, assignedId);
            currentDetections.push({ idx, box, label, id: assignedId });
        });
        
        // Update previous detections for next frame
        this.previousDetections = currentDetections;

        this.segmentationData.masks.forEach((mask, idx) => {
            const score = this.segmentationData!.scores[idx];
            const box = this.segmentationData!.boxes[idx];
            const stableId = this.objectIdMap.get(idx);
            
            if (stableId === undefined || score === undefined || !box || box.length < 4) return;
            
            // Decode RLE mask
            const decodedMask = this.decodeMaskRLE(mask);
            const [maskHeight, maskWidth] = mask.size;
            
            // Use bounding box from SAM3 directly
            const x_min = box[0] || 0;
            const y_min = box[1] || 0;
            const x_max = box[2] || 0;
            const y_max = box[3] || 0;
            
            // Calculate scale factors from mask to video resolution
            const maskScaleX = videoWidth / maskWidth;
            const maskScaleY = videoHeight / maskHeight;

            // Determine which value represents the object by sampling
            let sampleCount0 = 0;
            let sampleCount1 = 0;
            const sampleSize = Math.min(100, decodedMask.length);
            const step = Math.max(1, Math.floor(decodedMask.length / sampleSize));
            
            for (let i = 0; i < decodedMask.length; i += step) {
                const val = decodedMask[i];
                if (val !== undefined && val > 0) sampleCount1++;
                else sampleCount0++;
            }
            
            const useValueZero = sampleCount0 < sampleCount1;
            
            // OPTIMIZATION: Downsample mask for rendering (reduce detail)
            // Target: max 200x200 pixels for mask rendering
            const maxMaskDim = 200;
            const downsampleFactor = Math.max(1, Math.ceil(Math.max(maskWidth, maskHeight) / maxMaskDim));
            const downsampledWidth = Math.ceil(maskWidth / downsampleFactor);
            const downsampledHeight = Math.ceil(maskHeight / downsampleFactor);
            
            const color = colors[stableId % colors.length] ?? colors[0]!;
            const [r, g, b] = color.rgb;
            
            // Create downsampled mask ImageData
            const imageData = new ImageData(downsampledWidth, downsampledHeight);
            const data = imageData.data;
            
            // Downsample by taking every Nth pixel
            for (let y = 0; y < downsampledHeight; y++) {
                for (let x = 0; x < downsampledWidth; x++) {
                    const srcX = x * downsampleFactor;
                    const srcY = y * downsampleFactor;
                    const srcIdx = srcY * maskWidth + srcX;
                    
                    if (srcIdx < decodedMask.length) {
                        const maskVal = decodedMask[srcIdx];
                        const isObject = useValueZero ? (maskVal === 0) : (maskVal !== undefined && maskVal > 0);
                        
                        if (isObject) {
                            const dstIdx = (y * downsampledWidth + x) * 4;
                            data[dstIdx] = r!;
                            data[dstIdx + 1] = g!;
                            data[dstIdx + 2] = b!;
                            data[dstIdx + 3] = 102; // 0.4 * 255
                        }
                    }
                }
            }

            const maskCanvas = new OffscreenCanvas(downsampledWidth, downsampledHeight);
            const maskCtx = maskCanvas.getContext('2d')!;
            maskCtx.putImageData(imageData, 0, 0);

            // Draw the downsampled mask scaled to video resolution
            cacheCtx.drawImage(
                maskCanvas,
                0, 0, downsampledWidth, downsampledHeight,
                0, 0, videoWidth, videoHeight
            );

            // Draw bounding box using SAM3 box (scaled to video resolution)
            const scaledX = x_min * maskScaleX;
            const scaledY = y_min * maskScaleY;
            const scaledWidth = (x_max - x_min) * maskScaleX;
            const scaledHeight = (y_max - y_min) * maskScaleY;

            cacheCtx.strokeStyle = color.stroke;
            cacheCtx.lineWidth = 2;
            cacheCtx.strokeRect(
                Math.floor(scaledX),
                Math.floor(scaledY),
                Math.floor(scaledWidth),
                Math.floor(scaledHeight)
            );

            // Draw label - use per-object label from worker
            const labels = this.segmentationData!.labels;
            const className = (labels && labels[idx]) ? labels[idx] : `Object ${stableId}`;
            
            const text = `${className} (${(score * 100).toFixed(1)}%)`;
            cacheCtx.font = '14px Arial';
            cacheCtx.textBaseline = 'bottom';
            const textMetrics = cacheCtx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = 15;

            const labelY = scaledY > textHeight + 5
                ? scaledY
                : scaledY + scaledHeight + textHeight;

            cacheCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            cacheCtx.fillRect(
                Math.floor(scaledX),
                Math.floor(labelY - textHeight),
                Math.ceil(textWidth + 10),
                Math.ceil(textHeight + 2)
            );

            cacheCtx.fillStyle = '#FFFFFF';
            cacheCtx.fillText(text, scaledX + 5, labelY);
        });
        
        // Clear processing flag
        this.isProcessingSegmentation = false;
    }

    private drawCameraName(geom: { renderWidth: number; renderHeight: number; offsetX: number; offsetY: number }) {
        if (!this.cameraName) return;

        this.ctx.save();
        this.ctx.font = '16px Arial';
        this.ctx.textBaseline = 'bottom';
        this.ctx.textAlign = 'left';

        const padding = 10;
        const x = geom.offsetX + padding;
        const y = geom.offsetY + geom.renderHeight - padding;

        // Optional: Add a subtle shadow for better visibility
        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;

        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillText(this.cameraName, x, y);

        this.ctx.restore();
    }

    private startRenderLoop() {
        this.animationFrameId = requestAnimationFrame(() => this.render());
    }

    public updateCanvasSize(width: number, height: number) {
        if (this.isDestroyed) return;
        this.canvas.width = width;
        this.canvas.height = height;
    }

    public destroy() {
        this.isDestroyed = true;
        cancelAnimationFrame(this.animationFrameId);
        if (this.img) {
            URL.revokeObjectURL(this.img.src);
            this.img = null;
        }
        console.log("MjpegPlayer destroyed.");
    }

    set showSegmentation(value: boolean) {
        this._showSegmentation = value;
        // Draw immediately to reflect change
        this.render(true);
    }

    public setCameraName(name: string) {
        this.cameraName = name;
        this.render(true);
    }
}

export default function CanvasVideo(props: { id: string, showDetections: Accessor<boolean>, name?: Accessor<string | undefined>, rounded?: boolean, onTimestamp?: (timestamp: number) => void }) {
    const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement>();
    const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();
    const [isDrawing, setIsDrawing] = createSignal(false);

    let player: MjpegPlayer | null = null;

    createEffect(() => {
        const sd = props.showDetections();
        if (!player) return;
        player.showSegmentation = sd;
    });

    createEffect(() => {
        const name = props.name?.();
        if (player && name) {
            player.setCameraName(name);
        }
    });

    createEffect(() => {
        const canvas = canvasRef();
        if (canvas && !player) {
            player = new MjpegPlayer(canvas, setIsDrawing, props.rounded ?? false, props.onTimestamp);
            const name = props.name?.();
            if (name) {
                player.setCameraName(name);
            }
        }
    });

    createEffect(() => {
        const s = subscription();
        if (!s) return;

        const stream_sub = s.streams.find(stream => stream.id === props.id);
        if (!stream_sub) return;

        const ses_id = stream_sub.type === 'ephemeral' ? stream_sub.session_id : undefined;

        const message = newMessage();
        if (!message) return;
        const isCorrectStreamMessage = (message.type == 'frame' || message.type == 'codec') && message.id === props.id && message.session_id === ses_id;
        const isCorrectSegmentationMessage = message.type == 'segmentation' && message.media_id === props.id && message.session_id === ses_id;

        if (isCorrectStreamMessage || isCorrectSegmentationMessage) {
            player?.handleMessage(message);
        }
    });

    createEffect(() => {
        const container = containerRef();
        if (!container) return;
        createResizeObserver(container, ({ width, height }) => {
            if (width > 0 && height > 0) {
                player?.updateCanvasSize(width, height);
            }
        });
    });

    onMount(() => setIsDrawing(false));

    onCleanup(() => {
        player?.destroy();
        player = null;
    });

    return (
        <div ref={setContainerRef}
            style={{ position: "relative", width: "100%", height: "100%" }}
        >
            <canvas
                ref={setCanvasRef}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    display: "block"
                }}
            />
            <Show when={!isDrawing()}>
                <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    color: "white"
                }}>
                    <div class="animate-spin">
                        <FaSolidSpinner size={48} />
                    </div>
                </div>
            </Show>
        </div>
    );
}