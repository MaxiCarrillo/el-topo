import { Player } from '@/modules/common/filters/interfaces';
import { FamousPerson } from '@/modules/famous/interfaces';

export type RoomStatus = 'waiting' | 'in_progress';

export interface Room {
  id: string;
  code: string;
  hostPlayerId: string;
  players: Player[];
  currentRound: number;
  currentFamous?: FamousPerson;
  currentSpyPlayerId?: string;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  roundHistory: {
    round: number;
    famousId: string;
    spyPlayerId: string;
    startedAt: number;
  }[];
}
