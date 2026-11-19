export const WORLD_CYCLE_EPOCH = 0;
export const AURORA_DURATION_MS = 4 * 60 * 60 * 1000;
export const ECLIPSE_DURATION_MS = 2 * 60 * 60 * 1000;
export const WORLD_CYCLE_DURATION_MS = AURORA_DURATION_MS + ECLIPSE_DURATION_MS;
export const MAX_OFFLINE_DURATION_MS = 8 * 60 * 60 * 1000;

export type WorldPhase = 'aurora' | 'eclipse';

export interface WorldCycleState {
    phase: WorldPhase;
    cyclePosition: number;
    phaseElapsed: number;
    phaseDuration: number;
    nextTransitionAt: number;
}

function getCyclePosition(timestamp: number, epoch = WORLD_CYCLE_EPOCH): number {
    let position = (timestamp - epoch) % WORLD_CYCLE_DURATION_MS;

    return (position + WORLD_CYCLE_DURATION_MS) % WORLD_CYCLE_DURATION_MS;
}

export function getWorldCycleState(
    timestamp = Date.now(),
    epoch = WORLD_CYCLE_EPOCH
): WorldCycleState {
    if (!Number.isFinite(timestamp) || !Number.isFinite(epoch))
        throw new RangeError('World cycle timestamps must be finite.');

    let cyclePosition = getCyclePosition(timestamp, epoch),
        phase = cyclePosition < AURORA_DURATION_MS ? 'aurora' : 'eclipse',
        phaseElapsed =
            phase === 'aurora' ? cyclePosition : cyclePosition - AURORA_DURATION_MS,
        phaseDuration = phase === 'aurora' ? AURORA_DURATION_MS : ECLIPSE_DURATION_MS;

    return {
        phase,
        cyclePosition,
        phaseElapsed,
        phaseDuration,
        nextTransitionAt: timestamp + phaseDuration - phaseElapsed
    };
}

export function isEclipseAt(timestamp: number, epoch = WORLD_CYCLE_EPOCH): boolean {
    return getWorldCycleState(timestamp, epoch).phase === 'eclipse';
}

export function getEclipseOverlapDuration(
    startedAt: number,
    duration: number,
    epoch = WORLD_CYCLE_EPOCH
): number {
    if (![startedAt, duration, epoch].every(Number.isFinite))
        throw new RangeError('Offline window timestamps must be finite.');

    let windowDuration = Math.min(MAX_OFFLINE_DURATION_MS, Math.max(0, duration));
    if (windowDuration === 0) return 0;

    let end = startedAt + windowDuration,
        cycleIndex = Math.floor((startedAt - epoch) / WORLD_CYCLE_DURATION_MS),
        eclipseStart = epoch + cycleIndex * WORLD_CYCLE_DURATION_MS + AURORA_DURATION_MS,
        overlap = 0;

    while (eclipseStart < end) {
        let eclipseEnd = eclipseStart + ECLIPSE_DURATION_MS;
        overlap += Math.max(0, Math.min(end, eclipseEnd) - Math.max(startedAt, eclipseStart));
        eclipseStart += WORLD_CYCLE_DURATION_MS;
    }

    return overlap;
}
