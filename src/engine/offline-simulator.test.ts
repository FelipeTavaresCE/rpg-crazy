import assert from 'node:assert/strict';
import test from 'node:test';

import {
    collectOfflineDrops,
    isSuperiorOfflineGear,
    simulateOfflineCombat,
    summarizeSuperiorOfflineGear
} from './offline-simulator';

import items from '../data/items.json';

import type { OfflineCombatInput } from './offline-simulator';
import type { LootDrop } from '../systems/loot-and-economy';

function combat(overrides: Partial<OfflineCombatInput> = {}): OfflineCombatInput {
    return {
        duration: 3000,
        killLimit: 10,
        attackInterval: 1000,
        travelTime: 0,
        attacksPerKill: 2,
        damagePerAttack: 50,
        targetHitPoints: 100,
        enemyAttackInterval: 1000,
        enemyDamage: 0,
        lifeStealPerAttack: 0,
        regenerationPerSecond: 0,
        hitPoints: 100,
        maxHitPoints: 100,
        resourceType: 'none',
        resourceCount: 0,
        mana: 5,
        maxMana: 10,
        resourcePerAttack: 0,
        healingItems: [],
        shouldHeal: () => false,
        ...overrides
    };
}

test('a lethal hit stops the hunt and respawns once without healing after death', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 4000,
            attackInterval: 3000,
            enemyDamage: 100,
            healingItems: [{ key: 'potion', index: 0, count: 10, hitPoints: 100, mana: 0 }],
            shouldHeal: (hp) => hp < 50
        })
    );
    assert.equal(result.deaths, 1);
    assert.equal(result.kills, 0);
    assert.equal(result.hitPoints, 100);
    assert.equal(result.mana, 10);
    assert.deepEqual(result.healingUsed, [0]);
});

test('healing occurs after a nonlethal hit and is capped at maximum', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 2500,
            attackInterval: 5000,
            enemyDamage: 60,
            healingItems: [{ key: 'potion', index: 0, count: 1, hitPoints: 100, mana: 3 }],
            shouldHeal: (hp) => hp < 50
        })
    );
    assert.equal(result.deaths, 0);
    assert.equal(result.hitPoints, 40);
    assert.equal(result.mana, 8);
    assert.deepEqual(result.healingUsed, [1]);
});

test('failed fights consume resources and do not award kills', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 5000,
            resourceType: 'arrows',
            resourceCount: 3,
            resourcePerAttack: 1
        })
    );
    assert.equal(result.attacks, 3);
    assert.equal(result.kills, 1);
    assert.equal(result.damage, 150);
    assert.equal(result.resourceCount, 0);
});

test('damage from attempts lost on death is included without granting a kill', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 3000,
            attacksPerKill: 5,
            damagePerAttack: 20,
            enemyAttackInterval: 1500,
            enemyDamage: 100
        })
    );
    assert.equal(result.kills, 0);
    assert.equal(result.deaths, 1);
    assert.equal(result.damage, 20);
});

test('travel takes time without consuming attacks and the last hit is capped', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 8000,
            travelTime: 2500,
            damagePerAttack: 60,
            enemyAttackInterval: 20_000,
            resourceType: 'arrows',
            resourceCount: 3,
            resourcePerAttack: 1
        })
    );
    assert.equal(result.attacks, 3);
    assert.equal(result.kills, 1);
    assert.equal(result.damage, 160);
    assert.equal(result.resourceCount, 0);
});

test('an engaged enemy continues attacking after resources run out', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 5000,
            resourceType: 'mana',
            mana: 1,
            maxMana: 1,
            resourceCount: 1,
            resourcePerAttack: 1,
            enemyDamage: 60
        })
    );
    assert.equal(result.deaths, 1);
    assert.equal(result.attacks, 1);
    assert.equal(result.kills, 0);
    assert.equal(result.hitPoints, 100);
    assert.equal(result.mana, 1);
});

test('regeneration is per second and mana is restored on actual death', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 2500,
            hitPoints: 30,
            enemyDamage: 50,
            regenerationPerSecond: 10,
            attackInterval: 5000,
            resourceType: 'mana',
            resourceCount: 5
        })
    );
    assert.equal(result.deaths, 1);
    assert.equal(result.hitPoints, 100);
    assert.equal(result.resourceCount, 10);
});

test('a dead snapshot respawns once without earning kills or consuming resources', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 28_800_000,
            hitPoints: 0,
            resourceType: 'arrows',
            resourceCount: 10,
            resourcePerAttack: 1
        })
    );
    assert.equal(result.deaths, 1);
    assert.equal(result.hitPoints, 100);
    assert.equal(result.mana, 10);
    assert.equal(result.kills, 0);
    assert.equal(result.attacks, 0);
    assert.equal(result.resourceCount, 10);
});

test('death ends a long hunt without repeatedly restoring mana or awarding kills', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 28_800_000,
            attackInterval: 1000,
            enemyAttackInterval: 1500,
            enemyDamage: 100,
            resourceType: 'mana',
            mana: 1,
            maxMana: 1,
            resourceCount: 1,
            resourcePerAttack: 1
        })
    );
    assert.equal(result.deaths, 1);
    assert.equal(result.attacks, 1);
    assert.equal(result.kills, 0);
    assert.equal(result.damage, 50);
    assert.equal(result.mana, 1);
});

