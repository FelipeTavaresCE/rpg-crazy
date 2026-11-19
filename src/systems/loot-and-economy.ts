import items from '../data/items.json';
import monsters from '../data/monsters.json';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type RandomSource = () => number;

export interface LootItemData {
    type: string;
    rarity: ItemRarity;
    scrapValue: number;
    globalAnnouncement?: boolean;
}

export interface LootDrop {
    key: string;
    count: number;
    rarity: ItemRarity;
    announceGlobally?: boolean;
}

export interface AutoRecycleSettings {
    rarities: ItemRarity[];
}

export interface EconomyResult {
    drops: LootDrop[];
    portadorKills: number;
    regionKillCount: number;
}

const rarityValues = new Set<ItemRarity>(['common', 'uncommon', 'rare', 'epic', 'legendary']),
    itemData = items as { [key: string]: LootItemData },
    monsterData = monsters as { [key: string]: { card: string; relic?: string } },
    cardKeys = [...new Set(Object.values(monsterData).map((monster) => monster.card))],
    relicKeys = Object.keys(itemData).filter((key) => itemData[key]?.type === 'relic'),
    legendaryKeys = Object.keys(itemData).filter(
        (key) => itemData[key]?.rarity === 'legendary' && itemData[key]?.globalAnnouncement
    );

export function isPortadorKill(regionKillCount: number): boolean {
    return regionKillCount > 0 && regionKillCount % 100 === 0;
}

export function getItemRarity(key: string): ItemRarity | undefined {
    return itemData[key]?.rarity;
}

export function rollEconomyDrops(
    random: RandomSource,
    regionKillCount: number,
    eclipse: boolean
): EconomyResult {
    let drops: LootDrop[] = [],
        portadorKills = 0;

    if (isPortadorKill(regionKillCount)) {
        portadorKills = 1;
        drops.push({
            key: 'relic_fragment',
            count: 1 + Math.floor(random() * 3),
            rarity: 'common'
        });
    }

    if (random() < (portadorKills ? 0.02 : 0.0002) && relicKeys.length > 0) {
        let key = relicKeys[Math.floor(random() * relicKeys.length)]!;
        drops.push({ key, count: 1, rarity: itemData[key]!.rarity });
    }

    if (random() < 0.0001 && cardKeys.length > 0) {
        let key = cardKeys[Math.floor(random() * cardKeys.length)]!;
        drops.push({ key, count: 1, rarity: itemData[key]!.rarity });
    }

    if (random() < 0.000_002 && legendaryKeys.length > 0) {
        let key = legendaryKeys[Math.floor(random() * legendaryKeys.length)]!;
        drops.push({
            key,
            count: 1,
            rarity: itemData[key]!.rarity,
            announceGlobally: true
        });
    }

    if (eclipse && random() < 0.01)
        drops.push({ key: 'eclipse_essence', count: 1, rarity: 'epic' });

    return { drops, portadorKills, regionKillCount };
}

export function recycleDrops(
    drops: LootDrop[],
    settings: AutoRecycleSettings
): { kept: LootDrop[]; recycled: LootDrop[] } {
    let selected = new Set(settings.rarities.filter((rarity) => rarityValues.has(rarity))),
        kept: LootDrop[] = [],
        recycled: LootDrop[] = [];

    for (let drop of drops) {
        if (!selected.has(drop.rarity)) {
            kept.push(drop);
            continue;
        }

        let value = Math.max(1, itemData[drop.key]?.scrapValue ?? 1);
        recycled.push(
            {
                key: 'arcane_dust',
                count: value * drop.count,
                rarity: 'common'
            },
            {
                key: 'temper_fragments',
                count: Math.max(1, Math.ceil(value / 2)) * drop.count,
                rarity: 'common'
            }
        );
    }

    return { kept, recycled };
}
