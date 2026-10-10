import { Body, Controller, INestApplication, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { configureApp } from './../src/configure-app.js';
import type { Env } from './../src/config/env.schema.js';

class LessonBlockRequest {
  @IsString()
  name!: string;
}

class ValidationRequest {
  @ValidateNested()
  @Type(() => LessonBlockRequest)
  block!: LessonBlockRequest;
}

@Controller('test-validation')
@Public()
class ValidationTestController {
  @Post()
  create(@Body() body: ValidationRequest): ValidationRequest {
    return body;
  }

  @Post('payload-too-large')
  payloadTooLarge(): never {
    throw Object.assign(new Error('Payload exceeds the request limit'), {
      status: 413,
      expose: true,
    });
  }
}

@Module({
  imports: [AppModule],
  controllers: [ValidationTestController],
})
class BootstrapTestModule {}

describe('API bootstrap (e2e)', () => {
  let app: INestApplication<App>;
  let origin: string;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BootstrapTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    const configuredOrigin = app
      .get<ConfigService<Env, true>>(ConfigService)
      .get('CORS_ORIGINS', { infer: true })[0];
    if (!configuredOrigin) {
      throw new Error('Bootstrap E2E tests require at least one CORS_ORIGINS entry.');
    }
    origin = configuredOrigin;
    await app.init();
  });

  it('returns unified errors and rejects an unconfigured CORS origin', async () => {
    const missingRoute = await request(app.getHttpServer()).get('/api/v1/not-found').expect(404);

    expect(missingRoute.body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
      requestId: missingRoute.headers['x-request-id'],
    });
    expect(missingRoute.body.message).toEqual(expect.any(String));

    const validationFailure = await request(app.getHttpServer())
      .post('/api/v1/test-validation')
      .set('Origin', origin)
      .send({ block: { name: 42, extra: 'not allowed' } })
      .expect(400);

    expect(validationFailure.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
    });
    expect(validationFailure.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'block.name' }),
        expect.objectContaining({ field: 'block.extra' }),
      ]),
    );

    const payloadTooLarge = await request(app.getHttpServer())
      .post('/api/v1/test-validation/payload-too-large')
      .set('Origin', origin)
      .expect(413);

    expect(payloadTooLarge.body).toMatchObject({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request failed',
    });

    const disallowedOrigin = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://not-configured.example')
      .expect(200);

    expect(disallowedOrigin.headers['access-control-allow-origin']).toBeUndefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
