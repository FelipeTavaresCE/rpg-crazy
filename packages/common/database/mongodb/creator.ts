import { refineItem, repairScar } from '../../../../src/systems/refine-system';

import log from '@kaetram/common/util/log';
import Utils from '@kaetram/common/util/utils';
import config from '@kaetram/common/config';

import type Player from '@kaetram/server/src/game/entity/character/player/player';
import type { Collection, Db, MongoClient } from 'mongodb';
import type { Modules } from '@kaetram/common/network';
import type { GuildData } from '@kaetram/common/network/impl/guild';
import type { SerializedEffects } from '@kaetram/common/types/status';
import type { SlotData } from '@kaetram/common/types/slot';
import type { EquipmentData } from '@kaetram/common/network/impl/equipment';
import type {
    AutoHuntPacketData,
    AutoHuntRule,
    GambitRule,
    OfflineHuntReport,
    OfflineHuntSnapshot
} from '@kaetram/common/network/impl/autohunt';

// Used for password reset
export interface ResetToken {
    token: string;
    expiration: number;
}

export interface PoisonInfo {
    type: number; // Type of poison.
    remaining: number; // How much of the poison is left.
}

export interface EquipmentOperationResult {
    applied: boolean;
    message: string;
    inventory?: SlotData[];
    equipment?: EquipmentData[];
}

interface InventoryDocument {
    slots?: SlotData[];
}

interface EquipmentDocument {
    equipments?: EquipmentData[];
}

export interface PlayerInfo {
    username: string;
    password: string;
    email: string;
    x: number;
    y: number;
    userAgent: string;
    rank: Modules.Ranks;
    poison: PoisonInfo;
    effects: SerializedEffects;
    hitPoints: number;
    mana: number;
    orientation: Modules.Orientation;
    ban: number;
    jail: number;
    mute: number;
    lastWarp: number;
    mapVersion: number;
    regionsLoaded: number[];
    friends: string[];
    lastServerId: number;
    lastAddress: string;
    lastGlobalChat: number;
    guild: string;
    pet: string;
    autoHuntSnapshot?: OfflineHuntSnapshot;
    autoHuntReport?: OfflineHuntReport;
    autoHuntRules?: AutoHuntRule[];
    gambitRules?: GambitRule[];
    unlockedPassiveNodes?: string[];
    socketedGems?: { [key: string]: string[] };
    weaponMastery?: { [key: string]: { level: number; experience: number } };
    regionKillCounts?: { [key: string]: number };
    autoRecycleRarities?: Array<'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'>;
    socketedCards?: { [key: string]: string[] };
    relics?: string[];
    resetToken?: ResetToken;
}

/**
 * The creator database class is responsible for serializing information and storing
 * it into MongoDB. The primary idea is to store only the necessary data when serializing
 * and avoiding redundancies.
 */

export default class Creator {
    private saveQueues = new Map<string, Promise<void>>();

    public constructor(
        private database: Db,
        private client: MongoClient
    ) {}

    /**
     * Takes every information about the player and saves it. Individual
     * objects such as equipment, inventory, bank, etc. are stored in separate
     * collections for organization purposes.
     * @param player The player character we are saving.
     */

    public save(player: Player): Promise<void> {
        let previous = this.saveQueues.get(player.username) || Promise.resolve(),
            current = previous.then(() => this.savePlayerData(player));

        this.saveQueues.set(player.username, current);

        return current.finally(() => {
            if (this.saveQueues.get(player.username) === current)
                this.saveQueues.delete(player.username);
        });
    }

    private async savePlayerData(player: Player): Promise<void> {
        try {
            log.debug(`Saving player information for ${player.username}.`);

            await Promise.all([
                this.saveInfo(player),
                this.saveEquipment(player),
                this.saveInventory(player),
                this.saveBank(player),
                this.saveQuests(player),
                this.saveAchievements(player),
                this.saveSkills(player),
                this.saveStatistics(player),
                this.saveAbilities(player)
            ]);
        } catch (error: unknown) {
            log.error(`Could not save data for ${player.username}.`);
            log.error(error);
        }
    }

