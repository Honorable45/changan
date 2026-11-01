import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { AuthController } from './auth/auth.controller';
import { AdminGuard } from './auth/auth.guard';
import { CatalogController } from './catalog/catalog.controller';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { PrismaService } from './common/prisma.service';
import { MediaService } from './media/media.service';
import { StorageService } from './media/storage.service';
import { RequestsController } from './requests/requests.controller';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600) }])],
  controllers: [CatalogController, RequestsController, AuthController, AdminController],
  providers: [
    PrismaService, StorageService, MediaService, AdminGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
