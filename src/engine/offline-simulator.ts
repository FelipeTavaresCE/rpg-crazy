import {
    getEclipseOverlapDuration,
    isEclipseAt as isWorldEclipseAt,
    MAX_OFFLINE_DURATION_MS
} from './world-cycle';

import { isSuperiorGear } from '../systems/gear-score';
import { rollEconomyDrops, recycleDrops } from '../systems/loot-and-economy';
import {
    DEFAULT_GAMBIT_RULES,
    evaluateGambitRules,
    sanitizeGambitRules
} from '../systems/gambit-ai';

import type { AutoRecycleSettings, EconomyResult, LootDrop } from '../systems/loot-and-economy';
import type { GearScoreInput } from '../systems/gear-score';
import type { GambitDecision } from '../systems/gambit-ai';
import type {
    OfflineHuntHealingItem,
    OfflineHuntSnapshot
} from '@kaetram/common/network/impl/autohunt';

export interface OfflineCombatInput {
    duration: number;
    killLimit: number;
    attackInterval: number;
    travelTime: number;
    attacksPerKill: number;
    damagePerAttack: number;
    targetHitPoints: number;
    enemyAttackInterval: number;
    enemyDamage: number;
    lifeStealPerAttack: number;
    regenerationPerSecond: number;
    hitPoints: number;
    maxHitPoints: number;
    resourceType: OfflineHuntSnapshot['resourceType'];
    resourceCount: number;
    mana: number;
    maxMana: number;
    resourcePerAttack: number;
    healingItems: OfflineHuntHealingItem[];
    shouldHeal(hitPoints: number, healingUsed: number[]): boolean;
}

export interface OfflineCombatResult {
    kills: number;
    deaths: number;
    hitPoints: number;
    resourceCount: number;
    mana: number;
    attacks: number;
    damage: number;
    healingUsed: number[];
}

/** Simulates the averaged fight, resolving lethal damage before any subsequent healing. */
export function simulateOfflineCombat(input: OfflineCombatInput): OfflineCombatResult {
    let hitPoints = Math.max(0, Math.min(input.maxHitPoints, input.hitPoints)),
        resourceCount = Math.max(0, input.resourceCount),
        mana = Math.max(0, Math.min(input.maxMana, input.mana)),
        healingUsed = input.healingItems.map(() => 0),
        kills = 0,
        deaths = 0,
        attacks = 0,
        damage = 0,
        fightAttacks = 0,
        fightDamage = 0,
        time = 0,
        nextAttack = input.travelTime + input.attackInterval,
        nextEnemyAttack = input.travelTime + input.enemyAttackInterval;

    if (
        !Number.isFinite(input.duration) ||
        input.duration <= 0 ||
        !Number.isFinite(input.killLimit) ||
        input.killLimit < 0 ||
        !Number.isFinite(input.attackInterval) ||
        input.attackInterval < 50 ||
        !Number.isFinite(input.travelTime) ||
        input.travelTime < 0 ||
        !Number.isFinite(input.attacksPerKill) ||
        input.attacksPerKill < 1 ||
        !Number.isFinite(input.enemyAttackInterval) ||
        input.enemyAttackInterval < 50 ||
        !Number.isFinite(input.maxHitPoints) ||
        input.maxHitPoints <= 0 ||
        !Number.isFinite(input.hitPoints) ||
        !Number.isFinite(input.maxMana) ||
        input.maxMana < 0 ||
        !Number.isFinite(input.mana) ||
        !Number.isFinite(input.resourceCount) ||
        !Number.isFinite(input.resourcePerAttack) ||
        input.resourcePerAttack < 0 ||
        !Number.isFinite(input.enemyDamage) ||
        input.enemyDamage < 0 ||
        !Number.isFinite(input.damagePerAttack) ||
        input.damagePerAttack < 0 ||
        !Number.isFinite(input.targetHitPoints) ||
        input.targetHitPoints <= 0 ||
        !Number.isFinite(input.lifeStealPerAttack) ||
        input.lifeStealPerAttack < 0 ||
        !Number.isFinite(input.regenerationPerSecond) ||
        input.regenerationPerSecond < 0
    )
        return { kills, deaths, hitPoints, resourceCount, mana, attacks, damage, healingUsed };

    let duration = Math.min(input.duration, MAX_OFFLINE_DURATION_MS),
        respawn = (): void => {
            deaths++;
            hitPoints = input.maxHitPoints;
            mana = input.maxMana;
            if (input.resourceType === 'mana') resourceCount = mana;
        },
        heal = (needsMana: boolean): boolean => {
            if (!input.shouldHeal(hitPoints, healingUsed)) return false;
            let index = input.healingItems.findIndex(
                (item, i) =>
                    healingUsed[i] < item.count && (needsMana ? item.mana > 0 : item.hitPoints > 0)
            );
            if (index < 0) return false;
            let item = input.healingItems[index];
            healingUsed[index]++;
            hitPoints = Math.min(input.maxHitPoints, hitPoints + Math.max(0, item.hitPoints));
            mana = Math.min(input.maxMana, mana + Math.max(0, item.mana));
            if (input.resourceType === 'mana') resourceCount = mana;
            return true;
        };

    if (hitPoints <= 0) {
        respawn();
        return { kills, deaths, hitPoints, resourceCount, mana, attacks, damage, healingUsed };
    }

    while (kills < input.killLimit) {
        let nextTime = Math.min(nextAttack, nextEnemyAttack, duration);
        hitPoints = Math.min(
            input.maxHitPoints,
            hitPoints + (Math.max(0, input.regenerationPerSecond) * (nextTime - time)) / 1000
        );
        time = nextTime;
        if (time >= duration && time < Math.min(nextAttack, nextEnemyAttack)) break;

        if (hitPoints < input.maxHitPoints) heal(false);

        if (nextAttack <= nextEnemyAttack) {
            if (
                input.resourceType === 'mana' &&
                resourceCount < input.resourcePerAttack &&
                input.resourcePerAttack > input.maxMana
            )
                nextAttack = Infinity;
            while (
                Number.isFinite(nextAttack) &&
                input.resourceType !== 'none' &&
                resourceCount < input.resourcePerAttack
            ) {
                if (input.resourceType !== 'mana' || resourceCount >= input.maxMana) break;
                if (!heal(true)) break;
            }
            if (input.resourceType !== 'none' && resourceCount < input.resourcePerAttack) {
                nextAttack = Infinity;
                continue;
            }
            if (input.resourceType !== 'none') {
                resourceCount -= input.resourcePerAttack;
                if (input.resourceType === 'mana') mana = resourceCount;
            }
            attacks++;
            let dealt = Math.min(input.damagePerAttack, input.targetHitPoints - fightDamage);
            damage += dealt;
            fightDamage += dealt;
            fightAttacks++;
            hitPoints = Math.min(input.maxHitPoints, hitPoints + input.lifeStealPerAttack);
            if (fightAttacks >= input.attacksPerKill) {
                kills++;
                fightAttacks = 0;
                fightDamage = 0;
                nextEnemyAttack = time + input.travelTime + input.enemyAttackInterval;
                nextAttack = time + input.travelTime + input.attackInterval;
            } else nextAttack = time + input.attackInterval;
        } else {
            hitPoints = Math.max(0, hitPoints - input.enemyDamage);
            if (hitPoints <= 0) {
                respawn();
                break;
            }
            nextEnemyAttack = time + input.enemyAttackInterval;
        }
        if (time >= duration && Math.min(nextAttack, nextEnemyAttack) > time) break;
    }

    hitPoints = Math.min(
        input.maxHitPoints,
        hitPoints + (input.regenerationPerSecond * (duration - time)) / 1000
    );
    return { kills, deaths, hitPoints, resourceCount, mana, attacks, damage, healingUsed };
}

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

