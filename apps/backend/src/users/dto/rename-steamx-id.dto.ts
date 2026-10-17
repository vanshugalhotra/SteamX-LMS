import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class RenameSteamxIdDto {
  @ApiProperty({ description: 'New SteamX ID, including the target school code prefix.' })
  @Trim({ uppercase: true })
  @IsString()
  steamxId!: string;
}
