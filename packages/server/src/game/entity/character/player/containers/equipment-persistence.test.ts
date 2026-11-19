import assert from 'node:assert/strict';
import test from 'node:test';

import '../../character';
import Bank from './impl/bank';
import Inventory from './impl/inventory';

import Item from '../../../objects/item';
import Equipment from '../equipment/equipment';
import Equipments from '../equipments';
import Trade from '../trade';
import Player from '../player';
import LootBag from '../../../objects/lootbag';
import Stores from '../../../../../controllers/stores';

import Creator from '@kaetram/common/database/mongodb/creator';
import { Modules } from '@kaetram/common/network';

function makePlayer(instance: string): Player {
    let value = {
        instance,
        username: instance,
        inventory: new Inventory(2),
        notify: () => {},
        send: () => {}
    } as unknown as Player;
    value.trade = new Trade(value);
    return value;
}

test('equipment has independent identities and copies retain their state', () => {
    let first = new Item('coppersword', -1, -1, true, 1),
        second = new Item('coppersword', -1, -1, true, 1);
    assert.ok(first.equipmentInstance?.uid);
    assert.notEqual(first.equipmentInstance.uid, second.equipmentInstance?.uid);
    first.equipmentInstance.refineLevel = 4;
    first.equipmentInstance.isScarred = true;
    first.equipmentInstance.socketedCards.push('card');
    let copy = first.copy();
    assert.deepEqual(copy.equipmentInstance, first.equipmentInstance);
    copy.equipmentInstance!.socketedCards.push('other');
    assert.deepEqual(first.equipmentInstance.socketedCards, ['card']);
});

test('bank transfers and slot swaps preserve distinct equipment identities', () => {
    let inventory = new Inventory(3),
        bank = new Bank(3),
        first = new Item('coppersword', -1, -1, true, 1),
        second = new Item('coppersword', -1, -1, true, 1);
    first.equipmentInstance!.socketedGems.push('gem');
    inventory.add(first);
    inventory.add(second);
    inventory.swap(0, inventory, 1);
    assert.equal(inventory.get(0).equipmentInstance?.uid, second.equipmentInstance!.uid);
    inventory.move(1, bank);
    assert.deepEqual(bank.get(0).equipmentInstance, first.equipmentInstance);
    assert.equal(bank.get(0).count, 1);
    bank.move(0, inventory);
    assert.deepEqual(inventory.get(1).equipmentInstance, first.equipmentInstance);
});

test('legacy bank stacks migrate without losing overflow across serialization', async () => {
    let bank = new Bank(2);
    bank.load([
        { index: 0, key: 'coppersword', count: 4, enchantments: {} },
        { index: 1, key: 'tinsword', count: 1, enchantments: {} }
    ]);
    let saved = bank.serialize();
    assert.equal(saved.slots.filter((slot) => slot.key === 'coppersword').length, 4);
    assert.equal(
        new Set(
            saved.slots
                .filter((slot) => slot.key === 'coppersword')
                .map((slot) => slot.equipmentInstance?.uid)
        ).size,
        4
    );
    let restored = new Bank(2);
    restored.load(saved.slots);
    restored.remove(0);
    await Promise.resolve();
    assert.equal(restored.get(0).key, 'coppersword');
    assert.equal(restored.serialize().slots.filter((slot) => slot.key === 'coppersword').length, 3);
    assert.equal(restored.serialize(true).slots.length, 2);
});

test('bulk equipment adds create separate instances and retain uncollected remainder', () => {
    let inventory = new Inventory(2),
        item = new Item('coppersword', -1, -1, true, 3),
        original = item.equipmentInstance!.uid;
    assert.equal(inventory.add(item), 2);
    assert.equal(inventory.get(0).equipmentInstance?.uid, original);
    assert.notEqual(
        inventory.get(0).equipmentInstance?.uid,
        inventory.get(1).equipmentInstance?.uid
    );
    assert.equal(item.count, 1);
    assert.notEqual(item.equipmentInstance?.uid, original);
    assert.notEqual(item.equipmentInstance?.uid, inventory.get(1).equipmentInstance?.uid);
});

