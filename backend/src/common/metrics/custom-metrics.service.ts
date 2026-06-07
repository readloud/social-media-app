import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPost } from '../../modules/schedule/scheduled-post.entity';
import { Post } from '../../modules/posts/post.entity';
import * as client from 'prom-client';

@Injectable()
export class CustomMetricsService {
  private readonly logger = new Logger(CustomMetricsService.name);
  
  // Business metrics
  private readonly postsCreatedTotal = new client.Counter({
    name: 'posts_created_total',
    help: 'Total number of posts created',
    labelNames: ['type', 'user_id'],
  });
  
  private readonly schedulesCreatedTotal = new client.Counter({
    name: 'schedules_created_total',
    help: 'Total number of schedules created',
    labelNames: ['status', 'user_id'],
  });
  
  private readonly scheduleProcessingDuration = new client.Histogram({
    name: 'schedule_processing_duration_seconds',
    help: 'Duration of schedule processing',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    labelNames: ['status'],
  });
  
  private readonly activeUsers = new client.Gauge({
    name: 'active_users_total',
    help: 'Number of active users',
    labelNames: ['period'],
  });
  
  private readonly queueSize = new client.Gauge({
    name: 'bullmq_queue_size',
    help: 'Size of BullMQ queue',
    labelNames: ['queue_name', 'status'],
  });
  
  private readonly databaseQueryDuration = new client.Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
    labelNames: ['operation', 'table'],
  });
  
  private readonly apiRequestDuration = new client.Histogram({
    name: 'api_request_duration_seconds',
    help: 'Duration of API requests',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    labelNames: ['method', 'endpoint', 'status'],
  });
  
  private readonly socialMediaApiCalls = new client.Counter({
    name: 'social_media_api_calls_total',
    help: 'Total calls to social media APIs',
    labelNames: ['platform', 'operation', 'status'],
  });
  
  constructor(
    @InjectQueue('social-post-queue')
    private scheduleQueue: Queue,
    @InjectRepository(ScheduledPost)
    private scheduledPostRepository: Repository<ScheduledPost>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
  ) {
    this.startMetricsCollection();
  }
  
  private startMetricsCollection() {
    // Collect queue metrics every 30 seconds
    setInterval(() => this.updateQueueMetrics(), 30000);
    
    // Collect database metrics every minute
    setInterval(() => this.updateDatabaseMetrics(), 60000);
    
    // Collect business metrics every 5 minutes
    setInterval(() => this.updateBusinessMetrics(), 300000);
  }
  
  private async updateQueueMetrics() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.scheduleQueue.getWaitingCount(),
        this.scheduleQueue.getActiveCount(),
        this.scheduleQueue.getCompletedCount(),
        this.scheduleQueue.getFailedCount(),
        this.scheduleQueue.getDelayedCount(),
      ]);
      
      this.queueSize.set({ queue_name: 'social-post-queue', status: 'waiting' }, waiting);
      this.queueSize.set({ queue_name: 'social-post-queue', status: 'active' }, active);
      this.queueSize.set({ queue_name: 'social-post-queue', status: 'completed' }, completed);
      this.queueSize.set({ queue_name: 'social-post-queue', status: 'failed' }, failed);
      this.queueSize.set({ queue_name: 'social-post-queue', status: 'delayed' }, delayed);
    } catch (error) {
      this.logger.error('Failed to update queue metrics', error.stack);
    }
  }
  
  private async updateDatabaseMetrics() {
    try {
      const totalPosts = await this.postRepository.count();
      const totalSchedules = await this.scheduledPostRepository.count();
      
      client.register.getSingleMetric('database_total_records')?.set(totalPosts + totalSchedules);
    } catch (error) {
      this.logger.error('Failed to update database metrics', error.stack);
    }
  }
  
  private async updateBusinessMetrics() {
    try {
      // Active users in last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const activeUsersCount = await this.postRepository
        .createQueryBuilder('post')
        .select('COUNT(DISTINCT post.userId)', 'count')
        .where('post.createdAt > :date', { date: oneDayAgo })
        .getRawOne();
      
      this.activeUsers.set({ period: '24h' }, activeUsersCount?.count || 0);
    } catch (error) {
      this.logger.error('Failed to update business metrics', error.stack);
    }
  }
  
  // Record methods for business operations
  recordPostCreated(userId: string, type: 'scheduled' | 'instant') {
    this.postsCreatedTotal.inc({ type, user_id: userId });
  }
  
  recordScheduleCreated(userId: string, status: string) {
    this.schedulesCreatedTotal.inc({ status, user_id: userId });
  }
  
  recordScheduleProcessing(duration: number, status: 'success' | 'failed') {
    this.scheduleProcessingDuration.observe({ status }, duration);
  }
  
  recordApiCall(method: string, endpoint: string, status: number, duration: number) {
    this.apiRequestDuration.observe({ method, endpoint, status: String(status) }, duration);
  }
  
  recordSocialMediaCall(platform: string, operation: string, success: boolean) {
    this.socialMediaApiCalls.inc({
      platform,
      operation,
      status: success ? 'success' : 'failure',
    });
  }
  
  recordDatabaseQuery(operation: string, table: string, duration: number) {
    this.databaseQueryDuration.observe({ operation, table }, duration);
  }
  
  // Get metrics endpoint handler
  async getMetrics(): Promise<string> {
    return client.register.metrics();
  }
}