    public async saveLegacyEquipmentMigration(player: Player): Promise<void> {
        // Gear must reach disk before the legacy maps are cleared. A deterministic
        // migration UID makes an interrupted sequence safe to replay at next login.
        for (let [collection, data] of [
            ['player_equipment', player.equipment.serialize()],
            ['player_inventory', player.inventory.serialize()],
            ['player_bank', player.bank.serialize()]
        ] as const)
            await this.database
                .collection(collection)
                .updateOne({ username: player.username }, { $set: data }, { upsert: true });

        let result = await this.database
            .collection('player_info')
            .updateOne(
                { username: player.username },
                { $set: { socketedCards: player.socketedCards, socketedGems: player.socketedGems } }
            );
        if (result.matchedCount !== 1) throw new Error('Legacy socket migration player not found');
    }

    public async saveOfflineHuntSettlement(
        player: Player,
        snapshot: OfflineHuntSnapshot
    ): Promise<boolean> {
        let session = this.client.startSession();

        try {
            return (
                (await session.withTransaction(async () => {
                    let result = await this.database.collection('player_info').updateOne(
                        {
                            username: player.username,
                            'autoHuntSnapshot.startedAt': snapshot.startedAt,
                            'autoHuntSnapshot.seed': snapshot.seed
                        },
                        {
                            $set: {
                                hitPoints: player.hitPoints.getHitPoints(),
                                mana: player.mana.getMana(),
                                autoHuntReport: player.autoHuntReport,
                                autoHuntRules: player.autoHuntRules,
                                gambitRules: player.gambitRules,
                                unlockedPassiveNodes: player.unlockedPassiveNodes,
                                socketedGems: player.socketedGems,
                                weaponMastery: player.weaponMastery,
                                regionKillCounts: player.regionKillCounts,
                                autoRecycleRarities: player.autoRecycleRarities,
                                socketedCards: player.socketedCards,
                                relics: player.relics
                            },
                            $unset: { autoHuntSnapshot: '' }
                        },
                        { session }
                    );

                    if (result.modifiedCount !== 1) return false;

                    await this.database
                        .collection('player_inventory')
                        .updateOne(
                            { username: player.username },
                            { $set: player.inventory.serialize() },
                            { upsert: true, session }
                        );
                    await this.database
                        .collection('player_equipment')
                        .updateOne(
                            { username: player.username },
                            { $set: player.equipment.serialize() },
                            { upsert: true, session }
                        );
                    await this.database
                        .collection('player_bank')
                        .updateOne(
                            { username: player.username },
                            { $set: player.bank.serialize() },
                            { upsert: true, session }
                        );
                    await this.database
                        .collection('player_skills')
                        .updateOne(
                            { username: player.username },
                            { $set: player.skills.serialize() },
                            { upsert: true, session }
                        );
                    await this.database
                        .collection('player_statistics')
                        .updateOne(
                            { username: player.username },
                            { $set: player.statistics.serialize() },
                            { upsert: true, session }
                        );

                    return true;
                })) === true
            );
        } finally {
            await session.endSession();
        }
    }

