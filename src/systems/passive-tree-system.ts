export interface PassiveBonuses {
    attack: number;
    defense: number;
    attackSpeed: number;
    maxHitPoints: number;
}

export interface PassiveNode {
    id: string;
    requiredLevel: number;
    requires?: string;
    bonuses: Partial<PassiveBonuses>;
}

export const PASSIVE_NODES: { [key: string]: PassiveNode } = {
    constellation_root: {
        id: 'constellation_root',
        requiredLevel: 2,
        bonuses: { attack: 0.02 }
    },
    sharpened_edge: {
        id: 'sharpened_edge',
        requiredLevel: 5,
        requires: 'constellation_root',
        bonuses: { attack: 0.04 }
    },
    vital_core: {
        id: 'vital_core',
        requiredLevel: 5,
        requires: 'constellation_root',
        bonuses: { maxHitPoints: 0.08 }
    },
    swift_strikes: {
        id: 'swift_strikes',
        requiredLevel: 10,
        requires: 'sharpened_edge',
        bonuses: { attackSpeed: 0.05 }
    },
    guardian_shell: {
        id: 'guardian_shell',
        requiredLevel: 10,
        requires: 'vital_core',
        bonuses: { defense: 0.08 }
    },
    celestial_force: {
        id: 'celestial_force',
        requiredLevel: 15,
        requires: 'sharpened_edge',
        bonuses: { attack: 0.1 }
    }
};

export function getPassivePoints(level: number): number {
    return Math.max(0, Math.floor(Number.isFinite(level) ? level : 0) - 1);
}

export function unlockPassiveNode(
    unlockedNodes: string[],
    nodeId: string,
    level: number
): string[] | undefined {
    let node = PASSIVE_NODES[nodeId],
        unlocked = [...new Set(unlockedNodes.filter((id) => PASSIVE_NODES[id]))];
    if (
        !node ||
        unlocked.includes(nodeId) ||
        level < node.requiredLevel ||
        unlocked.length >= getPassivePoints(level) ||
        (node.requires && !unlocked.includes(node.requires))
    )
        return;

    return [...unlocked, nodeId];
}

export function calculatePassiveBonuses(unlockedNodes: string[]): PassiveBonuses {
    let result: PassiveBonuses = { attack: 0, defense: 0, attackSpeed: 0, maxHitPoints: 0 };

    for (let id of new Set(unlockedNodes)) {
        let node = PASSIVE_NODES[id];
        if (!node) continue;

        result.attack += node.bonuses.attack ?? 0;
        result.defense += node.bonuses.defense ?? 0;
        result.attackSpeed += node.bonuses.attackSpeed ?? 0;
        result.maxHitPoints += node.bonuses.maxHitPoints ?? 0;
    }

    return result;
}