test('completed kills and partial damage before death remain credited', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 10_000,
            enemyAttackInterval: 1500,
            enemyDamage: 60
        })
    );
    assert.equal(result.deaths, 1);
    assert.equal(result.kills, 1);
    assert.equal(result.attacks, 3);
    assert.equal(result.damage, 150);
});

test('retained drops only include kept keys actually accepted by inventory', () => {
    let kept: LootDrop[] = [
            { key: 'sword', count: 2, rarity: 'rare' },
            { key: 'full', count: 1, rarity: 'rare' },
            { key: 'sword', count: 1, rarity: 'rare' }
        ],
        recycled: LootDrop[] = [{ key: 'dust', count: 4, rarity: 'common' }],
        result = collectOfflineDrops(kept, recycled, (key, count) =>
            key === 'full' ? -2 : key === 'sword' ? 1 : count
        );
    assert.deepEqual(result, { collected: 5, overflow: 3, retainedDrops: ['sword'] });
});

test('idle time regenerates even after reaching the kill limit', () => {
    let result = simulateOfflineCombat(
        combat({
            duration: 10_000,
            killLimit: 1,
            attacksPerKill: 1,
            hitPoints: 50,
            regenerationPerSecond: 10
        })
    );
    assert.equal(result.kills, 1);
    assert.equal(result.hitPoints, 100);
});

test('mana potions are not wasted when the mana cap cannot fund an attack', () => {
    let result = simulateOfflineCombat(
        combat({
            resourceType: 'mana',
            resourceCount: 5,
            resourcePerAttack: 11,
            healingItems: [{ key: 'potion', index: 0, count: 100, hitPoints: 0, mana: 10 }],
            shouldHeal: () => true
        })
    );
    assert.equal(result.attacks, 0);
    assert.deepEqual(result.healingUsed, [0]);
});

test('invalid inputs do not enter the event loop', () => {
    let result = simulateOfflineCombat(combat({ duration: Infinity, enemyAttackInterval: 0 }));
    assert.equal(result.attacks, 0);
    assert.equal(result.deaths, 0);
});

test('superior gear compares complete scalar stats and actual instance modifiers', () => {
    let instance = { refineLevel: 0, socketedCards: [], socketedGems: [] },
        candidate = { template: { attack: 20, defense: 5 }, instance },
        equipped = { template: { attack: 10, defense: 5 }, instance };
    assert.equal(isSuperiorOfflineGear(candidate, equipped), true);
    assert.equal(
        isSuperiorOfflineGear(candidate, {
            ...equipped,
            instance: { ...instance, socketedCards: ['card', 'card'] }
        }),
        false
    );
    assert.equal(isSuperiorOfflineGear(equipped, equipped), false);
});

test('superior gear permits a missing scalar only when another scalar is present', () => {
    let instance = { refineLevel: 0, socketedCards: [], socketedGems: [] },
        candidate = { template: { attack: 20 }, instance },
        equipped = { template: { attack: 10, defense: 0 }, instance };
    assert.equal(isSuperiorOfflineGear(candidate), true);
    assert.equal(isSuperiorOfflineGear(candidate, equipped), true);
    assert.equal(isSuperiorOfflineGear(equipped, candidate), false);
    assert.equal(
        isSuperiorOfflineGear(
            { template: { defense: 10 }, instance },
            { template: { defense: 5 }, instance }
        ),
        true
    );
    assert.equal(isSuperiorOfflineGear({ template: {}, instance }, equipped), undefined);
    assert.equal(isSuperiorOfflineGear(equipped, { template: equipped.template }), undefined);
    assert.equal(
        isSuperiorOfflineGear({ template: { attack: Number.NaN, defense: 0 }, instance }, equipped),
        undefined
    );
});

test('superior gear reports unavailable and mixed comparisons without hiding confirmed gear', () => {
    let instance = { refineLevel: 0, socketedCards: [], socketedGems: [] },
        candidate = { template: { attack: 20 }, instance },
        superior = {
            key: 'superior',
            candidate,
            equipped: { template: { attack: 10 }, instance }
        },
        legacy = { key: 'legacy', candidate, equipped: { template: {}, instance } };
    assert.deepEqual(summarizeSuperiorOfflineGear([]), {
        superiorGear: [],
        superiorGearComparisonIncomplete: undefined
    });
    assert.deepEqual(summarizeSuperiorOfflineGear([legacy]), {
        superiorGear: undefined,
        superiorGearComparisonIncomplete: true
    });
    assert.deepEqual(summarizeSuperiorOfflineGear([superior, legacy]), {
        superiorGear: ['superior'],
        superiorGearComparisonIncomplete: true
    });
    assert.deepEqual(
        summarizeSuperiorOfflineGear([
            { ...superior, candidate: { template: { attack: 5 }, instance } }
        ]),
        { superiorGear: [], superiorGearComparisonIncomplete: undefined }
    );
});

test('superior gear scores actual single-scalar templates', () => {
    let instance = { refineLevel: 0, socketedCards: [], socketedGems: [] };
    assert.equal(
        isSuperiorOfflineGear(
            { template: items.mistcrypt_staff, instance },
            { template: items.mosswood_blade, instance }
        ),
        true
    );
    assert.equal(
        isSuperiorOfflineGear(
            { template: items.mistcrypt_armor, instance },
            { template: items.mosswood_armor, instance }
        ),
        true
    );
});
