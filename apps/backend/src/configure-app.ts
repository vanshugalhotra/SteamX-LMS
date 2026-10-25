import {
  BadRequestException,
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AUTH_COOKIE_NAME } from './auth/auth.constants.js';
import type { Env } from './config/env.schema.js';
import { API_ERROR } from './common/errors/api-errors.js';

type FieldErrors = { field: string; errors: string[] };

/** Preserves nested DTO field paths so clients can identify the invalid input. */
function getValidationDetails(errors: ValidationError[], parent = ''): FieldErrors[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const currentError =
      error.constraints === undefined ? [] : [{ field, errors: Object.values(error.constraints) }];

    return [...currentError, ...getValidationDetails(error.children ?? [], field)];
  });
}

/** Configures the Nest application before it begins accepting requests. */
export function configureApp(
  app: INestApplication,
  options: { enableShutdownHooks?: boolean } = {},
): void {
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(cookieParser());
  app.use(helmet());
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    app.use(
      '/api/docs',
      helmet({
        contentSecurityPolicy: {
          directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:'],
          },
        },
      }),
    );
  }

  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health/*path', method: RequestMethod.GET }],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          ...API_ERROR.VALIDATION_ERROR,
          details: getValidationDetails(errors),
        }),
    }),
  );

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('STEAMX LMS API')
      .setDescription(
        'API documentation for STEAMX LMS. State-changing requests require an Origin header matching an entry in CORS_ORIGINS. Browsers send Origin automatically; tools such as Postman must set it explicitly.',
      )
      .setVersion('1')
      .addCookieAuth(AUTH_COOKIE_NAME, { type: 'apiKey', in: 'cookie' }, 'cookieAuth')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
  }

  if (options.enableShutdownHooks ?? true) {
    app.enableShutdownHooks();
  }
}
