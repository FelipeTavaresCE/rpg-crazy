import items from '../data/items.json';

export interface SocketableItem {
    cardSlots: number;
    cards: string[];
}

export interface SocketBonus {
    attack?: number;
    defense?: number;
    beastDamage?: number;
    undeadDamage?: number;
}

const catalog = items as { [key: string]: { type: string; bonus?: SocketBonus } };

export function socketCard(
    equipment: SocketableItem,
    cardKey: string,
    slot: number
): SocketableItem | undefined {
    if (
        catalog[cardKey]?.type !== 'card' ||
        !Number.isInteger(slot) ||
        slot < 0 ||
        slot >= equipment.cardSlots ||
        equipment.cards[slot]
    )
        return;

    let cards = [...equipment.cards];
    cards[slot] = cardKey;
    return { ...equipment, cards };
}

export function calculateCardAndRelicBonuses(cards: string[], relics: string[]): SocketBonus {
    let result: SocketBonus = {};

    for (let key of [...cards, ...relics]) {
        let bonus = catalog[key]?.bonus;
        if (!bonus) continue;

        for (let [name, value] of Object.entries(bonus)) {
            let keyName = name as keyof SocketBonus;
            result[keyName] = (result[keyName] ?? 0) + (value ?? 0);
        }
    }

    return result;
}
