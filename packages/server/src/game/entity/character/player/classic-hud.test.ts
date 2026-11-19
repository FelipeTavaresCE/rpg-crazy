import assert from 'node:assert/strict';
import test from 'node:test';

import '../character';
import Player from './player';

import type { AutoHuntPacketData } from '@kaetram/common/network/impl/autohunt';

function fixture() {
    let states = 0,
        saves = 0,
        player = {
            ready: true,
            autoHuntEnabled: true,
            autoHuntPosture: 'balance',
            autoRecycleRarities: [],
            gambitRules: [],
            autoHuntRules: ['heal-low'],
            sendAutoHuntState: () => states++,
            save: () => {
                saves++;
                return Promise.resolve();
            },
            stopAutoHunt: () => {
                throw new Error('partial configuration must not stop hunting');
            }
        } as unknown as Player;
    return { player, states: () => states, saves: () => saves };
}

test('partial HUD configuration preserves auto-hunt and synchronizes changes', () => {
    let { player, states, saves } = fixture(),
        gambits = [
            {
                id: 'attack',
                condition: { type: 'ALWAYS' as const },
                action: { type: 'ATTACK_NEAREST' as const }
            }
        ];
    Player.prototype.configureAutoHunt.call(player, {
        action: 'configure',
        posture: 'guard',
        gambits,
        autoRecycleRarities: ['rare']
    });
    assert.equal(player.autoHuntEnabled, true);
    assert.equal(player.autoHuntPosture, 'guard');
    assert.deepEqual(player.gambitRules, [{ ...gambits[0], enabled: true }]);
    assert.deepEqual(player.autoRecycleRarities, ['rare']);
    assert.equal(states(), 1);
    assert.equal(saves(), 1);
});

test('invalid HUD configuration is rejected atomically', () => {
    let { player, states, saves } = fixture();
    Player.prototype.configureAutoHunt.call(player, {
        action: 'configure',
        posture: 'advance',
        autoRecycleRarities: ['invalid']
    } as unknown as AutoHuntPacketData);
    assert.equal(player.autoHuntPosture, 'balance');
    assert.deepEqual(player.autoRecycleRarities, []);
    assert.equal(states(), 1);
    assert.equal(saves(), 0);
});

test('legendary cannot be selected for recycling', () => {
    let { player, states, saves } = fixture();
    Player.prototype.configureAutoHunt.call(player, {
        action: 'configure',
        autoRecycleRarities: ['legendary']
    } as unknown as AutoHuntPacketData);
    assert.deepEqual(player.autoRecycleRarities, []);
    assert.equal(states(), 1);
    assert.equal(saves(), 0);
});

test('invalid gambit requests do not replace the current rules', () => {
    let { player, states, saves } = fixture();
    Player.prototype.configureAutoHunt.call(player, {
        action: 'configure',
        gambits: [
            {
                id: 'bad',
                condition: { type: 'ALWAYS' },
                action: { type: 'SWITCH_STANCE', stance: 'invalid' }
            }
        ]
    } as unknown as AutoHuntPacketData);
    assert.deepEqual(player.gambitRules, []);
    assert.equal(states(), 1);
    assert.equal(saves(), 0);
});

test('HUD state contains owned equipped and inventory instances only', () => {
    let first = {
            uid: 'equipped',
            socketedCards: ['card'],
            socketedGems: [],
            refineLevel: 2,
            isScarred: false
        },
        second = { ...first, uid: 'inventory', socketedCards: [] },
        packet: { data?: AutoHuntPacketData } | undefined,
        player = {
            equipment: {
                forEachEquipment: (callback: (item: unknown) => void) =>
                    callback({ type: 0, name: 'Sword', equipmentInstance: first })
            },
            inventory: {
                forEachSlot: (callback: (slot: unknown) => void) =>
                    callback({ index: 1, name: 'Shield', equipmentInstance: second })
            },
            send: (value: { data?: AutoHuntPacketData }) => (packet = value),
            gambitRules: [],
            autoHuntRules: [],
            autoRecycleRarities: [],
            autoHuntPosture: 'balance',
            autoHuntEnabled: false
        } as unknown as Player;
    Player.prototype.sendAutoHuntState.call(player);
    assert.deepEqual(packet?.data?.equipment?.map((item) => item.id), ['equipped', 'inventory']);
    assert.deepEqual(packet?.data?.equipment?.[0].cards, ['card']);
});

test('equipment changes are coalesced after the mutation completes', async () => {
    let sent: number[] = [],
        value = 0,
        player = {
            ready: true,
            connection: { closed: false },
            sendAutoHuntState() {
                sent.push(value);
            }
        } as unknown as Player;
    Player.prototype.queueAutoHuntState.call(player);
    value = 1;
    Player.prototype.queueAutoHuntState.call(player);
    value = 2;
    await Promise.resolve();
    assert.deepEqual(sent, [2]);
});
