import { Module } from '@nestjs/common';
import { ResourceManagementService } from './telegram/resource-management.service';
import { PrismaService } from './prisma.service';
import { NotificationService } from './notification.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    HttpModule,
    ConfigModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    ResourceManagementService,
    PrismaService,
    NotificationService,
  ],
  exports: [
    ResourceManagementService,
    PrismaService,
    NotificationService,
  ],
})
export class SharedModule {}