    public async performEquipmentOperation(
        username: string,
        equipmentId: string,
        operation: NonNullable<AutoHuntPacketData['operation']>
    ): Promise<EquipmentOperationResult> {
        let session = this.client.startSession(),
            roll = Math.random();

        try {
            return (
                (await session.withTransaction(async () => {
                    let inventoryDocument = (await this.database
                            .collection('player_inventory')
                            .findOne({ username }, { session })) as InventoryDocument | null,
                        equipmentDocument = (await this.database
                            .collection('player_equipment')
                            .findOne({ username }, { session })) as EquipmentDocument | null;
                    if (!inventoryDocument || !Array.isArray(inventoryDocument.slots))
                        return { applied: false, message: 'Inventory could not be loaded.' };

                    let inventory = inventoryDocument.slots.map((slot) => ({
                            ...slot,
                            ...(slot.equipmentInstance
                                ? {
                                      equipmentInstance: {
                                          ...slot.equipmentInstance,
                                          socketedCards: [...slot.equipmentInstance.socketedCards],
                                          socketedGems: [...slot.equipmentInstance.socketedGems]
                                      }
                                  }
                                : {})
                        })),
                        equipment = (equipmentDocument?.equipments ?? []).map((item) => ({
                            ...item,
                            ...(item.equipmentInstance
                                ? {
                                      equipmentInstance: {
                                          ...item.equipmentInstance,
                                          socketedCards: [...item.equipmentInstance.socketedCards],
                                          socketedGems: [...item.equipmentInstance.socketedGems]
                                      }
                                  }
                                : {})
                        })),
                        inventoryMatches = inventory.filter(
                            (slot) => slot.equipmentInstance?.uid === equipmentId
                        ),
                        equipmentMatches = equipment.filter(
                            (item) => item.equipmentInstance?.uid === equipmentId
                        );
                    if (inventoryMatches.length + equipmentMatches.length !== 1)
                        return { applied: false, message: 'Equipment instance was not found.' };

                    let item =
                        inventoryMatches.length > 0
                            ? inventoryMatches[0].equipmentInstance
                            : equipmentMatches[0].equipmentInstance;
                    if (!item)
                        return {
                            applied: false,
                            message: 'Equipment instance could not be loaded.'
                        };

                    let count = (key: string): number =>
                            inventory.reduce(
                                (total, slot) =>
                                    total + (slot.key === key ? Math.max(0, slot.count) : 0),
                                0
                            ),
                        consume = (key: string, amount: number): boolean => {
                            let remaining = amount;
                            for (let slot of inventory) {
                                if (slot.key !== key || remaining <= 0) continue;
                                let taken = Math.min(Math.max(0, slot.count), remaining);
                                remaining -= taken;
                                if (taken === slot.count) {
                                    slot.key = '';
                                    slot.count = -1;
                                    slot.enchantments = {};
                                    delete slot.equipmentInstance;
                                } else slot.count -= taken;
                            }
                            return remaining === 0;
                        },
                        message: string;

                    if (operation === 'forge') {
                        let materials = {
                                auroraJewels: count('aurora_jewel'),
                                temperFragments: count('temper_fragments')
                            },
                            result = refineItem(
                                { refineLevel: item.refineLevel, isScarred: item.isScarred },
                                materials,
                                roll
                            ),
                            targetLevel = item.refineLevel + 1;
                        if (
                            result.chance === 0 ||
                            result.materials.auroraJewels !== materials.auroraJewels - 1 ||
                            result.materials.temperFragments !==
                                materials.temperFragments - targetLevel
                        )
                            return {
                                applied: false,
                                message: item.isScarred
                                    ? 'Scarred equipment must be repaired before forging.'
                                    : 'Not enough forging materials or no refinement remains.'
                            };
                        if (
                            !consume('aurora_jewel', 1) ||
                            !consume('temper_fragments', targetLevel)
                        )
                            return { applied: false, message: 'Forging materials changed.' };

                        Object.assign(item, result.item);
                        message = result.success
                            ? `Forged successfully to +${result.item.refineLevel}.`
                            : result.item.isScarred
                            ? 'Forging failed; the equipment was scarred.'
                            : 'Forging failed; materials were consumed.';
                    } else {
                        let purifiedRelics = count('purified_relic'),
                            result = repairScar(
                                { refineLevel: item.refineLevel, isScarred: item.isScarred },
                                purifiedRelics
                            );
                        if (result.purifiedRelics !== purifiedRelics - 1)
                            return {
                                applied: false,
                                message: item.isScarred
                                    ? 'Not enough purified relics.'
                                    : 'This equipment does not need scar repair.'
                            };
                        if (!consume('purified_relic', 1))
                            return { applied: false, message: 'Repair materials changed.' };

                        Object.assign(item, result.item);
                        message = 'Scar repaired.';
                    }

                    let inventoryUpdate = await this.database
                            .collection('player_inventory')
                            .updateOne({ username }, { $set: { slots: inventory } }, { session }),
                        equipmentUpdate =
                            inventoryMatches.length > 0
                                ? undefined
                                : await this.database
                                      .collection('player_equipment')
                                      .updateOne(
                                          { username },
                                          { $set: { equipments: equipment } },
                                          { session }
                                      );
                    if (
                        inventoryUpdate.matchedCount !== 1 ||
                        (equipmentUpdate && equipmentUpdate.matchedCount !== 1)
                    )
                        throw new Error('Equipment operation could not be saved.');

                    return {
                        applied: true,
                        message,
                        inventory,
                        ...(equipmentDocument?.equipments ? { equipment } : {})
                    };
                })) || { applied: false, message: 'Equipment operation was not applied.' }
            );
        } finally {
            await session.endSession();
        }
    }

