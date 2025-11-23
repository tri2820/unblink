import fs from "fs/promises";
import type { WorkerState } from "~/backend/worker/worker_state";
import type { AVPixelFormat, AVSampleFormat, Frame, Packet, Stream } from "node-av";
import {
    AV_CODEC_ID_AAC,
    AV_CODEC_ID_MJPEG,
    AV_PIX_FMT_BGR24,
    AV_PIX_FMT_BGR4,
    AV_PIX_FMT_BGR4_BYTE,
    AV_PIX_FMT_BGR8,
    AV_PIX_FMT_GRAY8,
    AV_PIX_FMT_MONOBLACK,
    AV_PIX_FMT_MONOWHITE,
    AV_PIX_FMT_PAL8,
    AV_PIX_FMT_RGB24,
    AV_PIX_FMT_RGB4,
    AV_PIX_FMT_RGB4_BYTE,
    AV_PIX_FMT_RGB8,
    AV_PIX_FMT_UYVY422,
    AV_PIX_FMT_UYYVYY411,
    AV_PIX_FMT_YUV410P,
    AV_PIX_FMT_YUV411P,
    AV_PIX_FMT_YUV420P,
    AV_PIX_FMT_YUV422P,
    AV_PIX_FMT_YUV444P,
    AV_PIX_FMT_YUVJ420P,
    AV_PIX_FMT_YUVJ422P,
    AV_PIX_FMT_YUVJ444P,
    AV_PIX_FMT_YUYV422,
    AV_SAMPLE_FMT_FLTP,
    avGetCodecStringHls,
    avGetMimeTypeDash,
    Decoder,
    Encoder,
    FF_ENCODER_AAC,
    FF_ENCODER_MJPEG,
    FilterAPI,
    FilterPreset,
    MediaInput,
    MediaOutput,
} from "node-av";
import path from "path";
import { v4 as uuid } from 'uuid';
import { FRAMES_DIR, MOMENTS_DIR, RECORDINGS_DIR } from "~/backend/appdir";
import { logger as _logger } from "~/backend/logger";
import type { StreamMessage } from "~/shared";

const logger = _logger.child({ worker: 'stream' });
const MAX_SIZE = 720;

function getCodecs(
    width: number,
    height: number,
    videoStream: Stream,
    audioStream: Stream | undefined,
): StreamMessage {
    const videoCodecString = avGetCodecStringHls(videoStream.codecpar);
    const audioCodecString = audioStream
        ? avGetCodecStringHls(audioStream.codecpar)
        : null;

    const codecStrings = audioCodecString
        ? `${videoCodecString},${audioCodecString}`
        : videoCodecString;

    const mimeType = avGetMimeTypeDash(videoStream.codecpar);
    const fullCodec = `${mimeType}; codecs="${codecStrings}"`;

    const codecs: StreamMessage = {
        type: "codec",
        mimeType,
        videoCodec: videoCodecString,
        audioCodec: audioCodecString,
        codecString: codecStrings,
        fullCodec,
        width,
        height,
        hasAudio: !!audioStream,
    };

    return codecs;
}

async function raceWithTimeout<T>(
    promise: Promise<IteratorResult<T, any>>,
    abortSignal: AbortSignal,
    ms: number
): Promise<IteratorResult<T, any> | undefined> {
    let timeoutId: NodeJS.Timeout | undefined = undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            logger.warn('Timeout receiving packets');
            reject(new Error('Timeout receiving packets'));
        }, ms);
    });

    const abort_promise = new Promise<never>((_, reject) => {
        if (abortSignal.aborted) {
            return reject(new DOMException('Aborted', 'AbortError'));
        }
        abortSignal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
    });

    try {
        const result = await Promise.race([promise, timeoutPromise, abort_promise]);
        return result as IteratorResult<T, any>;
    } finally {
        clearTimeout(timeoutId);
    }
}

