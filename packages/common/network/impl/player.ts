import Packet from '../packet';

import { Packets } from '@kaetram/common/network';

import type { Opcodes, Modules } from '@kaetram/common/network';
import type { EntityData } from '@kaetram/common/types/entity';
import type { EquipmentData } from '@kaetram/common/network/impl/equipment';
import type { AutoHuntRule, OfflineHuntReport } from './autohunt';

export interface PlayerPacketData {
    username: string;
    serverId?: number;
    guild?: string;
}

export interface PlayerData extends EntityData {
    rank: Modules.Ranks;
    pvp: boolean;
    orientation: number;

    experience?: number;
    nextExperience?: number;
    prevExperience?: number;

    mana?: number;
    maxMana?: number;
    autoHuntReport?: OfflineHuntReport;
    autoHuntEnabled?: boolean;
    autoHuntRules?: AutoHuntRule[];

    equipments: EquipmentData[];
}

export default class PlayerPacket extends Packet {
    public constructor(opcode: Opcodes.Player, data?: PlayerPacketData) {
        super(Packets.Player, opcode, data);
    }
}
