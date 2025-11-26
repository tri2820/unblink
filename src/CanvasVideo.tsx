import { createResizeObserver } from "@solid-primitives/resize-observer";
import { FaSolidSpinner } from "solid-icons/fa";
import { createEffect, createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js";
import { newMessage } from "./video/connection";
import type { ServerToClientMessage, Subscription } from "~/shared";
import { subscription } from "./shared";
// import type { DetectionObject } from "~/shared/engine";

class MjpegPlayer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private img: HTMLImageElement | null = null;
    // private detectionObjects: DetectionObject[] = [];
    private animationFrameId = 0;
    private isDestroyed = false;
    private sourceWidth = 0;
    private sourceHeight = 0;
    private onDrawingStateChange: (isDrawing: boolean) => void;
    // public _showDetections = true;
    public cameraName: string | undefined;
    public rounded: boolean;
    private onTimestamp?: (timestamp: number) => void;

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

        // if (message.type === 'object_detection') {
        //     this.detectionObjects = message.detections;
        //     return;
        // }

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

            // if (this._showDetections) {
            //     this.drawDetections(geom);
            // }

            this.drawCameraName(geom);
        }

        if (!one_time) {
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

    // private drawDetections(geom: { renderWidth: number; renderHeight: number; offsetX: number; offsetY: number }) {
    //     if (this.detectionObjects.length === 0 || !this.sourceWidth || !this.sourceHeight) return;

    //     const videoWidth = this.sourceWidth;
    //     const videoHeight = this.sourceHeight;

    //     // IMPORTANT FIX: independent X/Y scaling
    //     const scaleX = geom.renderWidth / videoWidth;
    //     const scaleY = geom.renderHeight / videoHeight;

    //     this.ctx.save();
    //     this.ctx.strokeStyle = '#FF0000';
    //     this.ctx.lineWidth = 2;
    //     this.ctx.font = '14px Arial';
    //     this.ctx.textBaseline = 'bottom';

    //     this.detectionObjects.forEach(obj => {
    //         const { x_min, y_min, x_max, y_max } = obj.box;

    //         // Correct projection into rendered+letterboxed canvas
    //         const scaledX = geom.offsetX + x_min * scaleX;
    //         const scaledY = geom.offsetY + y_min * scaleY;
    //         const scaledWidth = (x_max - x_min) * scaleX;
    //         const scaledHeight = (y_max - y_min) * scaleY;
    //         // Draw the rectangle
    //         this.ctx.strokeRect(
    //             Math.floor(scaledX),
    //             Math.floor(scaledY),
    //             Math.floor(scaledWidth),
    //             Math.floor(scaledHeight)
    //         );

    //         // Label background & text
    //         const text = `${obj.label} (${(obj.score * 100).toFixed(1)}%)`;
    //         const textMetrics = this.ctx.measureText(text);
    //         const textWidth = textMetrics.width;
    //         const textHeight = 15;

    //         const labelY = scaledY > textHeight + 5
    //             ? scaledY
    //             : scaledY + scaledHeight + textHeight;

    //         this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    //         this.ctx.fillRect(
    //             Math.floor(scaledX),
    //             Math.floor(labelY - textHeight),
    //             Math.ceil(textWidth + 10),
    //             Math.ceil(textHeight + 2)
    //         );

    //         this.ctx.fillStyle = '#FFFFFF';
    //         this.ctx.fillText(text, scaledX + 5, labelY);
    //     });

    //     this.ctx.restore();
    // }

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

    // set showDetections(value: boolean) {
    //     this._showDetections = value;
    //     // Draw immediately to reflect change
    //     this.render(true);
    // }

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

    // createEffect(() => {
    //     const sd = props.showDetections();
    //     if (!player) return;
    //     player.showDetections = sd;
    // });

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
        // const isCorrectEngineMessage = message.type == 'object_detection' && message.media_id === props.id && message.session_id === ses_id;

        if (isCorrectStreamMessage /* || isCorrectEngineMessage */) {
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