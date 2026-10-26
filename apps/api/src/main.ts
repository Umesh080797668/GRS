import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import { AppModule } from './app.module';

const expressApp: Express = express();
let isInitialized = false;

export async function createNestServer(server: Express) {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

  app.enableCors();

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

if (!process.env.VERCEL) {
  bootstrap();
}

// Exported serverless function handler for Vercel
export default async function handler(req: any, res: any) {
  if (!isInitialized) {
    await createNestServer(expressApp);
    isInitialized = true;
  }
  expressApp(req, res);
}
