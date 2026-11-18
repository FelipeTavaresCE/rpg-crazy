export type AutoHuntRule =
    | 'heal-low'
    | 'guard-low'
    | 'advance-high'
    | 'balance-low'
    | 'balance-high'
    | 'disabled';
export type AutoHuntPosture = 'balance' | 'advance' | 'guard';

export interface OfflineHuntReport {
    duration: number;
    kills: number;
    experience: number;
    levelsGained?: number;
    lootCollected: number;
    lootOverflow: number;
    reason: string;
    portadorKills?: number;
    legendaryAnnouncements?: string[];
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
    healingItems: OfflineHuntHealingItem[];
    mobs: OfflineHuntMob[];
}

export interface AutoHuntPacketData {
    action: 'configure' | 'state' | 'report';
    enabled?: boolean;
    rules?: AutoHuntRule[];
    posture?: AutoHuntPosture;
    report?: OfflineHuntReport;
    target?: string;
}
