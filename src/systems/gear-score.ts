export interface GearScoreInput {
    baseAttack: number;
    baseDefense: number;
    refineLevel: number;
    socketedCards: readonly string[];
    socketedGems: readonly string[];
}

export function gearScore(item: GearScoreInput): number {
    return (
        (item.baseAttack + item.baseDefense) * (1 + item.refineLevel * 0.15) +
        item.socketedCards.length * 10 +
        item.socketedGems.length * 10
    );
}

export function isSuperiorGear(candidate: GearScoreInput, equipped?: GearScoreInput): boolean {
    return !equipped || gearScore(candidate) > gearScore(equipped);
}
