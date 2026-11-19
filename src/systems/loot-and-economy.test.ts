import assert from 'node:assert/strict';
import test from 'node:test';

import { recycleDrops } from './loot-and-economy';

import { simulateOfflineLoot } from '../engine/offline-simulator';

import type { LootDrop } from './loot-and-economy';

test('recycling protects unclassified loot, cards, relics, and legendary items', () => {
    let protectedDrops: LootDrop[] = [
            { key: 'gold', count: 100, rarity: 'common' },
            { key: 'missing_item', count: 2, rarity: 'common' },
            { key: 'moss_slime_card', count: 1, rarity: 'uncommon' },
            { key: 'relic_of_the_ancient_root', count: 1, rarity: 'epic' },
            { key: 'legendary_aurora_blade', count: 1, rarity: 'common' }
        ],
        result = recycleDrops(protectedDrops, {
            rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary']
        });

    assert.deepEqual(result.kept, protectedDrops);
    assert.deepEqual(result.recycled, []);
});

test('recycling uses the classified item rarity, not a fallback or supplied label', () => {
    let drops: LootDrop[] = [
            { key: 'mosswood_blade', count: 2, rarity: 'common' },
            { key: 'mistcrypt_staff', count: 1, rarity: 'uncommon' }
        ],
        result = recycleDrops(drops, { rarities: ['uncommon'] });

    assert.deepEqual(result.kept, [drops[1]]);
    assert.deepEqual(result.recycled, [
        { key: 'arcane_dust', count: 4, rarity: 'common' },
        { key: 'temper_fragments', count: 2, rarity: 'common' }
    ]);
});

test('offline loot preserves a rolled card when its rarity is selected', () => {
    let result = simulateOfflineLoot({
        seed: 903,
        kills: 1,
        regionKillCount: 0,
        startedAt: 0,
        duration: 0,
        autoRecycle: { rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary'] }
    });

    assert.equal(result.drops.length, 1);
    assert.ok(result.drops[0].key.endsWith('_card'));
    assert.deepEqual(result.recycled, []);
});
