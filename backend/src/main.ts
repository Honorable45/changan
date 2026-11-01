import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { StorageService } from './media/storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Nombre de proxys devant l'API : le site seul en local, Caddy et le site en production.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');

  const local = app.get(StorageService).localDirectory;
  if (local) app.useStaticAssets(local, { prefix: '/media', immutable: true, maxAge: '365d', index: false });

  if (process.env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('API CHANGAN Togo').setVersion('1.0').addCookieAuth('changan_admin').build());
    SwaggerModule.setup('api/docs', app, doc);
  }

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  new Logger('API').log(`http://${host}:${port}/api`);
}
bootstrap();
