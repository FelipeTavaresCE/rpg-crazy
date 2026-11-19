import { getWorldCycleState } from './world-cycle';

import type { WorldCycleState } from './world-cycle';

export type LightSourceKind = 'torch' | 'rare-drop' | 'portador';

export interface DynamicLightSource {
    id: string;
    kind: LightSourceKind;
    x: number;
    y: number;
    radius?: number;
    colour?: string;
}

export interface DynamicLight extends DynamicLightSource {
    radius: number;
    colour: string;
    blendMode: 'screen';
}

export interface LightingState {
    phase: WorldCycleState['phase'];
    blendMode: 'multiply';
    ambientColour: string;
    ambientOpacity: number;
    lights: DynamicLight[];
    nextTransitionAt: number;
}

const defaultLights: Record<LightSourceKind, { radius: number; colour: string }> = {
    torch: { radius: 96, colour: '#ff9b45' },
    'rare-drop': { radius: 48, colour: '#73d9ff' },
    portador: { radius: 80, colour: '#ffba45' }
};

export function getLightingState(
    timestamp = Date.now(),
    sources: readonly DynamicLightSource[] = []
): LightingState {
    let cycle = getWorldCycleState(timestamp),
        isEclipse = cycle.phase === 'eclipse';

    return {
        phase: cycle.phase,
        blendMode: 'multiply',
        ambientColour: isEclipse ? 'rgba(5, 7, 18, 0.82)' : 'rgba(0, 0, 0, 0)',
        ambientOpacity: isEclipse ? 0.82 : 0,
        lights: isEclipse
            ? sources.map((source) => ({
                  ...source,
                  radius: source.radius ?? defaultLights[source.kind].radius,
                  colour: source.colour ?? defaultLights[source.kind].colour,
                  blendMode: 'screen'
              }))
            : [],
        nextTransitionAt: cycle.nextTransitionAt
    };
}
