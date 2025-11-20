# Moment Detection System - Technical Specification

## Executive Summary

**Goal:** Automatically detect "interesting moments" in video streams by identifying when activity deviates significantly from the scene's normal baseline.

**Approach:** Two-stage system:
1. **Real-time detection** of deviation events (when sma10 diverges from sma100)
2. **Post-processing** to group related events into semantic moments

---

## Core Concept: Deviation from Baseline

### The Math

```
deviation = |sma10 - sma100| / max(sma100, MIN_THRESHOLD)

A moment begins when: deviation ≥ 0.3 (30%)
A moment ends when: deviation < 0.3 for 2+ consecutive frames
```

### Why This Works

**sma100 = Adaptive baseline** for each scene
- Empty office: sma100 ≈ 0.05 (very low)
- Busy street: sma100 ≈ 0.4 (high)
- Automatically adapts to each scene's "normal"

**sma10 = Recent activity**
- Spikes when something interesting happens
- Returns to baseline during quiet periods

**Relative deviation = Scene-independent**
- Empty room, person enters: `(0.6 - 0.05) / 0.05 = 1100%` deviation
- Busy street, crash: `(0.9 - 0.4) / 0.4 = 125%` deviation
- Both caught with same 30% threshold!

---

## Real-World Examples

### Example 1: Empty Office - Person Enters and Works

```
Timeline: 0s─────10s─────20s─────────────120s
Motion:   0.05   0.7     0.2     0.2     0.2
Event:    empty  enter   typing  typing  typing

sma10:    0.05 → 0.7 →   0.2 →   0.2 →   0.2
sma100:   0.05 → 0.06 →  0.1 →   0.15 →  0.18
baseline: 0.05 (10th percentile of recent sma100)
```

**Stage 1 Detection:**
- **t=10s**: `deviation = |0.7 - 0.06| / 0.06 = 1067%` → **Moment A starts**
- **t=20s**: `deviation = |0.2 - 0.1| / 0.1 = 100%` → Still in Moment A
- **t=25s**: `deviation = |0.2 - 0.12| / 0.12 = 67%` → Still in Moment A
- **t=30s**: `deviation = |0.2 - 0.15| / 0.15 = 33%` → Still in Moment A
- **t=40s**: `deviation = |0.2 - 0.18| / 0.18 = 11%` → Below threshold
- **t=42s**: Still below → **Moment A ends** (duration: 32s)

**Result:** One moment capturing entire "person present" event.

---

### Example 2: Office - Person Enters, Sits Still 1min, Exits

```
Timeline: 0s─────10s────20s──────80s────90s────100s
Motion:   0.05   0.7    0.1      0.1    0.7    0.05
Event:    empty  enter  sitting  sit    exit   empty

sma10:    0.05 → 0.7 →  0.1 →    0.1 →  0.7 →  0.1
sma100:   0.05 → 0.06→  0.15→    0.2 →  0.25→  0.2
```

**Stage 1 Detection:**
- **t=10s**: Entry spike → **Moment A** [10s - 25s]
  - Ends when sma10 and sma100 converge (sitting quietly)
- **t=90s**: Exit spike → **Moment B** [90s - 95s]

**Stage 2 Grouping:**
```
Moment A: [10s - 25s]
Moment B: [90s - 95s]
Gap: 65 seconds < 180s ✓
Bridge sma100: avg(0.15, 0.2, 0.2) = 0.18
Baseline: 0.05
Bridge elevated? 0.18 >= 0.05 * 1.5 = 0.075 ✓

→ MERGE into one moment [10s - 95s]
```

**Result:** Entry and exit merged because person was present entire time (sma100 stayed elevated).

---

### Example 3: Busy Street - Normal Traffic

```
Timeline: 0s──5s──10s──15s──20s──25s
Motion:   0.4   0.6   0.4   0.7   0.4   0.5
Event:    cars  car1  cars  car2  cars  car3

sma10:    0.4 → 0.6 →  0.4 →  0.7 →  0.4 →  0.5
sma100:   0.4 → 0.42→  0.43→  0.45→  0.46→  0.47
baseline: 0.4
```

