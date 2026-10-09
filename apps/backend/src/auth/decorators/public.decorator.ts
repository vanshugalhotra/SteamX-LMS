import { SetMetadata } from '@nestjs/common';
import { PUBLIC_ROUTE } from './metadata.constants.js';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);