    /**
     * Saves the basic variable information about the player.
     * See `PlayerInfo` for more information.
     */

    private saveInfo(player: Player): Promise<void> {
        let collection = this.database.collection('player_info');

        return new Promise((resolve) => {
            this.getPlayerWithHash(player, (playerInfo: PlayerInfo) => {
                this.updateCollection(collection, player.username, playerInfo).then(resolve);
            });
        });
    }

    /**
     * Serializes the equipment data of the player and
     * stores it into the database.
     */

    private saveEquipment(player: Player): Promise<void> {
        let collection = this.database.collection('player_equipment');

        // Pass the serialized equipment as parameter.
        return this.updateCollection(collection, player.username, player.equipment.serialize());
    }

    /**
     * Serializes the inventory information and
     * stores it into the database.
     */

    private saveInventory(player: Player): Promise<void> {
        let collection = this.database.collection('player_inventory');

        return this.updateCollection(collection, player.username, player.inventory.serialize());
    }

    /**
     * Serializes the bank information and
     * stores it into the database.
     */

    private saveBank(player: Player): Promise<void> {
        let collection = this.database.collection('player_bank');

        return this.updateCollection(collection, player.username, player.bank.serialize());
    }

    /**
     * Serializes the quest data and stores it in the database.
     */

    private saveQuests(player: Player): Promise<void> {
        let collection = this.database.collection('player_quests');

        return this.updateCollection(collection, player.username, player.quests.serialize());
    }

    /**
     * Serializes the achievement data and stores it into the database.
     */

    private saveAchievements(player: Player): Promise<void> {
        let collection = this.database.collection('player_achievements');

        return this.updateCollection(collection, player.username, player.achievements.serialize());
    }

    /**
     * Serializes all the skills and stores the data into the database.
     */

    private saveSkills(player: Player): Promise<void> {
        let collection = this.database.collection('player_skills');

        return this.updateCollection(collection, player.username, player.skills.serialize());
    }

    /**
     * Serializes the player's statistics and stores it into the database.
     */

    private saveStatistics(player: Player): Promise<void> {
        let collection = this.database.collection('player_statistics');

        return this.updateCollection(collection, player.username, player.statistics.serialize());
    }

    /**
     * Serializes the player's abilities and stores them into the database.
     */

    private saveAbilities(player: Player): Promise<void> {
        let collection = this.database.collection('player_abilities');

        return this.updateCollection(collection, player.username, player.abilities.serialize());
    }

    /**
     * Saves the guild to the guild collection.
     * @param guild Contains the data about the guild we are saving.
     * @param callback The callback function to execute after saving.
     */

    public saveGuild(guild: GuildData, callback?: () => void): void {
        let collection = this.database.collection('guilds');

        collection
            .updateOne({ identifier: guild.identifier }, { $set: guild }, { upsert: true })
            .then((result) => {
                if (!result) log.error(`Unable to save guild ${guild.name}.`);

                callback?.();
            })
            .catch((error) => {
                log.error(`An error occurred while saving guild ${guild.name}.`);
                log.error(error);
            });
    }