**Stage 1 Detection:**
- **t=5s**: `deviation = |0.6 - 0.42| / 0.42 = 43%` → Moment A [5s - 8s]
- **t=15s**: `deviation = |0.7 - 0.45| / 0.45 = 56%` → Moment B [15s - 18s]

**Stage 2 Grouping:**
```
Moment A: [5s - 8s]
Moment B: [15s - 18s]
Gap: 7 seconds < 180s ✓
Bridge sma100: 0.44
Bridge elevated? 0.44 >= 0.4 * 1.5 = 0.6? NO ✗

→ Keep separate (normal traffic variation, not unusual)
```

**Result:** Multiple separate small moments (normal traffic fluctuations).

---

### Example 4: Busy Street - Major Accident

```
Timeline: 0s──────10s─────20s─────30s
Motion:   0.4     0.9     0.3     0.3
Event:    traffic CRASH  stopped stopped

sma10:    0.4  → 0.9  →  0.3  →  0.3
sma100:   0.4  → 0.45 →  0.5  →  0.48
```

**Stage 1 Detection:**
- **t=10s**: `deviation = |0.9 - 0.45| / 0.45 = 100%` → **Moment A starts**
- **t=20s**: `deviation = |0.3 - 0.5| / 0.5 = 40%` → Still in moment (deviation DOWN)
- **t=30s**: `deviation = |0.3 - 0.48| / 0.48 = 38%` → Still elevated
- **t=40s**: Below threshold → **Moment A ends**

**Result:** One moment [10s - 40s] capturing crash AND aftermath (unusual stillness).

---

### Example 5: Lightning Strike (Instant Event)

```
Timeline: 0s───1s───2s───5s───10s
Motion:   0.05  0.95  0.8   0.2   0.05
Event:    night FLASH bright dim   night

sma10:    0.05 → 0.95 → 0.8 → 0.4 → 0.1
sma100:   0.05 → 0.05 → 0.06 → 0.1 → 0.12
```

**Stage 1 Detection:**
- **t=1s**: `deviation = |0.95 - 0.05| / 0.05 = 1800%` → Moment starts
- **t=3s**: Still elevated (~600%)
- **t=5s**: Below threshold → Moment ends
- **Duration check**: 4 seconds < 10s minimum
- **Instant event check**: peak_deviation = 1800% > 500% → **CAPTURED as instant event**

**Result:** Detected as brief extreme event (lightning, explosion, flash).

---

### Example 6: Lighting Adjustment (False Positive Filter)

```
Timeline: 0s───1s───3s───10s
Motion:   0.05  0.3  0.05  0.05
Event:    room  adjust room  room

sma10:    0.05 → 0.3 → 0.05 → 0.05
sma100:   0.05 → 0.05→ 0.06 → 0.06
```

**Stage 1 Detection:**
- **t=1s**: `deviation = |0.3 - 0.05| / 0.05 = 500%` → Moment starts
- **t=3s**: Below threshold → Moment ends
- **Duration check**: 2 seconds < 10s minimum
- **Instant event check**: peak_deviation = 500% < 500% → **REJECTED**

**Result:** Filtered out (brief and not extreme enough).

---

## Algorithm Parameters

### Stage 1: Deviation Detection

| Parameter | Value | Reasoning |
|-----------|-------|-----------|
| `MIN_DEVIATION_RATIO` | 0.3 (30%) | Catches significant changes, filters noise |
| `MIN_DURATION_MS` | 10000 (10s) | Standard minimum for sustained events |
| `INSTANT_EVENT_DEVIATION` | 5.0 (500%) | Extreme deviation threshold for brief events |
| `INSTANT_MIN_DURATION_MS` | 1000 (1s) | Minimum for instant events |
| `STABILITY_BUFFER` | 2 frames | Anti-flicker, requires sustained change |
| `MIN_SMA100_THRESHOLD` | 0.01 | Prevents division by zero in dark scenes |

