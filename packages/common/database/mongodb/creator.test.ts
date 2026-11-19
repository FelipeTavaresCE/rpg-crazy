import assert from 'node:assert/strict';
import test from 'node:test';

import Creator from './creator';

import type { Db, MongoClient } from 'mongodb';
import type Player from '@kaetram/server/src/game/entity/character/player/player';
import type { OfflineHuntSnapshot } from '@kaetram/common/network/impl/autohunt';

function makeEquipmentCreator(
    inventorySlots: Array<Record<string, unknown>>,
    equipments: Array<Record<string, unknown>> = []
): {
    creator: Creator;
    writes: Array<{ collection: string; update: unknown; session: unknown }>;
    documents: Record<string, Record<string, unknown>>;
    session: object;
} {
    let writes: Array<{ collection: string; update: unknown; session: unknown }> = [],
        documents: Record<string, Record<string, unknown>> = {
            player_inventory: { slots: inventorySlots },
            player_equipment: { equipments }
        },
        session = {
            withTransaction: async (callback: () => Promise<unknown>) => callback(),
            endSession: async () => {}
        },
        database = {
            collection: (collection: string) => ({
                findOne: async () => documents[collection],
                updateOne: async (
                    _query: unknown,
                    update: unknown,
                    options: { session: unknown }
                ) => {
                    writes.push({ collection, update, session: options.session });
                    Object.assign(
                        documents[collection],
                        (update as { $set: Record<string, unknown> }).$set
                    );
                    return { matchedCount: 1, modifiedCount: 1 };
                }
            })
        },
        creator = new Creator(
            database as unknown as Db,
            { startSession: () => session } as unknown as MongoClient
        );
    return { creator, writes, documents, session };
}

test('offline settlement saves the bank in the guarded Mongo transaction', async () => {
    let writes: Array<{ collection: string; update: unknown; session: unknown }> = [],
        session = {
            withTransaction: async (callback: () => Promise<boolean>) => callback(),
            endSession: async () => {}
        },
        database = {
            collection: (collection: string) => ({
                updateOne: async (
                    _query: unknown,
                    update: unknown,
                    options: { session: unknown }
                ) => {
                    writes.push({ collection, update, session: options.session });
                    return { modifiedCount: 1 };
                }
            })
        },
        player = {
            username: 'test',
            hitPoints: { getHitPoints: () => 10 },
            mana: { getMana: () => 5 },
            inventory: { serialize: () => ({ inventory: true }) },
            equipment: { serialize: () => ({ equipment: true }) },
            bank: { serialize: () => ({ bank: true }) },
            skills: { serialize: () => ({ skills: true }) },
            statistics: { serialize: () => ({ statistics: true }) }
        } as unknown as Player,
        creator = new Creator(
            database as unknown as Db,
            {
                startSession: () => session
            } as unknown as MongoClient
        ),
        snapshot = { startedAt: 1, seed: 2 } as OfflineHuntSnapshot;

    assert.equal(await creator.saveOfflineHuntSettlement(player, snapshot), true);
    let bank = writes.find((write) => write.collection === 'player_bank');
    assert.deepEqual(bank?.update, { $set: { bank: true } });
    assert.equal(bank?.session, session);
});

test('forge deducts materials and updates the item in one transaction', async () => {
    let equipmentInstance = {
            uid: 'gear',
            itemId: 'sword',
            refineLevel: 0,
            isScarred: false,
            socketedCards: [],
            socketedGems: []
        },
        { creator, writes, documents, session } = makeEquipmentCreator([
            { index: 0, key: 'aurora_jewel', count: 1, enchantments: {} },
            { index: 1, key: 'temper_fragments', count: 1, enchantments: {} },
            {
                index: 2,
                key: 'sword',
                count: 1,
                enchantments: {},
                equipmentInstance
            }
        ]);

    let result = await creator.performEquipmentOperation('test', 'gear', 'forge'),
        slots = documents.player_inventory.slots as Array<Record<string, unknown>>;
    assert.equal(result.applied, true);
    assert.equal((slots[0] as { count: number }).count, -1);
    assert.equal(
        (slots[2] as { equipmentInstance: { refineLevel: number } }).equipmentInstance.refineLevel,
        1
    );
    assert.equal(writes.length, 1);
    assert.equal(writes[0].session, session);
});

test('scar repair persists both material and equipped item updates atomically', async () => {
    let equipmentInstance = {
            uid: 'gear',
            itemId: 'sword',
            refineLevel: 3,
            isScarred: true,
            socketedCards: [],
            socketedGems: []
        },
        { creator, writes, documents, session } = makeEquipmentCreator(
            [{ index: 0, key: 'purified_relic', count: 1, enchantments: {} }],
            [
                {
                    type: 0,
                    key: 'sword',
                    count: 1,
                    enchantments: {},
                    equipmentInstance
                }
            ]
        );

    let result = await creator.performEquipmentOperation('test', 'gear', 'repair'),
        storedEquipment = documents.player_equipment.equipments as Array<{
            equipmentInstance: { isScarred: boolean };
        }>;
    assert.equal(result.applied, true);
    assert.equal(storedEquipment[0].equipmentInstance.isScarred, false);
    assert.equal((documents.player_inventory.slots as Array<{ count: number }>)[0].count, -1);
    assert.equal(writes.length, 2);
    assert.ok(writes.every((write) => write.session === session));
});

test('forge rejects insufficient materials without writing either document', async () => {
    let { creator, writes } = makeEquipmentCreator([
        { index: 0, key: 'aurora_jewel', count: 1, enchantments: {} },
        {
            index: 1,
            key: 'sword',
            count: 1,
            enchantments: {},
            equipmentInstance: {
                uid: 'gear',
                itemId: 'sword',
                refineLevel: 0,
                isScarred: false,
                socketedCards: [],
                socketedGems: []
            }
        }
    ]);

    let result = await creator.performEquipmentOperation('test', 'gear', 'forge');
    assert.equal(result.applied, false);
    assert.equal(writes.length, 0);
});
