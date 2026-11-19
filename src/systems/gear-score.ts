export interface GearScoreStats {
    crush?: unknown;
    slash?: unknown;
    stab?: unknown;
    archery?: unknown;
    magic?: unknown;
}

export interface GearScoreInput {
    baseAttack?: number;
    baseDefense?: number;
    attackStats?: Readonly<GearScoreStats>;
    defenseStats?: Readonly<GearScoreStats>;
    refineLevel: number;
    socketedCards: readonly string[];
    socketedGems: readonly string[];
}

export function gearScore(item: GearScoreInput): number {
    let effectiveAttack =
            item.baseAttack ??
            Object.values(item.attackStats ?? {}).reduce<number>(
                (sum, value) => sum + (typeof value === 'number' && value > 0 ? value : 0),
                0
            ),
        effectiveDefense =
            item.baseDefense ??
            Object.values(item.defenseStats ?? {}).reduce<number>(
                (sum, value) => sum + (typeof value === 'number' && value > 0 ? value : 0),
                0
            );

    return (
        (effectiveAttack + effectiveDefense) * (1 + item.refineLevel * 0.15) +
        item.socketedCards.length * 10 +
        item.socketedGems.length * 10
    );
}

export function isSuperiorGear(candidate: GearScoreInput, equipped?: GearScoreInput): boolean {
    return !equipped || gearScore(candidate) > gearScore(equipped);
}