test('arrows remain stackable through bank and inventory', () => {
    let inventory = new Inventory(2),
        bank = new Bank(2);
    inventory.add(new Item('arrow', -1, -1, true, 30));
    inventory.add(new Item('arrow', -1, -1, true, 20));
    assert.equal(inventory.get(0).count, 50);
    assert.equal(inventory.get(0).equipmentInstance, undefined);
    inventory.swap(0, bank);
    assert.equal(bank.get(0).count, 1);
    assert.equal(inventory.get(0).count, 49);
});

test('equipment and drop callback carry the exact instance', () => {
    let inventory = new Inventory(1),
        item = new Item('coppersword', -1, -1, true, 1),
        equipped = new Equipment(Modules.Equipment.Weapon),
        dropped = undefined as typeof item.equipmentInstance;
    item.equipmentInstance!.refineLevel = 2;
    inventory.add(item);
    inventory.onRemove((_slot, _key, _count, _enchantments, _drop, instance) => {
        dropped = instance;
    });
    equipped.update(inventory.getItem(inventory.get(0)));
    assert.deepEqual(equipped.serialize().equipmentInstance, item.equipmentInstance);
    inventory.remove(0, 1, true);
    assert.deepEqual(dropped, item.equipmentInstance);
});

test('equip, replacement, unequip and login preserve item identities', () => {
    let player = makePlayer('equip'),
        first = new Item('coppersword', -1, -1, true, 1),
        second = new Item('tinsword', -1, -1, true, 1);
    Object.assign(player, {
        sync: () => {},
        getLastAttackStyle: () => {}
    });
    player.equipment = new Equipments(player);
    player.inventory.add(first);
    player.inventory.add(second);
    player.equipment.equip(player.inventory.getItem(player.inventory.get(0)), 0);
    assert.deepEqual(player.equipment.getWeapon().equipmentInstance, first.equipmentInstance);
    player.equipment.equip(player.inventory.getItem(player.inventory.get(1)), 1);
    assert.deepEqual(player.equipment.getWeapon().equipmentInstance, second.equipmentInstance);
    assert.deepEqual(player.inventory.get(0).equipmentInstance, first.equipmentInstance);
    let saved = player.equipment.serialize(),
        restored = new Equipments(player);
    restored.load(saved.equipments);
    assert.deepEqual(restored.getWeapon().equipmentInstance, second.equipmentInstance);
    player.equipment.unequip(Modules.Equipment.Weapon);
    assert.deepEqual(player.inventory.get(1).equipmentInstance, second.equipmentInstance);
});

test('trade transfers the offered instance and rejects a replaced slot', () => {
    let first = makePlayer('first'),
        second = makePlayer('second'),
        item = new Item('coppersword', -1, -1, true, 1);
    item.equipmentInstance!.socketedCards.push('card');
    first.inventory.add(item);
    first.trade.open(second);
    first.trade.add(0);
    first.trade.accept();
    second.trade.accept();
    assert.deepEqual(second.inventory.get(0).equipmentInstance, item.equipmentInstance);

    first.trade.open(second);
    second.trade.add(0);
    second.inventory.remove(0);
    let replacement = new Item('coppersword', -1, -1, true, 1);
    second.inventory.add(replacement);
    first.trade.accept();
    second.trade.accept();
    assert.equal(
        second.inventory.get(0).equipmentInstance?.uid,
        replacement.equipmentInstance!.uid
    );
    assert.equal(first.inventory.get(0).isEmpty(), true);
});

test('trade accepts a partial stack into a full inventory with room in that stack', () => {
    let first = makePlayer('first'),
        second = makePlayer('second'),
        gear = new Item('coppersword', -1, -1, true, 1);
    first.inventory.add(new Item('gold', -1, -1, true, 50));
    first.inventory.add(gear);
    second.inventory.add(new Item('gold', -1, -1, true, 40));
    first.trade.open(second);
    second.trade.add(0, 20);
    first.trade.accept();
    second.trade.accept();
    assert.equal(first.inventory.get(0).count, 70);
    assert.equal(second.inventory.get(0).count, 20);
    assert.equal(first.inventory.get(1).equipmentInstance?.uid, gear.equipmentInstance?.uid);
});

