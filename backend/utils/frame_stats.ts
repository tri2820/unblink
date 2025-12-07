/**
 * Utility for calculating and caching frame statistics with deviation-based moment detection
 */

// Moment detection configuration
export const MOMENT_CONFIG = {
    // Standard deviation detection
    MIN_DEVIATION_RATIO: 0.3,        // 30% relative change from sma100
    MIN_DURATION_MS: 10000,          // 10 seconds minimum for sustained events

    // Instant event detection (lightning, explosions)
    INSTANT_EVENT_DEVIATION: 5.0,    // 500% extreme deviation
    INSTANT_MIN_DURATION_MS: 1000,   // 1 second minimum for instant events

    // Stability
    STABILITY_BUFFER: 2,             // Consecutive frames before state change
    MIN_SMA100_THRESHOLD: 0.01,      // Prevents division by zero
} as const;

export type FrameStats = Record<string, { value: number; sma10: number; sma100: number }>;

export type MomentData = {
    media_id: string;
    start_timestamp: number;
    end_timestamp: number;
    start_frame_id: string;
    end_frame_id: string;
    frame_ids: string[];
    peak_deviation: number;
    duration_ms: number;
    type: 'standard' | 'instant';
};

export type MomentCallback = (moment: MomentData) => void;

type DeviationState = {
    active: boolean;
    startTimestamp: number;
    startFrameId: string;
    frameIds: string[];
    peakDeviation: number;
    consecutiveAboveCount: number;
    consecutiveBelowCount: number;
};

type StatBuffers = {
    last10: number[];
    last100: number[];
    deviationState: DeviationState;
};

export type StreamStats = {
    stats: Map<string, StatBuffers>;
};

export type CalculateFrameStatsOptions = {
    streamStatsMap: Map<string, StreamStats>;
    media_id: string;
    stats: Record<string, number>;
};

/**
 * Calculate frame statistics including motion energy, 10-period SMA, and 100-period SMA
 * @param options - Options object containing all required parameters
 * @returns FrameStats object with stats for each type
 */
export function calculateFrameStats(options: CalculateFrameStatsOptions): FrameStats {
    const { streamStatsMap, media_id, stats } = options;

    let streamStats = streamStatsMap.get(media_id);
    if (!streamStats) {
        streamStats = {
            stats: new Map()
        };
        streamStatsMap.set(media_id, streamStats);
    }

    const result: FrameStats = {};

    // Process each stat type
    for (const [statName, value] of Object.entries(stats)) {
        // Get or create stat buffers
        let statBuffers = streamStats.stats.get(statName);
        if (!statBuffers) {
            statBuffers = {
                last10: [],
                last100: [],
                deviationState: {
                    active: false,
                    startTimestamp: 0,
                    startFrameId: '',
                    frameIds: [],
                    peakDeviation: 0,
                    consecutiveAboveCount: 0,
                    consecutiveBelowCount: 0,
                }
            };
            streamStats.stats.set(statName, statBuffers);
        }

        // Update last10 buffer
        statBuffers.last10.push(value);
        if (statBuffers.last10.length > 10) {
            statBuffers.last10.shift();
        }

        // Update last100 buffer
        statBuffers.last100.push(value);
        if (statBuffers.last100.length > 100) {
            statBuffers.last100.shift();
        }

        // Calculate moving averages
        const sma10 = statBuffers.last10.reduce((a: number, b: number) => a + b, 0) / statBuffers.last10.length;
        const sma100 = statBuffers.last100.reduce((a: number, b: number) => a + b, 0) / statBuffers.last100.length;

        result[statName] = { value, sma10, sma100 };
    }

    return result;
}

export type CheckMomentOptions = {
    streamStatsMap: Map<string, StreamStats>;
    media_id: string;
    frame_id: string;
    timestamp: number;
    onMoment?: MomentCallback;
    onMaybeMomentStart?: () => void;
    onMaybeMomentEnd?: (isMoment: boolean) => void;
};

