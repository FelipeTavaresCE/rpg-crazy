export type AutoHuntRule =
    | 'heal-low'
    | 'guard-low'
    | 'advance-high'
    | 'balance-low'
    | 'balance-high'
    | 'disabled';
export type AutoHuntPosture = 'balance' | 'advance' | 'guard';
export type CombatStance = 'Equilíbrio' | 'Avanço' | 'Guarda';
export const AUTO_RECYCLE_RARITIES = ['common', 'uncommon', 'rare', 'epic'] as const;
export type AutoRecycleRarity = (typeof AUTO_RECYCLE_RARITIES)[number];

export interface AutoHuntEquipment {
    id: string;
    name: string;
    slot: string;
    cards: string[];
    gems: string[];
    refineLevel: number;
    isScarred: boolean;
    operations: {
        forge: { available: boolean; reason?: string };
        repair: { available: boolean; reason?: string };
    };
}

export type GambitCondition =
    | { type: 'HP_BELOW_PERCENT'; percent: number }
    | { type: 'TARGET_IS_PORTADOR_OR_BOSS' }
    | { type: 'ADJACENT_ENEMIES_GTE'; count: number }
    | { type: 'ALWAYS' };

export type GambitAction =
    | { type: 'USE_POTION_OR_HEAL' }
    | { type: 'SWITCH_STANCE'; stance: CombatStance }
    | { type: 'USE_ULTIMATE' }
    | { type: 'USE_AOE' }
    | { type: 'ATTACK_NEAREST' };

export interface GambitRule {
    id: string;
    condition: GambitCondition;
    action: GambitAction;
    enabled?: boolean;
}

export interface OfflineHuntReport {
    duration: number;
    kills: number;
    experience: number;
    levelsGained?: number;
    lootCollected: number;
    lootOverflow: number;
    reason: string;
    eclipseDurationMs?: number;
    portadorKills?: number;
    legendaryAnnouncements?: string[];
    deaths?: number;
    retainedDrops?: string[];
    superiorGear?: string[];
    superiorGearComparisonIncomplete?: boolean;
}

export interface OfflineHuntMob {
    key: string;
    hitPoints: number;
    level: number;
    defense: number;
    attack: number;
    attackRate: number;
    respawnDelay: number;
    count: number;
    family?: string;
    boss?: boolean;
}

export interface OfflineHuntHealingItem {
    key: string;
    index: number;
    hitPoints: number;
    mana: number;
    count: number;
}

export interface OfflineHuntSnapshot {
    startedAt: number;
    region: number;
    seed: number;
    attackBonus: number;
    attribute: number;
    attackRate: number;
    attackerLevel: number;
    maxHitPoints: number;
    hitPoints: number;
    mana: number;
    maxMana?: number;
    resourceType: 'mana' | 'arrows' | 'none';
    resourceCount: number;
    resourcePerAttack: number;
    dropProbability: number;
    balanceVersion: number;
    weaponFamily?: string;
    masteryLevel?: number;
    cardBonus?: number;
    regionKillCount?: number;
    posture: AutoHuntPosture;
    rules: AutoHuntRule[];
    gambitRules?: GambitRule[];
    unlockedPassiveNodes?: string[];
    passiveBonus?: number;
    passiveDefenseBonus?: number;
    passiveAttackSpeedBonus?: number;
    passiveMaxHitPointsBonus?: number;
    socketedGems?: string[];
    adjacentEnemies?: number;
    healingItems: OfflineHuntHealingItem[];
    mobs: OfflineHuntMob[];
}

export interface AutoHuntPacketData {
    action: 'configure' | 'state' | 'report' | 'unlock-passive' | 'equipment-operation';
    equipmentId?: string;
    operation?: 'forge' | 'repair';
    enabled?: boolean;
    rules?: AutoHuntRule[];
    gambits?: GambitRule[];
    autoRecycleRarities?: AutoRecycleRarity[];
    equipment?: AutoHuntEquipment[];
    nodeId?: string;
    posture?: AutoHuntPosture;
    report?: OfflineHuntReport;
    target?: string;
}