test('trade accounts for space freed in partially offered stacks', () => {
    let first = makePlayer('first'),
        second = makePlayer('second');
    first.inventory.add(new Item('gold', -1, -1, true, 100));
    first.inventory.add(new Item('coppersword', -1, -1, true, 1));
    second.inventory.add(new Item('gold', -1, -1, true, 100));
    second.inventory.add(new Item('tinsword', -1, -1, true, 1));
    first.trade.open(second);
    first.trade.add(0, 40);
    second.trade.add(0, 30);
    first.trade.accept();
    second.trade.accept();
    assert.equal(first.inventory.get(0).count, 90);
    assert.equal(second.inventory.get(0).count, 110);
});

test('trade rejects combined incoming stacks that exceed remaining capacity', () => {
    let first = makePlayer('first'),
        second = makePlayer('second'),
        max = Modules.Constants.MAX_STACK;
    first.inventory.add(new Item('gold', -1, -1, true, max - 3));
    first.inventory.add(new Item('coppersword', -1, -1, true, 1));
    second.inventory.load([
        { index: 0, key: 'gold', count: 2, enchantments: {} },
        { index: 1, key: 'gold', count: 2, enchantments: {} }
    ]);
    first.trade.open(second);
    second.trade.add(0, 2);
    second.trade.add(1, 2);
    first.trade.accept();
    second.trade.accept();
    assert.equal(first.inventory.get(0).count, max - 3);
    assert.equal(second.inventory.get(0).count, 2);
    assert.equal(second.inventory.get(1).count, 2);
    assert.equal(first.trade.accepted, false);
});

test('trade does not merge enchanted items into occupied slots', () => {
    let first = makePlayer('first'),
        second = makePlayer('second'),
        enchantments = { 0: { level: 1 } };
    first.inventory.add(new Item('gold', -1, -1, true, 10, enchantments));
    first.inventory.add(new Item('coppersword', -1, -1, true, 1));
    second.inventory.add(new Item('gold', -1, -1, true, 10, enchantments));
    first.trade.open(second);
    second.trade.add(0, 1);
    first.trade.accept();
    second.trade.accept();
    assert.equal(first.inventory.get(0).count, 10);
    assert.equal(second.inventory.get(0).count, 10);
    assert.equal(first.trade.accepted, false);
});

test('trade never merges distinct equipment instances of the same key', () => {
    let first = makePlayer('first'),
        second = makePlayer('second'),
        owned = new Item('coppersword', -1, -1, true, 1),
        offered = new Item('coppersword', -1, -1, true, 1);
    first.inventory.add(owned);
    first.inventory.add(new Item('tinsword', -1, -1, true, 1));
    second.inventory.add(offered);
    first.trade.open(second);
    second.trade.add(0);
    first.trade.accept();
    second.trade.accept();
    assert.equal(first.inventory.get(0).equipmentInstance?.uid, owned.equipmentInstance?.uid);
    assert.equal(second.inventory.get(0).equipmentInstance?.uid, offered.equipmentInstance?.uid);
    assert.equal(first.trade.accepted, false);
});

test('legacy socket maps are assigned once with equipped gear first', () => {
    let equipped = new Equipment(Modules.Equipment.Weapon),
        oldItem = new Item('coppersword', -1, -1, true, 1),
        inventory = new Inventory(2),
        bank = new Bank(2),
        cards = { coppersword: ['card'], tinsword: ['other'] },
        gems = { coppersword: ['gem'] };
    oldItem.legacyEquipment = true;
    equipped.update(oldItem);
    inventory.load([{ index: 0, key: 'coppersword', count: 1, enchantments: {} }]);
    bank.load([{ index: 0, key: 'tinsword', count: 1, enchantments: {} }]);
    let fakePlayer = {
            username: 'test',
            socketedCards: cards,
            socketedGems: gems,
            inventory,
            bank,
            equipment: {
                forEachEquipment: (callback: (equipment: Equipment) => void) => callback(equipped),
                refresh: () => {}
            }
        },
        migrate = (
            Player.prototype as unknown as {
                migrateLegacySockets(this: typeof fakePlayer): void;
            }
        ).migrateLegacySockets;
    migrate.call(Object.assign(Object.create(Player.prototype), fakePlayer));
    assert.deepEqual(equipped.equipmentInstance?.socketedCards, ['card']);
    assert.deepEqual(equipped.equipmentInstance?.socketedGems, ['gem']);
    assert.deepEqual(inventory.get(0).equipmentInstance?.socketedCards, []);
    assert.deepEqual(bank.get(0).equipmentInstance?.socketedCards, ['other']);
    assert.deepEqual(cards, {});
    assert.deepEqual(gems, {});
});

