import { rollEconomyDrops, recycleDrops } from '../systems/LootAndEconomy';
import type {
    AutoRecycleSettings,
    EconomyResult,
    LootDrop
} from '../systems/LootAndEconomy';

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
}

export function isEclipseAt(timestamp: number): boolean {
    let cycleLength = 6 * 60 * 60 * 1000,
        eclipseStart = 4 * 60 * 60 * 1000;

    return ((timestamp % cycleLength) + cycleLength) % cycleLength >= eclipseStart;
}

export function simulateOfflineLoot(input: OfflineLootInput): OfflineLootResult {
    let state = input.seed >>> 0 || 1,
        random = (): number => {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 0x1_0000_0000;
        },
        drops: LootDrop[] = [],
        portadorKills = 0,
        regionKillCount = Math.max(0, Math.floor(input.regionKillCount)),
        kills = Math.max(0, Math.floor(input.kills)),
        killInterval = kills > 0 ? Math.max(0, input.duration) / kills : 0;

    for (let kill = 0; kill < kills; kill++) {
        regionKillCount++;
        let result = rollEconomyDrops(
            random,
            regionKillCount,
            isEclipseAt(input.startedAt + kill * killInterval)
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
        announcements: drops
            .filter((drop) => drop.announceGlobally)
            .map((drop) => drop.key)
    };
}
