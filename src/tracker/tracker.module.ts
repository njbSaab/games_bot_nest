import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { TrackerService } from './tracker.service';
import { TrackerController } from './tracker.controller';
import { SharedModule } from '../shared.module';

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    SharedModule,
  ],
  controllers: [TrackerController],
  providers: [TrackerService],
  exports: [TrackerService],
})
export class TrackerModule {}
