import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class RenameSteamxIdDto {
  @ApiProperty({ description: 'New SteamX ID, including the target school code prefix.' })
  @Trim({ uppercase: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  steamxId!: string;
}