    /**
     * The brains of the operation for storing/updating data to MongoDB.
     * We provide the collection, username, data.
     * and we save all that information into the database.
     * @param collection The collection we are saving to (e.g. player_info, player_equipment, etc.)
     * @param username The unique identifier to save the data for.
     * @param data The data that we are saving.
     */

    private updateCollection<S>(collection: Collection, username: string, data: S): Promise<void> {
        return collection
            .updateOne({ username }, { $set: data }, { upsert: true })
            .then((result) => {
                if (!result)
                    log.error(`Unable to save ${collection.collectionName} for ${username}.`);
            })
            .catch((error) => {
                log.error(
                    `An error occurred while saving ${collection.collectionName} for ${username}.`
                );
                log.error(error);
            });
    }

    /**
     * Serializes a player object and uses the bcrypt hashing to replace
     * the plaintext password with the hashed one. It creates a callback
     * of the player info with the hashed password.
     * @param player The player parameter to serialize.
     * @param callback Player info containing hashed password.
     */

    public getPlayerWithHash(player: Player, callback: (playerInfo: PlayerInfo) => void): void {
        let info = Creator.serialize(player);

        Utils.hash(player.password, (hash: string) => {
            /**
             * Replace the plaintext password with the hashString we created.
             * This is the actual string that gets stored in the database and
             * is later compared to check login validity.
             */
            info.password = hash;

            callback(info);
        });
    }

    /**
     * Verifies the user's username, password, and email server-sided
     * to make sure the registration process does not encounter issues.
     * @param player The player instance we are verifying.
     */

    public static verifyPlayer(player: Player): boolean {
        if (!Utils.isValidUsername(player.username)) return false;
        if (!player.username || player.username.length === 0) return false;
        if (!player.password || player.password.length < 3 || player.password.length > 64)
            return false;
        if (!Utils.isEmail(player.email)) return false;

        return true;
    }

    /**
     * Serializes a player object and extracts all the basic information
     * that will be saved in the database. This is generally used for
     * loading the player and sending the preliminary information to the client.
     * @param player The player object that we want to serialize.
     * @returns A serialized object that contains the player's information, we use
     * this and store it in the database.
     */

    public static serialize(player: Player): PlayerInfo {
        return {
            username: player.username,
            password: player.password,
            email: player.email,
            x: player.x,
            y: player.y,
            userAgent: player.userAgent,
            rank: player.rank,
            poison: {
                type: player.poison ? player.poison.type : -1,
                remaining: player.poison ? player.poison.getRemainingTime() : -1
            },
            effects: player.status.serialize(),
            hitPoints: player.hitPoints.getHitPoints(),
            mana: player.mana.getMana(),
            orientation: player.orientation,
            ban: player.ban,
            mute: player.mute,
            jail: player.jail,
            lastWarp: player.lastWarp,
            mapVersion: player.mapVersion,
            regionsLoaded: player.regionsLoaded,
            friends: player.friends.serialize(),
            lastServerId: config.serverId,
            lastAddress: player.connection.address,
            lastGlobalChat: player.lastGlobalChat,
            guild: player.guild,
            pet: player.pet ? player.pet.key : '',
            autoHuntSnapshot: player.autoHuntSnapshot,
            autoHuntReport: player.autoHuntReport,
            autoHuntRules: player.autoHuntRules,
            gambitRules: player.gambitRules,
            unlockedPassiveNodes: player.unlockedPassiveNodes,
            socketedGems: player.socketedGems,
            weaponMastery: player.weaponMastery,
            regionKillCounts: player.regionKillCounts,
            autoRecycleRarities: player.autoRecycleRarities,
            socketedCards: player.socketedCards,
            relics: player.relics,
            resetToken: undefined // Save token as undefined to prevent it from being saved.
        };
    }
}