test('interrupted socket migration recovers its target without duplicating cards', () => {
    let inventory = new Inventory(2),
        bank = new Bank(1),
        equipped = new Equipment(Modules.Equipment.Weapon),
        oldItem = new Item('coppersword', -1, -1, true, 1),
        makeState = () => ({
            username: 'migration-test',
            socketedCards: { coppersword: ['card'] },
            socketedGems: {},
            inventory,
            bank,
            equipment: {
                forEachEquipment: (callback: (equipment: Equipment) => void) => callback(equipped),
                refresh: () => {}
            }
        }),
        migrate = (
            Player.prototype as unknown as {
                migrateLegacySockets(this: ReturnType<typeof makeState>): boolean;
            }
        ).migrateLegacySockets;
    oldItem.legacyEquipment = true;
    equipped.update(oldItem);
    inventory.load([{ index: 0, key: 'coppersword', count: 1, enchantments: {} }]);
    assert.equal(migrate.call(Object.assign(Object.create(Player.prototype), makeState())), true);
    let saved = equipped.serialize();
    equipped.update(
        new Item(
            saved.key,
            -1,
            -1,
            true,
            saved.count,
            saved.enchantments,
            '',
            saved.equipmentInstance
        )
    );
    let replay = makeState();
    assert.equal(migrate.call(Object.assign(Object.create(Player.prototype), replay)), true);
    assert.deepEqual(equipped.equipmentInstance?.socketedCards, ['card']);
    assert.deepEqual(inventory.get(0).equipmentInstance?.socketedCards, []);
    assert.deepEqual(replay.socketedCards, {});
});

test('migration persists all gear before clearing legacy maps', async () => {
    let writes: string[] = [],
        creator = new Creator(
            {
                collection: (name: string) => ({
                    updateOne: async () => {
                        writes.push(name);
                        return { matchedCount: 1 };
                    }
                })
            } as never,
            {} as never
        ),
        player = {
            username: 'test',
            equipment: { serialize: () => ({}) },
            inventory: { serialize: () => ({}) },
            bank: { serialize: () => ({}) },
            socketedCards: {},
            socketedGems: {}
        } as unknown as Player;
    await creator.saveLegacyEquipmentMigration(player);
    assert.deepEqual(writes, [
        'player_equipment',
        'player_inventory',
        'player_bank',
        'player_info'
    ]);
});

test('migration leaves legacy maps untouched when a gear write fails', async () => {
    let writes: string[] = [],
        creator = new Creator(
            {
                collection: (name: string) => ({
                    updateOne: async () => {
                        writes.push(name);
                        if (name === 'player_bank') throw new Error('injected failure');
                        return { matchedCount: 1 };
                    }
                })
            } as never,
            {} as never
        ),
        player = {
            username: 'test',
            equipment: { serialize: () => ({}) },
            inventory: { serialize: () => ({}) },
            bank: { serialize: () => ({}) },
            socketedCards: {},
            socketedGems: {}
        } as unknown as Player;
    await assert.rejects(creator.saveLegacyEquipmentMigration(player), /injected failure/);
    assert.deepEqual(writes, ['player_equipment', 'player_inventory', 'player_bank']);
});

test('loot bags retain uncollected equipment when inventory space is limited', () => {
    let inventory = new Inventory(1),
        item = new Item('coppersword', -1, -1, true, 2),
        player = {
            x: 0,
            y: 0,
            username: 'test',
            inventory,
            notify: () => {},
            send: () => {}
        } as unknown as Player,
        world = {
            network: { sendToSurroundingRegions: () => {} }
        } as never,
        bag = new LootBag(world, 0, 0, 'test', [item]);
    player.activeLootBag = bag.instance;
    bag.take(player, 0);
    let first = inventory.get(0).equipmentInstance!.uid;
    assert.equal(item.count, 1);
    assert.notEqual(first, item.equipmentInstance!.uid);
    inventory.remove(0);
    bag.take(player, 0);
    assert.notEqual(inventory.get(0).equipmentInstance!.uid, first);
});

