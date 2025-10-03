export interface TokenPayload {
  roomId: string;
  playerId: string;
  isHost: boolean;
  iat?: number;
  exp?: number;
}
