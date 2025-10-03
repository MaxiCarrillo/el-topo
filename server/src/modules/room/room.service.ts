import { randomCode, randomIndex, sanitizeNickname } from '@/shared/utils';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { v4 as uuid } from 'uuid';
import { Player } from '../common/filters/interfaces';
import { FamousService } from '../famous/famous.service';
import { FamousPerson } from '../famous/interfaces';
import { Room } from './interfaces';

interface PlayerTokenPayload {
  roomId: string;
  playerId: string;
  isHost: boolean;
}

@Injectable()
export class RoomService {
  private roomsByCode = new Map<string, Room>();
  private roomsById = new Map<string, Room>();
  private roomMutexes = new Map<string, Mutex>();

  constructor(private readonly famous: FamousService) {}

  private getMutex(roomId: string) {
    if (!this.roomMutexes.has(roomId)) {
      this.roomMutexes.set(roomId, new Mutex());
    }
    return this.roomMutexes.get(roomId)!;
  }

  createRoom(nickname: string): { room: Room; player: Player } {
    const cleaned = sanitizeNickname(nickname);
    if (!cleaned) {
      throw new BadRequestException('Nickname inválido');
    }

    let code: string;
    let attempts = 0;
    do {
      code = randomCode(6);
      attempts++;
      if (attempts > 20) {
        throw new Error('No se pudo generar código de sala');
      }
    } while (this.roomsByCode.has(code));

    const player: Player = {
      id: uuid(),
      nickname: cleaned,
      joinedAt: Date.now(),
      isHost: true,
      connected: true,
    };

    const room: Room = {
      id: uuid(),
      code,
      hostPlayerId: player.id,
      players: [player],
      currentRound: 0,
      status: 'waiting',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      roundHistory: [],
    };

    this.roomsById.set(room.id, room);
    this.roomsByCode.set(code, room);

    return { room, player };
  }

  joinRoom(code: string, nickname: string): { room: Room; player: Player } {
    const room = this.roomsByCode.get(code);
    if (!room) {
      throw new NotFoundException('Sala no encontrada');
    }
    if (room.players.length >= 20) {
      throw new ForbiddenException('Sala llena');
    }
    const cleaned = sanitizeNickname(nickname);
    if (!cleaned) throw new BadRequestException('Nickname inválido');

    // Evitar duplicados exactos simultáneos
    if (
      room.players.some(
        (p) => p.nickname.toLowerCase() === cleaned.toLowerCase(),
      )
    ) {
      throw new BadRequestException('Ese nickname ya está en uso en la sala');
    }

    const player: Player = {
      id: uuid(),
      nickname: cleaned,
      joinedAt: Date.now(),
      isHost: false,
      connected: true,
    };

    room.players.push(player);
    room.updatedAt = Date.now();
    return { room, player };
  }

  getRoomByCode(code: string): Room | undefined {
    return this.roomsByCode.get(code);
  }

  getRoom(roomId: string): Room | undefined {
    return this.roomsById.get(roomId);
  }

  markPlayerDisconnected(roomId: string, playerId: string) {
    const room = this.roomsById.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = false;
    }
    // Si host se va y hay otros, reasignar host
    if (room.hostPlayerId === playerId) {
      const next = room.players.find((p) => p.id !== playerId && p.connected);
      if (next) {
        next.isHost = true;
        room.hostPlayerId = next.id;
      }
    }
  }

  reconnectPlayer(roomId: string, playerId: string) {
    const room = this.roomsById.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = true;
  }

  private selectSpy(room: Room): Player {
    const idx = randomIndex(room.players.length);
    return room.players[idx];
  }

  private selectFamous(prevIds: Set<string>): FamousPerson {
    return this.famous.getRandom(prevIds);
  }

  async nextRound(requestingPlayerId: string, code: string) {
    const room = this.roomsByCode.get(code);
    if (!room) throw new NotFoundException('Sala no encontrada');
    if (room.hostPlayerId !== requestingPlayerId) {
      throw new ForbiddenException('Solo el anfitrión puede avanzar de ronda');
    }
    if (room.players.length < 3) {
      throw new BadRequestException(
        'Se necesitan al menos 3 jugadores para iniciar una ronda',
      );
    }

    const mutex = this.getMutex(room.id);
    return mutex.runExclusive(() => {
      // Resistir doble click / flood
      const spy = this.selectSpy(room);
      const usedIds = new Set(room.roundHistory.map((r) => r.famousId));
      const famous = this.selectFamous(usedIds);

      room.currentRound += 1;
      room.currentSpyPlayerId = spy.id;
      room.currentFamous = famous;
      room.status = 'in_progress';
      room.updatedAt = Date.now();
      room.roundHistory.push({
        round: room.currentRound,
        famousId: famous.id,
        spyPlayerId: spy.id,
        startedAt: Date.now(),
      });

      return {
        roomId: room.id,
        code: room.code,
        round: room.currentRound,
        famousId: famous.id,
        spyPlayerId: spy.id,
      };
    });
  }

  serializeRoomForPlayer(room: Room, playerId: string) {
    const isSpy = room.currentSpyPlayerId === playerId;
    return {
      code: room.code,
      status: room.status,
      round: room.currentRound,
      players: room.players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        isHost: p.isHost,
        connected: p.connected,
      })),
      current:
        room.currentRound > 0
          ? isSpy
            ? { isSpy: true, display: 'TOPO' }
            : {
                isSpy: false,
                famous: {
                  id: room.currentFamous?.id,
                  name: room.currentFamous?.name,
                  imageUrl: room.currentFamous?.imageUrl,
                },
              }
          : null,
    };
  }

  listPublicPlayers(room: Room) {
    return room.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      isHost: p.isHost,
      connected: p.connected,
    }));
  }

  isHost(roomId: string, playerId: string) {
    const room = this.roomsById.get(roomId);
    return room ? room.hostPlayerId === playerId : false;
  }

  removeEmptyRoom(roomId: string) {
    const room = this.roomsById.get(roomId);
    if (!room) return;
    const stillConnected = room.players.some((p) => p.connected);
    if (!stillConnected) {
      this.roomsById.delete(roomId);
      this.roomsByCode.delete(room.code);
      this.roomMutexes.delete(roomId);
    }
  }
}
