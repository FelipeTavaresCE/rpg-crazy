import type { AutoHuntPosture } from '@kaetram/common/network/impl/autohunt';

export interface PvEDamageInput {
    attackBonus: number;
    attribute: number;
    mastery?: number;
    cardBonus?: number;
    passiveBonus?: number;
    defense: number;
    attackerLevel: number;
    critical?: boolean;
    posture?: AutoHuntPosture;
}

export function getPvEDamage(input: PvEDamageInput): number {
    let postureDamage = input.posture === 'advance' ? 1.25 : input.posture === 'guard' ? 0.75 : 1,
        baseDamage = (input.attackBonus + input.attribute * 1.5) * (1 + (input.mastery || 0)),
        multipliers =
            (1 + (input.cardBonus || 0)) * (1 + (input.passiveBonus || 0)) * postureDamage,
        defense = Math.max(0, input.defense),
        mitigation = defense / (defense + 100 + 10 * input.attackerLevel),
        critical = input.critical ? 1.5 : 1;

    return Math.max(1, Math.floor(baseDamage * multipliers * (1 - mitigation) * critical));
}
