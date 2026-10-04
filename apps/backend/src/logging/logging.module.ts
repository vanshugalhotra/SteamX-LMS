import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { REDACTED_LOG_PATHS } from './logging.constants.js';
import type { Env } from '../config/env.schema.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });

        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            serializers: {
              req: (req: IncomingMessage) => ({
                id: req.id,
                method: req.method,
                url: req.url?.split('?')[0],
              }),
              res: (res: ServerResponse) => ({
                statusCode: res.statusCode,
              }),
            },
            redact: {
              paths: REDACTED_LOG_PATHS,
              censor: '[Redacted]',
            },
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const incomingId = req.headers['x-request-id'];
              const requestId =
                typeof incomingId === 'string' && UUID_PATTERN.test(incomingId)
                  ? incomingId
                  : randomUUID();

              res.setHeader('X-Request-Id', requestId);
              return requestId;
            },
            customProps: (req: IncomingMessage) => ({
              requestId: req.id,
            }),
            customLogLevel: (_req, res, error) => {
              if (error || res.statusCode >= 500) {
                return 'error';
              }
              if (res.statusCode >= 400) {
                return 'warn';
              }
              return 'info';
            },
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url?.split('?')[0] === '/health',
            },
            ...(nodeEnv === 'development' && {
              transport: {
                target: 'pino-pretty',
                options: { colorize: true },
              },
            }),
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
