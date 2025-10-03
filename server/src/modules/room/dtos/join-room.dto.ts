import { IsString, Length, MinLength, MaxLength } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(24)
  nickname: string;
}
