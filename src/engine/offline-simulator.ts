import { rollEconomyDrops, recycleDrops } from '../systems/loot-and-economy';
import {
    getEclipseOverlapDuration,
    isEclipseAt as isWorldEclipseAt,
    MAX_OFFLINE_DURATION_MS
} from './world-cycle';
import {
    DEFAULT_GAMBIT_RULES,
    evaluateGambitRules,
    sanitizeGambitRules
} from '../systems/gambit-ai';

import type { AutoRecycleSettings, EconomyResult, LootDrop } from '../systems/loot-and-economy';
import type { GambitDecision } from '../systems/gambit-ai';
import type { OfflineHuntSnapshot } from '@kaetram/common/network/impl/autohunt';

export interface OfflineLootInput {
    seed: number;
    kills: number;
    regionKillCount: number;
    startedAt: number;
    duration: number;
    autoRecycle: AutoRecycleSettings;
}

export interface OfflineLootResult extends EconomyResult {
    recycled: LootDrop[];
    announcements: string[];
    eclipseDurationMs: number;
}

export function evaluateOfflineGambit(
    snapshot: Pick<
        OfflineHuntSnapshot,
        | 'hitPoints'
        | 'maxHitPoints'
        | 'posture'
        | 'gambitRules'
        | 'mobs'
        | 'adjacentEnemies'
        | 'regionKillCount'
        | 'healingItems'
    >
): GambitDecision | undefined {
    let rules = sanitizeGambitRules(snapshot.gambitRules ?? DEFAULT_GAMBIT_RULES);

    return evaluateGambitRules(rules, {
        hitPoints: snapshot.hitPoints,
        maxHitPoints: snapshot.maxHitPoints,
        targetIsPortadorOrBoss:
            snapshot.mobs.some((mob) => mob.boss) ||
            ((snapshot.regionKillCount ?? 0) + 1) % 100 === 0,
        adjacentEnemies: snapshot.adjacentEnemies ?? 0,
        canHeal: snapshot.healingItems.some((item) => item.count > 0),
        canUseUltimate: true,
        canUseAoe: true,
        hasTarget: snapshot.mobs.length > 0,
        currentStance:
            snapshot.posture === 'guard'
                ? 'Guarda'
                : snapshot.posture === 'advance'
                ? 'Avanço'
                : 'Equilíbrio'
    });
}

export function isEclipseAt(timestamp: number): boolean {
    return isWorldEclipseAt(timestamp);
}

export function simulateOfflineLoot(input: OfflineLootInput): OfflineLootResult {
    let state = input.seed >>> 0 || 1,
        random = (): number => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 0x1_00_00_00_00;
        },
        drops: LootDrop[] = [],
        portadorKills = 0,
        regionKillCount = Math.max(0, Math.floor(input.regionKillCount)),
        kills = Math.max(0, Math.floor(input.kills)),
        duration = Number.isFinite(input.duration)
            ? Math.min(MAX_OFFLINE_DURATION_MS, Math.max(0, input.duration))
            : 0,
        killInterval = kills > 0 ? duration / kills : 0,
        eclipseDurationMs = getEclipseOverlapDuration(input.startedAt, duration);

    for (let kill = 0; kill < kills; kill++) {
        regionKillCount++;
        let result = rollEconomyDrops(
            random,
            regionKillCount,
            isEclipseAt(input.startedAt + (kill + 0.5) * killInterval)
        );
        drops.push(...result.drops);
        portadorKills += result.portadorKills;
    }

    let recycled = recycleDrops(drops, input.autoRecycle);

    return {
        drops: recycled.kept,
        recycled: recycled.recycled,
        portadorKills,
        regionKillCount,
        announcements: drops.filter((drop) => drop.announceGlobally).map((drop) => drop.key),
        eclipseDurationMs
    };
}