test('store buyback retains a sold equipment instance', () => {
    let stores = Object.create(Stores.prototype) as Stores,
        template = new Item('coppersword', -1, -1, false, -1),
        inventory = new Inventory(3),
        item = new Item('coppersword', -1, -1, true, 1),
        player = {
            username: 'test',
            storeOpen: 'shop',
            inventory,
            notify: () => {},
            isCheater: () => false,
            isHollowAdmin: () => false
        } as unknown as Player;
    Object.assign(stores, {
        stores: { shop: { items: [template], currency: 'gold', refresh: 0 } },
        world: { entities: { forEachPlayer: () => {} } }
    });
    template.price = 100;
    inventory.add(new Item('gold', -1, -1, true, 100_000));
    item.equipmentInstance!.refineLevel = 3;
    item.equipmentInstance!.socketedCards.push('card');
    inventory.add(item);
    stores.sell(player, 'shop', 1);
    assert.deepEqual(stores.serialize('shop').items[1].equipmentInstance, item.equipmentInstance);
    stores.purchase(player, 'shop', 1);
    assert.deepEqual(inventory.get(1).equipmentInstance, item.equipmentInstance);
    stores.sell(player, 'shop', 1);
    assert.equal(stores.serialize('shop').items[1].count, 0);
    assert.equal(
        stores.serialize('shop').items[2].equipmentInstance?.uid,
        item.equipmentInstance!.uid
    );
    stores.purchase(player, 'shop', 1);
    assert.equal(stores.serialize('shop').items[2].count, 1);
});

test('store compacts sold-out resale stock only when no one is viewing', () => {
    let stores = Object.create(Stores.prototype) as Stores,
        sold = new Item('coppersword', -1, -1, true, 0),
        available = new Item('tinsword', -1, -1, true, 1),
        template = new Item('coppersword', -1, -1, true, -1),
        viewer = { storeOpen: 'shop' },
        viewers = [viewer],
        stock = { items: [template, sold, available], resaleEquipment: new Set([sold, available]) };
    Object.assign(stores, {
        stores: { shop: { ...stock, currency: 'gold', refresh: 0 } },
        world: {
            entities: {
                forEachPlayer: (callback: (player: typeof viewer) => void) => {
                    for (let current of viewers) callback(current);
                }
            }
        }
    });
    let compact = (
        stores as unknown as { compactSoldOutEquipment(key: string): void }
    ).compactSoldOutEquipment.bind(stores);
    compact('shop');
    assert.deepEqual(
        stores.serialize('shop').items.map((item) => item.key),
        ['coppersword', 'coppersword', 'tinsword']
    );
    viewers = [];
    compact('shop');
    assert.deepEqual(
        stores.serialize('shop').items.map((item) => item.key),
        ['coppersword', 'tinsword']
    );
    assert.equal(stock.resaleEquipment.has(sold), false);
    assert.equal(stock.resaleEquipment.has(available), true);
});

test('store refuses excess resale stock without removing equipment', () => {
    let stores = Object.create(Stores.prototype) as Stores,
        item = new Item('coppersword', -1, -1, true, 1),
        template = new Item('coppersword', -1, -1, false, -1),
        inventory = new Inventory(2),
        notifications: string[] = [],
        player = {
            username: 'test',
            storeOpen: 'shop',
            inventory,
            notify: (message: string) => notifications.push(message),
            isCheater: () => false,
            isHollowAdmin: () => false
        } as unknown as Player,
        resaleEquipment = new Set(
            Array.from({ length: 100 }, () => new Item('tinsword', -1, -1, true, 0))
        );
    template.price = 100;
    inventory.add(item);
    Object.assign(stores, {
        stores: { shop: { items: [template], currency: 'gold', refresh: 0, resaleEquipment } }
    });
    stores.sell(player, 'shop', 0);
    assert.deepEqual(inventory.get(0).equipmentInstance, item.equipmentInstance);
    assert.equal(notifications.length, 1);
    assert.equal(resaleEquipment.size, 100);
});