function shouldSkipTranscode(videoStream: Stream): boolean {
    const SUPPORTED_FORMATS: (AVPixelFormat | AVSampleFormat)[] = [
        AV_PIX_FMT_YUV420P,
        AV_PIX_FMT_YUYV422,
        AV_PIX_FMT_RGB24,
        AV_PIX_FMT_BGR24,
        AV_PIX_FMT_YUV422P,
        AV_PIX_FMT_YUV444P,
        AV_PIX_FMT_YUV410P,
        AV_PIX_FMT_YUV411P,
        AV_PIX_FMT_GRAY8,
        AV_PIX_FMT_MONOWHITE,
        AV_PIX_FMT_MONOBLACK,
        AV_PIX_FMT_PAL8,
        AV_PIX_FMT_YUVJ420P,
        AV_PIX_FMT_YUVJ422P,
        AV_PIX_FMT_YUVJ444P,
        AV_PIX_FMT_UYVY422,
        AV_PIX_FMT_UYYVYY411,
        AV_PIX_FMT_BGR8,
        AV_PIX_FMT_BGR4,
        AV_PIX_FMT_BGR4_BYTE,
        AV_PIX_FMT_RGB8,
        AV_PIX_FMT_RGB4,
        AV_PIX_FMT_RGB4_BYTE
    ];

    const isMjpeg = videoStream.codecpar.codecId === AV_CODEC_ID_MJPEG;
    const hasCompatibleFormat = SUPPORTED_FORMATS.includes(videoStream.codecpar.format);

    return isMjpeg && hasCompatibleFormat;
}

type OutputFileObject = {
    output_id: string;
    from: Date;
    mediaOutput: MediaOutput;
    videoFileOutputIndex: number;
    path: string;
};

class OutputFile {
    static async create(mediaId: string, output_id: string, videoEncoder: Encoder, output_type_dir: string): Promise<OutputFileObject> {
        const from = new Date();
        const dir = path.join(output_type_dir, mediaId);
        await fs.mkdir(dir, { recursive: true });
        const filePath = path.join(dir, `${mediaId}_from_${from.getTime()}_ms.mkv`);

        const mediaOutput = await MediaOutput.open(filePath, {
            format: 'matroska',
        });

        // Manually add stream to bypass addStream's check on initialized encoders
        const stream = mediaOutput.getFormatContext().newStream(null);
        if (!stream) {
            throw new Error("Failed to create output stream");
        }

        const codecContext = videoEncoder.getCodecContext();
        if (!codecContext) {
            throw new Error("Encoder codec context not available");
        }

        // Copy codec parameters
        stream.codecpar.fromContext(codecContext);
        stream.timeBase = codecContext.timeBase;

        // Write header immediately
        await mediaOutput.getFormatContext().writeHeader();

        return { output_id, from, mediaOutput, videoFileOutputIndex: stream.index, path: filePath };
    }

    static async close(obj: OutputFileObject): Promise<string> {
        // Manually write trailer since we bypassed MediaOutput's internal state
        await obj.mediaOutput.getFormatContext().writeTrailer();
        await obj.mediaOutput.close();

        // Rename to have closed_at timestamp
        const to = new Date();
        const newName = `${path.basename(obj.path).split('_')[1]}_from_${obj.from.getTime()}_ms_to_${to.getTime()}_ms.mkv`;
        const newPath = path.join(path.dirname(obj.path), newName);
        await fs.rename(obj.path, newPath);
        logger.info({ old: obj.path, new: newPath }, "Closed output file");
        return newPath;
    }

    static async discard(obj: OutputFileObject) {
        // Just close without writing trailer since we are deleting
        await obj.mediaOutput.close();
        try {
            await fs.unlink(obj.path);
            logger.info({ path: obj.path }, "Deleted false alarm moment file");
        } catch (error) {
            logger.error({ error, path: obj.path }, "Failed to delete false alarm moment file");
        }
    }
}



export type StartStreamArg = {
    id: string;
    uri: string;
    save_location?: string;
}

