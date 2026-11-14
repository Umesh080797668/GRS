process.env.TZ = 'Asia/Colombo';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

import * as Sentry from '@sentry/node';
import { SentryEvent, SentryScrubber } from './common/logging/sentry-scrubber';
import { StructuredLoggerService } from './common/logging/structured-logger.service';
import { PrismaClientExceptionFilter } from './common/filters/prisma-client-exception.filter';

const expressApp: Express = express();
expressApp.set('trust proxy', 1);
let initPromise: Promise<void> | null = null;

// Initialize Sentry with PII scrubber (M1.11 / Section 12)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    beforeSend: (event) =>
      SentryScrubber.beforeSend(
        event as SentryEvent,
      ) as unknown as typeof event,
  });
}

export async function createNestServer(server: Express) {
  server.set('trust proxy', 1);
  const logger = new StructuredLoggerService();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger,
  });

  // Secure CORS policy: Restrict to exact configured origins or localhost development
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
    : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:8080',
    ];

  // Disallow bare wildcard '*' when credentials: true is enabled to prevent origin reflection
  const effectiveOrigins = allowedOrigins.filter((o) => o !== '*');

  const escapeRegex = (str: string) =>
    str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  const isOriginAllowed = (origin: string): boolean => {
    if (effectiveOrigins.includes(origin)) {
      return true;
    }
    for (const pattern of effectiveOrigins) {
      if (pattern.includes('*')) {
        const escaped = escapeRegex(pattern).replace(/\\\*/g, '.*');
        const regex = new RegExp('^' + escaped + '$');
        if (regex.test(origin)) return true;
      }
    }
    return false;
  };

  // Apply Helmet with standard headers and Content Security Policy (CSP)
  app.use(helmet());
  app.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", ...effectiveOrigins],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    }),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        // Disallow origin gracefully without throwing 500 unhandled errors on preflight
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'PUT'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-App-Version',
      'X-Device-ID',
      'X-Client-Type',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new PrismaClientExceptionFilter());

  // OpenAPI Swagger Documentation (Section 6) - only exposed in non-production environments
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('GRS API')
      .setDescription('Global Research & Survey App API Specification')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

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
  void bootstrap();
}

// Exported serverless function handler for Vercel
export default async function handler(req: Request, res: Response) {
  if (!initPromise) {
    initPromise = createNestServer(expressApp)
      .then(() => undefined)
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  await initPromise;
  expressApp(req, res);
}
