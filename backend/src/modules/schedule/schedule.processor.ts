import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPost } from './scheduled-post.entity';
import { Post } from '../posts/post.entity';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';

@Processor('social-post-queue')
export class ScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleProcessor.name);

  constructor(
    @InjectRepository(ScheduledPost)
    private scheduledPostRepository: Repository<ScheduledPost>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    private mediaService: MediaService,
    private notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { scheduleId, postId, userId } = job.data;
    
    this.logger.log(`Processing schedule ${scheduleId}, attempt ${job.attemptsMade + 1}`);

    const schedule = await this.scheduledPostRepository.findOne({
      where: { id: scheduleId },
      relations: ['post', 'user'],
    });

    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    if (schedule.status === 'cancelled') {
      this.logger.log(`Schedule ${scheduleId} was cancelled, skipping`);
      return { skipped: true, reason: 'cancelled' };
    }

    try {
      // Simulate posting to social media API
      // In production, replace with actual API calls (Twitter, Facebook, Instagram, etc.)
      const publishResult = await this.publishToSocialMedia(schedule.post, userId);

      // Update post status
      schedule.post.status = 'published';
      schedule.post.publishedAt = new Date();
      await this.postRepository.save(schedule.post);

      // Update schedule status
      schedule.status = 'success';
      schedule.processedAt = new Date();
      await this.scheduledPostRepository.save(schedule);

      // Send success notification
      await this.notificationsService.createNotification({
        userId,
        type: 'schedule_success',
        title: 'Post Published Successfully',
        message: `Your post "${schedule.post.content.substring(0, 50)}..." has been published.`,
        relatedPostId: schedule.postId,
      });

      this.logger.log(`Schedule ${scheduleId} completed successfully`);
      
      return { success: true, result: publishResult };
    } catch (error) {
      this.logger.error(`Failed to process schedule ${scheduleId}: ${error.message}`);
      
      schedule.retryCount = job.attemptsMade + 1;
      schedule.lastError = error.message;
      
      if (schedule.retryCount >= schedule.maxRetries) {
        schedule.status = 'failed';
        await this.scheduledPostRepository.save(schedule);
        
        // Send failure notification
        await this.notificationsService.createNotification({
          userId,
          type: 'schedule_failed',
          title: 'Post Failed to Publish',
          message: `Your scheduled post failed after ${schedule.maxRetries} attempts. Please check and retry.`,
          relatedPostId: schedule.postId,
        });
      } else {
        schedule.status = 'retry';
        await this.scheduledPostRepository.save(schedule);
        throw error; // BullMQ will retry with exponential backoff
      }
    }
  }

  private async publishToSocialMedia(post: Post, userId: string) {
    // Implement actual social media API calls here
    // This is a mock implementation
    this.logger.log(`Publishing post ${post.id} to social media`);
    
    // Simulate API call with potential failure
    if (Math.random() < 0.1) { // 10% chance of failure for testing
      throw new Error('Social media API temporarily unavailable');
    }
    
    // Process media files
    if (post.mediaUrls && post.mediaUrls.length > 0) {
      const uploadedMedia = await this.mediaService.uploadToCloudinary(post.mediaUrls, userId);
      console.log('Media uploaded:', uploadedMedia);
    }
    
    return {
      postId: post.id,
      publishedAt: new Date().toISOString(),
      platform: 'mock_social_platform',
      externalId: `mock_${Date.now()}`,
    };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.log(`Job ${job.id} completed with result: ${JSON.stringify(result)}`);
  }
}