### Stage 2: Moment Grouping

| Parameter | Value | Reasoning |
|-----------|-------|-----------|
| `MAX_GAP_MS` | 180000 (3min) | Maximum time between related events |
| `MIN_BRIDGE_SMA100` | 0.15 | Absolute minimum activity during gap |
| `BRIDGE_RATIO` | 1.5x | Bridge must be 50% above baseline |
| `BASELINE_PERCENTILE` | 10th | "Typical quiet" = 10% lowest activity |

---

## Edge Cases Handled

### Ultra-Low Baseline (Dark Empty Room)
**Problem:** `sma100 = 0.001`, tiny change → huge deviation
**Solution:** Use `max(sma100, 0.01)` in denominator

### Gradual Scene Change (Day → Night)
**Problem:** Everything darkens slowly over 1 hour
**Solution:** sma10 tracks sma100 → low deviation → not detected ✓

### Camera Adjustment/Refocus
**Problem:** Entire frame blurs then refocuses (2-3 seconds)
**Solution:** Moderate deviation, caught by minimum duration filter ✓

### Lightning/Explosions (Instant Events)
**Problem:** Extremely brief (1-2s) but very significant events
**Solution:** Separate instant event threshold (500%+ deviation) ✓

### Continuous Busy Scene
**Problem:** Office with constant activity, no clear "moments"
**Solution:** Baseline adapts upward, only unusual spikes detected ✓

---

## Technical Design Decisions

### Why Relative Deviation (Not Absolute)?

**Absolute threshold fails:**
- Threshold = 0.1
- Empty room: 0.05 → 0.15 (change=0.1) → detected ✓
- Busy street: 0.4 → 0.5 (change=0.1) → detected but shouldn't be ✗

**Relative threshold works:**
- Threshold = 30%
- Empty room: 0.05 → 0.15 (300%) → detected ✓
- Busy street: 0.4 → 0.5 (25%) → not detected ✓

### Why sma100 as Baseline (Not Global Minimum)?

sma100 **adapts** to scene state:
- Daylight: High motion (trees, people) → sma100 = 0.3
- Night: Low motion → sma100 = 0.05
- Same scene, different baseline ✓

Global minimum would miss nighttime events (too sensitive).

### Why Two Stages (Not Single Pass)?

**Problem:** Person enters, sits 2min, exits
- Single-pass sees: two separate spikes
- Two-stage sees: one "person present" event

**Grouping requires:**
- Seeing multiple moments in context
- Checking activity between moments
- Cannot do in real-time, single frame at a time

---

## Implementation Notes

### State Storage Requirements

**Per-stream state:**
- `DeviationState`: Current detection state (~100 bytes)
- `BaselineState`: Rolling sma100 history (1000 × 8 bytes = 8KB)
- Recent moments buffer (100 moments × 1KB = 100KB)

**Total:** ~110KB per stream (negligible)

### Performance Characteristics

**Stage 1 (real-time):**
- O(1) per frame
- Minimal computation (one division, one comparison)
- No blocking operations

**Stage 2 (periodic):**
- O(n) where n = number of moments
- Runs every 5 minutes or on-demand
- Typical: <100 moments, <1ms processing time

### Testing Strategy

1. **Synthetic scenarios**: Generate known patterns, verify detection
2. **Real footage**: Office, street, home camera feeds
3. **Edge cases**: Complete darkness, strobe lights, rapid pans
4. **Tuning**: Adjust thresholds based on false positive/negative rates

---

## Future Enhancements

- **Scene classification**: Different thresholds for indoor vs outdoor
- **Time-of-day awareness**: Different baselines for day vs night
- **Multi-scale detection**: Add sma1000 for very long-term baseline
- **Confidence scores**: Rank moments by significance
- **Suppression rules**: Ignore moments during known maintenance windows