export async function streamMedia(
    stream: StartStreamArg,
    onMessage: (msg: StreamMessage) => void,
    signal: AbortSignal,
    state$: () => WorkerState
) {
    logger.info({ uri: stream.uri }, 'Starting streamMedia for');

    logger.info(`Opening media input: ${stream.uri}`);
    await using input = await MediaInput.open(stream.uri, {
        options: stream.uri.toLowerCase().startsWith("rtsp://")
            ? { rtsp_transport: "tcp" }
            : undefined,
    });

    const videoStream = input.video();
    if (!videoStream) {
        throw new Error("No video stream found");
    }

    logger.info(`Done opening media input`);

    let audioPipeline: {
        decoder: Decoder;
        encoder: Encoder;
        filter: FilterAPI;
    } | undefined = undefined;

    const audioStream = input.audio();
    if (audioStream && audioStream.codecpar.codecId !== AV_CODEC_ID_AAC) {
        const decoder = await Decoder.create(audioStream);

        const targetSampleRate = 48000;
        const filterChain = FilterPreset.chain()
            .aformat(AV_SAMPLE_FMT_FLTP, targetSampleRate, "stereo")
            .asetnsamples(1024)
            .build();

        const filter = FilterAPI.create(filterChain, {
            timeBase: audioStream.timeBase,
        });

        const encoder = await Encoder.create(FF_ENCODER_AAC, {
            timeBase: { num: 1, den: targetSampleRate },
        });

        audioPipeline = { encoder, decoder, filter };
    }

    const videoDecoder = await Decoder.create(videoStream);

    const longer_side = Math.max(
        videoStream.codecpar.width,
        videoStream.codecpar.height,
    );

    let newWidth = videoStream.codecpar.width;
    let newHeight = videoStream.codecpar.height;
    if (longer_side > MAX_SIZE) {
        const scale = MAX_SIZE / longer_side;
        newWidth = Math.round(newWidth * scale);
        newHeight = Math.round(newHeight * scale);
    }

    logger.info({ newWidth, newHeight }, "Scaling video to:");

    const filterChain = FilterPreset.chain()
        .format(AV_PIX_FMT_YUVJ420P)
        .scale(newWidth, newHeight, {
            flags: "lanczos",
        })
        .build();
    const videoFilter = FilterAPI.create(filterChain, {
        timeBase: videoStream.timeBase,
    });

    logger.info({
        format: videoStream.codecpar.format,
        codecId: videoStream.codecpar.codecId,
    }, "Input video:");

    const skipTranscode = shouldSkipTranscode(videoStream);

    logger.info({
        skipTranscode,
        format: videoStream.codecpar.format,
        codecId: videoStream.codecpar.codecId,
        AV_CODEC_ID_MJPEG,
    }, "Transcode decision:");

    const codecItem = getCodecs(newWidth, newHeight, videoStream, audioStream);


    logger.info(codecItem, "Initialized stream codecs");
    onMessage(codecItem);

    using videoEncoder = await Encoder.create(FF_ENCODER_MJPEG, {
        timeBase: videoStream.timeBase,
        frameRate: videoStream.avgFrameRate,
        bitrate: '2M',
        options: {
            strict: 'experimental',
            flags: 'global_header',
        },
    });

    async function sendFrameMessage(packet: Packet) {
        if (!packet.data) return;
        const frame_msg: StreamMessage = {
            type: "frame",
            data: packet.data,
        };
        onMessage(frame_msg);
    }

    async function writeToOutputFile(packet: Packet, output: OutputFileObject) {
        // Write to file output
        using cloned = packet.clone();
        if (cloned) {
            cloned.streamIndex = output.videoFileOutputIndex;
            await output.mediaOutput.getFormatContext().interleavedWriteFrame(cloned);
        }
    }

    async function processPacket(packet: Packet, decodedFrame: Frame) {
        let filteredFrame: Frame | null = null;

        try {
            // Filter once
            if (videoFilter) {
                filteredFrame = await videoFilter.process(decodedFrame);
                if (!filteredFrame) return;
            }

            const frameToUse = filteredFrame || decodedFrame;

            // Send frame for streaming
            if (skipTranscode) {
                await sendFrameMessage(packet);
                // For skipTranscode, we still need to encode for object detection
                using encodedPacket = await videoEncoder.encode(frameToUse);
                if (encodedPacket?.data) {
                    // await saveFrameForObjectDetection(encodedPacket.data);
                    if (momentOutput) await writeToOutputFile(encodedPacket, momentOutput);
                }
            } else {
                // Encode once and reuse for both streaming and object detection
                using encodedPacket = await videoEncoder.encode(frameToUse);
                if (encodedPacket?.data) {
                    await sendFrameMessage(encodedPacket);
                    // await saveFrameForObjectDetection(encodedPacket.data);
                    // Write same packet to moment output if it exists
                    if (momentOutput) await writeToOutputFile(encodedPacket, momentOutput);
                }
            }
        } finally {
            // Always free the filtered frame
            filteredFrame?.free();
        }
    }

    const packets = input.packets();
    let last_send_time = 0;

    logger.info("Entering main streaming loop");

    let momentOutput: OutputFileObject | null = null;

    while (true) {
        const res = await raceWithTimeout(packets.next(), signal, 10000);

        if (!res || res.done) {
            logger.info("Stream ended or timed out");
            break;
        }

        const packet = res.value;

        // Handle moment-specific output
        const streamState = state$().streams.get(stream.id);
        if (streamState?.should_write_moment) {
            // Check if we need to create a new moment output (new moment started)
            const currentMomentId = streamState.current_moment_id || 'unknown';
            if (momentOutput === null || momentOutput.output_id !== currentMomentId) {
                // Close previous moment output if exists
                if (momentOutput) {
                    logger.info({ output_id: momentOutput.output_id }, "Closing previous moment output");
                    await OutputFile.close(momentOutput);
                }

                // Create new moment output with moment_id in path
                const momentId: string = currentMomentId;

                momentOutput = await OutputFile.create(stream.id, momentId, videoEncoder, stream.save_location || MOMENTS_DIR);
                logger.info({ path: momentOutput.path, output_id: momentId }, "Created new moment output file");
            }
        } else if (momentOutput !== null) {
            // should_write_moment is false - close the moment output
            const shouldDelete = streamState?.delete_on_close === true;
            const outputId = momentOutput.output_id;

            if (shouldDelete) {
                logger.info({ output_id: outputId }, "Moment was false alarm, closing and deleting output");
                await OutputFile.discard(momentOutput);
            } else {
                // Real moment - close, rename, and notify with final path
                const finalPath = await OutputFile.close(momentOutput);
                logger.info({ output_id: outputId, final_path: finalPath }, "Moment ended, closing and notifying with final path");

                // Send message to server with the final clip path
                if (outputId && outputId !== 'unknown') {
                    onMessage({
                        type: 'moment_clip_saved' as any,
                        media_id: stream.id,
                        moment_id: outputId,
                        clip_path: finalPath,
                    } as any);
                }
            }

            momentOutput = null;
        }

        if (packet.streamIndex === videoStream.index) {
            const decodedFrame = await videoDecoder.decode(packet);

            if (!decodedFrame) {
                packet.free();
                continue;
            }

            const now = Date.now();
            if (now - last_send_time < 1000 / 30) {
                packet.free();
                decodedFrame.free();
                continue;
            }
            last_send_time = now;

            try {
                await processPacket(packet, decodedFrame);
            } catch (error) {
                logger.error({ error: (error as Error).message }, "Error processing packet");
            } finally {
                packet.free();
                decodedFrame.free();
            }
        } else {
            packet.free();
        }
    }

    // Clean up moment output if still open
    if (momentOutput) {
        logger.info("Closing moment output at stream end");
        await OutputFile.close(momentOutput);
    }

    logger.info("Streaming loop ended");
}