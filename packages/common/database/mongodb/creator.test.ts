import assert from 'node:assert/strict';
import test from 'node:test';

import Creator from './creator';

import type { Db, MongoClient } from 'mongodb';
import type Player from '@kaetram/server/src/game/entity/character/player/player';
import type { OfflineHuntSnapshot } from '@kaetram/common/network/impl/autohunt';

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
