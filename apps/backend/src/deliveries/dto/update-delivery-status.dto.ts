import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DeliveryStatus } from '../../generated/prisma/client.js';

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;
}
