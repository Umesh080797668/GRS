import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import { AppModule } from './app.module';

import * as Sentry from '@sentry/node';
import { sentryEventScrubber } from './common/logging/sentry-scrubber';
import { StructuredLoggerService } from './common/logging/structured-logger.service';

const expressApp: Express = express();
let isInitialized = false;

// Initialize Sentry with PII scrubber (M1.11 / Section 12)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    beforeSend: sentryEventScrubber as any,
  });
}

export async function createNestServer(server: Express) {
  const logger = new StructuredLoggerService();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger,
  });

  // Secure CORS policy: Restrict to configured origins or localhost development
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
      ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        process.env.NODE_ENV !== 'production'
      ) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-App-Version',
      'X-Device-ID',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // OpenAPI Swagger Documentation (Section 6)
  const config = new DocumentBuilder()
    .setTitle('GRS API')
    .setDescription('Global Research & Survey App API Specification')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.init();
  return app;
}

// Local standalone server startup
async function bootstrap() {
  const app = await createNestServer(expressApp);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`GRS API server running on port ${port}`);
}

if (
  !process.env.VERCEL &&
  process.env.NODE_ENV !== 'test' &&
  require.main === module
) {
  bootstrap();
}

// Exported serverless function handler for Vercel
export default async function handler(req: any, res: any) {
  if (!isInitialized) {
    await createNestServer(expressApp);
    isInitialized = true;
  }
  (expressApp as any)(req, res);
}
