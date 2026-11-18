export interface RefinableItem {
    refineLevel: number;
    isScarred: boolean;
}

export interface RefineMaterials {
    auroraJewels: number;
    temperFragments: number;
}

export interface RefineResult {
    success: boolean;
    item: RefinableItem;
    materials: RefineMaterials;
    chance: number;
}

export const REFINE_CHANCES: Readonly<{ [key: number]: number }> = {
    1: 1,
    2: 1,
    3: 1,
    4: 1,
    5: 0.75,
    6: 0.6,
    7: 0.45,
    8: 0.3,
    9: 0.2,
    10: 0.1
};

export function refineItem(
    item: RefinableItem,
    materials: RefineMaterials,
    roll: number
): RefineResult {
    let targetLevel = item.refineLevel + 1,
        chance = REFINE_CHANCES[targetLevel];

    if (
        chance === undefined ||
        item.refineLevel < 0 ||
        item.isScarred ||
        !Number.isFinite(roll) ||
        roll < 0 ||
        roll >= 1
    )
        return { success: false, item: { ...item }, materials: { ...materials }, chance: 0 };

    let temperCost = targetLevel;
    if (materials.auroraJewels < 1 || materials.temperFragments < temperCost)
        return { success: false, item: { ...item }, materials: { ...materials }, chance };

    let success = roll >= 0 && roll < chance,
        nextItem = success
            ? { ...item, refineLevel: targetLevel }
            : targetLevel > 4
            ? { ...item, refineLevel: Math.max(0, item.refineLevel - 1), isScarred: true }
            : { ...item };

    return {
        success,
        item: nextItem,
        materials: {
            auroraJewels: materials.auroraJewels - 1,
            temperFragments: materials.temperFragments - temperCost
        },
        chance
    };
}

export function repairScar(
    item: RefinableItem,
    purifiedRelics: number
): {
    item: RefinableItem;
    purifiedRelics: number;
} {
    if (!item.isScarred || purifiedRelics < 1) return { item: { ...item }, purifiedRelics };
    return { item: { ...item, isScarred: false }, purifiedRelics: purifiedRelics - 1 };
}