export interface OfflineGear {
    template?: { attack?: number; defense?: number };
    instance?: Pick<GearScoreInput, 'refineLevel' | 'socketedCards' | 'socketedGems'>;
}

export function isSuperiorOfflineGear(
    candidate: OfflineGear,
    equipped?: OfflineGear
): boolean | undefined {
    if (!equipped) return true;

    let scoreInput = (gear: OfflineGear): GearScoreInput | undefined => {
            let { template, instance } = gear;
            if (
                !template ||
                (template.attack === undefined && template.defense === undefined) ||
                (template.attack !== undefined && !Number.isFinite(template.attack)) ||
                (template.defense !== undefined && !Number.isFinite(template.defense)) ||
                !instance ||
                !Number.isFinite(instance.refineLevel) ||
                instance.refineLevel < 0 ||
                !Array.isArray(instance.socketedCards) ||
                !instance.socketedCards.every((card) => typeof card === 'string') ||
                !Array.isArray(instance.socketedGems) ||
                !instance.socketedGems.every((gem) => typeof gem === 'string')
            )
                return;

            return {
                baseAttack: template.attack ?? 0,
                baseDefense: template.defense ?? 0,
                refineLevel: instance.refineLevel,
                socketedCards: instance.socketedCards,
                socketedGems: instance.socketedGems
            };
        },
        candidateScore = scoreInput(candidate),
        equippedScore = scoreInput(equipped);
    if (!candidateScore || !equippedScore) return;
    return isSuperiorGear(candidateScore, equippedScore);
}

export function summarizeSuperiorOfflineGear(
    items: Array<{ key: string; candidate: OfflineGear; equipped?: OfflineGear }>
): { superiorGear?: string[]; superiorGearComparisonIncomplete?: boolean } {
    let superiorGear: string[] = [],
        incomplete = false;
    for (let { key, candidate, equipped } of items) {
        let comparison = isSuperiorOfflineGear(candidate, equipped);
        if (comparison === undefined) incomplete = true;
        else if (comparison) superiorGear.push(key);
    }

    return {
        superiorGear: incomplete && superiorGear.length === 0 ? undefined : superiorGear,
        superiorGearComparisonIncomplete: incomplete || undefined
    };
}

export function collectOfflineDrops(
    kept: LootDrop[],
    recycled: LootDrop[],
    add: (key: string, count: number) => number
): { collected: number; overflow: number; retainedDrops: string[] } {
    let collected = 0,
        overflow = 0,
        retainedDrops: string[] = [];

    for (let drops of [kept, recycled]) {
        let aggregated = new Map<string, number>();
        for (let drop of drops)
            aggregated.set(drop.key, (aggregated.get(drop.key) || 0) + drop.count);
        for (let [key, count] of aggregated) {
            let added = Math.max(0, Math.min(count, add(key, count)));
            if (added > 0 && drops === kept) retainedDrops.push(key);
            collected += added;
            overflow += Math.max(0, count - added);
        }
    }

    return { collected, overflow, retainedDrops };
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
