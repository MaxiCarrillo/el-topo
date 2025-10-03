import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenPayload } from '../common/filters/interfaces/token-payload.interface';
import { CreateRoomDto, JoinRoomDto, NextRoundDto } from './dtos';
import { RoomService } from './room.service';

@Controller({ path: 'rooms', version: '1' })
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly jwt: JwtService,
  ) {}

  @Post('create')
  createRoom(@Body() dto: CreateRoomDto) {
    const { room, player } = this.roomService.createRoom(dto.nickname);
    const token = this.jwt.sign({
      roomId: room.id,
      playerId: player.id,
      isHost: true,
    });
    return {
      token,
      code: room.code,
      player: {
        id: player.id,
        nickname: player.nickname,
        isHost: player.isHost,
      },
    };
  }

  @Post('join')
  joinRoom(@Body() dto: JoinRoomDto) {
    const { room, player } = this.roomService.joinRoom(
      dto.code.toUpperCase(),
      dto.nickname,
    );
    const token = this.jwt.sign({
      roomId: room.id,
      playerId: player.id,
      isHost: player.isHost,
    });
    return {
      token,
      code: room.code,
      player: {
        id: player.id,
        nickname: player.nickname,
        isHost: player.isHost,
      },
    };
  }

  @Post('next-round')
  async nextRound(
    @Body() dto: NextRoundDto,
    @Headers('x-player-token') token?: string,
  ) {
    const payload = this.verifyToken(token);
    const room = this.roomService.getRoom(payload.roomId);
    if (!room) throw new UnauthorizedException('Sala inválida');
    if (!payload.isHost) throw new UnauthorizedException('No sos anfitrión');

    const info = await this.roomService.nextRound(
      payload.playerId,
      dto.code.toUpperCase(),
    );
    return { ok: true, round: info.round };
  }

  @Get(':code/state')
  getState(
    @Param('code') code: string,
    @Headers('x-player-token') token?: string,
  ) {
    const payload = this.verifyToken(token);
    const room = this.roomService.getRoom(payload.roomId);
    if (!room || room.code !== code.toUpperCase()) {
      throw new UnauthorizedException('Acceso no autorizado a la sala');
    }
    return this.roomService.serializeRoomForPlayer(room, payload.playerId);
  }

  private verifyToken(token?: string): TokenPayload {
    if (!token) throw new UnauthorizedException('Falta token');
    try {
      return this.jwt.verify<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
