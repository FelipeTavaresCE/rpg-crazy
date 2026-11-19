import skillData from '../data/skills.json';

import type { AutoHuntPosture } from '@kaetram/common/network/impl/autohunt';
import type { PassiveBonuses } from '../systems/passive-tree-system';

interface WeaponSkillDefinition {
    weaponFamily: string;
    type: 'attack' | 'area' | 'ultimate';
    rangeSqm: number;
    areaRadiusSqm?: number;
    projectile?: boolean;
    cooldownMs?: number;
    damageMultiplier: number;
}

interface SkillGemDefinition {
    effect: 'projectile_count' | 'damage_to_hp';
    projectileCount?: number;
    damageToHp?: number;
}

const catalog = skillData as {
    weaponSkills: { [key: string]: WeaponSkillDefinition };
    skillGems: { [key: string]: SkillGemDefinition };
};

export interface CombatDamageInput {
    attackBonus: number;
    attribute: number;
    defense: number;
    attackerLevel: number;
    mastery?: number;
    cardBonus?: number;
    passiveBonus?: number;
    passiveBonuses?: Partial<PassiveBonuses>;
    critical?: boolean;
    posture?: AutoHuntPosture;
    skillId?: string;
    projectile?: boolean;
    socketedGems?: string[];
}

export interface CombatDamageResult {
    damagePerProjectile: number;
    projectileCount: number;
    totalDamage: number;
    lifeSteal: number;
}

export function calculateCombatDamage(input: CombatDamageInput): CombatDamageResult {
    let postureDamage = input.posture === 'advance' ? 1.25 : input.posture === 'guard' ? 0.75 : 1,
        skill = input.skillId ? catalog.weaponSkills[input.skillId] : undefined,
        passiveBonus = (input.passiveBonus ?? 0) + (input.passiveBonuses?.attack ?? 0),
        baseDamage = (input.attackBonus + input.attribute * 1.5) * (1 + (input.mastery ?? 0)),
        multipliers =
            (1 + (input.cardBonus ?? 0)) *
            (1 + passiveBonus) *
            postureDamage *
            (skill?.damageMultiplier ?? 1),
        defense = Math.max(0, input.defense),
        mitigation = defense / (defense + 100 + 10 * Math.max(1, input.attackerLevel)),
        critical = input.critical ? 1.5 : 1,
        damagePerProjectile = Math.max(
            1,
            Math.floor(baseDamage * multipliers * (1 - mitigation) * critical)
        ),
        projectileCount = 1,
        lifeStealRate = 0;

    for (let gemId of input.socketedGems ?? []) {
        let gem = catalog.skillGems[gemId];
        if (gem?.effect === 'projectile_count' && input.projectile)
            projectileCount = Math.max(projectileCount, gem.projectileCount ?? 1);
        else if (gem?.effect === 'damage_to_hp') lifeStealRate += gem.damageToHp ?? 0;
    }

    let totalDamage = damagePerProjectile * projectileCount;

    return {
        damagePerProjectile,
        projectileCount,
        totalDamage,
        lifeSteal: Math.floor(totalDamage * lifeStealRate)
    };
}

export function getWeaponSkillRange(skillId: string): number | undefined {
    return catalog.weaponSkills[skillId]?.rangeSqm;
}

export function getWeaponSkillArea(skillId: string): number | undefined {
    return catalog.weaponSkills[skillId]?.areaRadiusSqm;
}

export function getWeaponSkillCooldown(skillId: string): number {
    return catalog.weaponSkills[skillId]?.cooldownMs ?? 0;
}

export function getSkillGemEffect(gemId: string): SkillGemDefinition | undefined {
    let gem = catalog.skillGems[gemId];
    return gem ? { ...gem } : undefined;
}