/**
 * Check for moment detection based on current frame statistics
 * Implements deviation-based moment detection per technical specification
 * @param options - Options object containing all parameters
 */
export function checkMoment(options: CheckMomentOptions): void {
    const { streamStatsMap, media_id, frame_id, timestamp, onMoment, onMaybeMomentStart, onMaybeMomentEnd } = options;

    const streamStats = streamStatsMap.get(media_id);
    if (!streamStats) {
        return; // No stats available
    }

    // Get motion_energy stats for moment detection
    const motionEnergyBuffers = streamStats.stats.get('motion_energy');
    if (!motionEnergyBuffers || motionEnergyBuffers.last100.length < 10) {
        return; // Not enough motion_energy data for moment detection
    }

    // Calculate moving averages for motion_energy
    const sma10 = motionEnergyBuffers.last10.reduce((a: number, b: number) => a + b, 0) / motionEnergyBuffers.last10.length;
    const sma100 = motionEnergyBuffers.last100.reduce((a: number, b: number) => a + b, 0) / motionEnergyBuffers.last100.length;

    // Deviation-based moment detection
    const state = motionEnergyBuffers.deviationState;

    // Calculate relative deviation (handles both increases and decreases)
    const deviation = Math.abs(sma10 - sma100) / Math.max(sma100, MOMENT_CONFIG.MIN_SMA100_THRESHOLD);
    const isDeviating = deviation >= MOMENT_CONFIG.MIN_DEVIATION_RATIO;

    if (isDeviating) {
        state.consecutiveAboveCount++;
        state.consecutiveBelowCount = 0;

        // Start new deviation moment if stability threshold met
        if (!state.active && state.consecutiveAboveCount >= MOMENT_CONFIG.STABILITY_BUFFER) {
            state.active = true;
            state.startTimestamp = timestamp;
            state.startFrameId = frame_id;
            state.frameIds = [frame_id];
            state.peakDeviation = deviation;
            onMaybeMomentStart?.();
        } else if (state.active) {
            // Continue tracking deviation
            state.frameIds.push(frame_id);
            state.peakDeviation = Math.max(state.peakDeviation, deviation);
        }
    } else {
        state.consecutiveBelowCount++;
        state.consecutiveAboveCount = 0;

        // End deviation moment if stability threshold met
        if (state.active && state.consecutiveBelowCount >= MOMENT_CONFIG.STABILITY_BUFFER) {
            const durationMs = timestamp - state.startTimestamp;

            // Check if moment meets thresholds
            const isStandardMoment = durationMs >= MOMENT_CONFIG.MIN_DURATION_MS;
            const isInstantEvent = (
                durationMs >= MOMENT_CONFIG.INSTANT_MIN_DURATION_MS &&
                durationMs < MOMENT_CONFIG.MIN_DURATION_MS &&
                state.peakDeviation >= MOMENT_CONFIG.INSTANT_EVENT_DEVIATION
            );

            if (isStandardMoment || isInstantEvent) {
                // Trigger moment callback
                onMoment?.({
                    media_id,
                    start_timestamp: state.startTimestamp,
                    end_timestamp: timestamp,
                    start_frame_id: state.startFrameId,
                    end_frame_id: frame_id,
                    frame_ids: [...state.frameIds],
                    peak_deviation: state.peakDeviation,
                    duration_ms: durationMs,
                    type: isInstantEvent ? 'instant' : 'standard',
                });
            }

            // Reset deviation state
            state.active = false;
            state.frameIds = [];
            state.peakDeviation = 0;
            onMaybeMomentEnd?.(isStandardMoment || isInstantEvent);
        }
    }
}

/**
 * Clear stats for a specific stream (useful when stream restarts)
 */
export function clearStreamStats(streamStatsMap: Map<string, StreamStats>, media_id: string): void {
    streamStatsMap.delete(media_id);
}
