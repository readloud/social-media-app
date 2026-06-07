import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleProcessor } from './schedule.processor';
import { ScheduledPost } from './scheduled-post.entity';
import { Post } from '../posts/post.entity';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledPost, Post]),
    BullModule.registerQueue({
      name: 'social-post-queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    MediaModule,
    NotificationsModule,
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService, ScheduleProcessor],
  exports: [ScheduleService],
})
export class ScheduleModule {}