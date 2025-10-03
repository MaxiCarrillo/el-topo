// Namespace /rooms

import { JwtService } from '@nestjs/jwt';
import {
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomService } from './room.service';

// Autenticación vía token en handshake query: ?token=XXX
@WebSocketGateway({
  cors: {
    origin: [/localhost:\d+$/, /\.tudominio\.com$/],
    credentials: true,
  },
  namespace: '/rooms',
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map socket.id => { roomId, playerId }
  private sessions = new Map<string, { roomId: string; playerId: string }>();

  constructor(
    private readonly roomService: RoomService,
    private readonly jwt: JwtService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.query?.token;
      if (!token || typeof token !== 'string') {
        client.emit('error', { message: 'Token requerido' });
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify<any>(token);
      const room = this.roomService.getRoom(payload.roomId);
      if (!room) {
        client.emit('error', { message: 'Sala no encontrada' });
        client.disconnect();
        return;
      }
      const player = room.players.find((p) => p.id === payload.playerId);
      if (!player) {
        client.emit('error', { message: 'Jugador inexistente' });
        client.disconnect();
        return;
      }
      // Reasignar estado si reconecta
      this.roomService.reconnectPlayer(room.id, player.id);
      this.sessions.set(client.id, { roomId: room.id, playerId: player.id });
      client.join(room.code);

      // Emitir estado inicial solo a ese jugador
      client.emit(
        'room_state',
        this.roomService.serializeRoomForPlayer(room, player.id),
      );

      // Notificar a todos lista de jugadores
      this.server
        .to(room.code)
        .emit('players_update', this.roomService.listPublicPlayers(room));
    } catch (e) {
      client.emit('error', { message: 'Autenticación fallida' });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const session = this.sessions.get(client.id);
    if (!session) return;
    const { roomId, playerId } = session;
    this.sessions.delete(client.id);

    this.roomService.markPlayerDisconnected(roomId, playerId);
    const room = this.roomService.getRoom(roomId);
    if (!room) return;

    // Si nadie queda conectado, limpiar
    this.roomService.removeEmptyRoom(roomId);
    if (!this.roomService.getRoom(roomId)) {
      return;
    }

    this.server
      .to(room.code)
      .emit('players_update', this.roomService.listPublicPlayers(room));
  }

  @SubscribeMessage('request_state')
  handleRequestState(@ConnectedSocket() client: Socket) {
    const session = this.sessions.get(client.id);
    if (!session) return;
    const room = this.roomService.getRoom(session.roomId);
    if (!room) return;
    client.emit(
      'room_state',
      this.roomService.serializeRoomForPlayer(room, session.playerId),
    );
  }

  // Evento que el backend puede recibir para "avisar" que una nueva ronda ya fue iniciada vía HTTP.
  // (Opcional) Podrías permitir iniciar la ronda vía websocket si el host lo pide.
  @SubscribeMessage('announce_round')
  handleAnnounceRound(@ConnectedSocket() client: Socket) {
    const session = this.sessions.get(client.id);
    if (!session) return;
    const room = this.roomService.getRoom(session.roomId);
    if (!room) return;

    // Emitir información adaptada a cada jugador
    room.players.forEach((p) => {
      const sockets = [...this.server.sockets.sockets.values()].filter(
        (s) => this.sessions.get(s.id)?.playerId === p.id,
      );
      const payload = this.roomService.serializeRoomForPlayer(room, p.id);
      sockets.forEach((sock) => sock.emit('round_started', payload));
    });

    this.server
      .to(room.code)
      .emit('players_update', this.roomService.listPublicPlayers(room));
  }
}
