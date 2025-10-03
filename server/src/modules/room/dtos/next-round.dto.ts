import { IsString, Length } from 'class-validator';

export class NextRoundDto {
  @IsString()
  @Length(6, 6)
  code: string;
}
