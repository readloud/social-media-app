import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledPost } from './scheduled-post.entity';

@Injectable()
export class LoadManagementService {
  private readonly logger = new Logger(LoadManagementService.name);
  private readonly metrics = {
    queueLength: 0,
    processingRate: 0,
    avgLatency: 0,
    errorRate: 0,
  };

  constructor(
    @InjectQueue('social-post-queue')
    private scheduleQueue: Queue,
    @InjectRepository(ScheduledPost)
    private scheduledPostRepository: Repository<ScheduledPost>,
  ) {
    this.startMonitoring();
  }

  // Dynamic rate limiting based on system load
  async getDynamicRateLimit(): Promise<RateLimitConfig> {
    const systemLoad = await this.getSystemLoad();
    const queueDepth = await this.scheduleQueue.getWaitingCount();
    const redisMemory = await this.getRedisMemoryUsage();

    let maxConcurrent = 10; // default
    let ratePerSecond = 5; // default

    // Scale down under high load
    if (systemLoad.cpu > 80 || queueDepth > 10000 || redisMemory > 80) {
      maxConcurrent = 2;
      ratePerSecond = 1;
      this.logger.warn('High load detected, scaling down rate limits');
    } 
    // Scale up under low load
    else if (systemLoad.cpu < 30 && queueDepth < 100) {
      maxConcurrent = 20;
      ratePerSecond = 10;
    }
    // Normal operation
    else if (systemLoad.cpu < 60 && queueDepth < 1000) {
      maxConcurrent = 10;
      ratePerSecond = 5;
    }

    return { maxConcurrent, ratePerSecond, burst: ratePerSecond * 2 };
  }

  // Adaptive scheduling - adjust timing based on load
  async adaptiveSchedule(scheduleId: string, originalTime: Date): Promise<Date> {
    const systemLoad = await this.getSystemLoad();
    const queueDepth = await this.scheduleQueue.getWaitingCount();
    
    let adjustedTime = new Date(originalTime);
    
    // Apply delay if system is overloaded
    if (systemLoad.cpu > 80 || queueDepth > 5000) {
      const delayMinutes = Math.min(60, Math.floor(queueDepth / 100) * 5);
      adjustedTime = new Date(originalTime.getTime() + delayMinutes * 60 * 1000);
      this.logger.log(`Schedule ${scheduleId} delayed by ${delayMinutes} minutes due to high load`);
      
      // Update schedule in database
      await this.scheduledPostRepository.update(scheduleId, {
        scheduledFor: adjustedTime,
        lastError: `Auto-delayed due to system load (${delayMinutes} min)`,
      });
    }
    
    return adjustedTime;
  }

  // Load shedding - reject low priority tasks under extreme load
  async shouldProcessSchedule(schedule: ScheduledPost): Promise<boolean> {
    const systemLoad = await this.getSystemLoad();
    const queueDepth = await this.scheduleQueue.getWaitingCount();
    
    // Critical load - only process high priority schedules
    if (systemLoad.cpu > 90 || queueDepth > 10000) {
      const isHighPriority = this.isHighPrioritySchedule(schedule);
      if (!isHighPriority) {
        const delayMinutes = 30;
        schedule.scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000);
        schedule.lastError = `Delayed due to critical system load (${delayMinutes} min)`;
        await this.scheduledPostRepository.save(schedule);
        this.logger.warn(`Schedule ${schedule.id} delayed due to load shedding`);
        return false;
      }
    }
    
    return true;
  }

  // Circuit breaker pattern for external APIs
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  async callSocialMediaAPI(platform: string, scheduleId: string, apiCall: () => Promise<any>): Promise<any> {
    let cb = this.circuitBreakers.get(platform);
    
    if (!cb) {
      cb = {
        state: 'CLOSED',
        failureCount: 0,
        lastFailureTime: null,
        nextRetryTime: null,
      };
      this.circuitBreakers.set(platform, cb);
    }

    // Circuit is open - don't attempt calls
    if (cb.state === 'OPEN') {
      if (cb.nextRetryTime && new Date() >= cb.nextRetryTime) {
        cb.state = 'HALF_OPEN';
        this.logger.log(`Circuit breaker for ${platform} transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker OPEN for ${platform}. Service unavailable.`);
      }
    }

    try {
      const result = await apiCall();
      
      // Success - close circuit if half-open
      if (cb.state === 'HALF_OPEN') {
        cb.state = 'CLOSED';
        cb.failureCount = 0;
        this.logger.log(`Circuit breaker for ${platform} CLOSED after successful call`);
      }
      
      return result;
    } catch (error) {
      cb.failureCount++;
      cb.lastFailureTime = new Date();
      
      // Open circuit after 5 failures
      if (cb.failureCount >= 5) {
        cb.state = 'OPEN';
        const retryAfter = Math.min(300, Math.pow(2, cb.failureCount - 5)) * 1000;
        cb.nextRetryTime = new Date(Date.now() + retryAfter);
        this.logger.error(`Circuit breaker OPEN for ${platform}. Retry in ${retryAfter/1000}s`);
      }
      
      throw error;
    }
  }

  // Priority queue management
  async prioritizeSchedules(): Promise<void> {
    const pendingSchedules = await this.scheduledPostRepository.find({
      where: { status: 'pending' },
      relations: ['post', 'user'],
    });

    // Calculate priority score for each schedule
    for (const schedule of pendingSchedules) {
      const priority = this.calculatePriority(schedule);
      
      // Update job priority in BullMQ if already queued
      if (schedule.jobId) {
        await this.scheduleQueue.updateJobPriority(schedule.jobId, priority);
      }
    }
  }

  private calculatePriority(schedule: ScheduledPost): number {
    let priority = 0;
    
    // Time-based priority (closer deadlines get higher priority)
    const timeUntilPost = schedule.scheduledFor.getTime() - Date.now();
    if (timeUntilPost < 60 * 60 * 1000) { // Within 1 hour
      priority += 100;
    } else if (timeUntilPost < 6 * 60 * 60 * 1000) { // Within 6 hours
      priority += 50;
    }
    
    // User tier priority
    if (schedule.user?.subscriptionTier === 'PREMIUM') {
      priority += 50;
    } else if (schedule.user?.subscriptionTier === 'PRO') {
      priority += 25;
    }
    
    // Retry priority (failed schedules get higher priority)
    if (schedule.retryCount > 0) {
      priority += 20 * schedule.retryCount;
    }
    
    // Normalize to 1-100 range
    return Math.min(100, Math.max(1, priority));
  }

  private async getSystemLoad(): Promise<SystemLoad> {
    const cpuUsage = await this.getCPUUsage();
    const memoryUsage = process.memoryUsage();
    const queueDepth = await this.scheduleQueue.getWaitingCount();
    
    return {
      cpu: cpuUsage,
      memory: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
      queueDepth,
      timestamp: new Date(),
    };
  }

  private async getCPUUsage(): Promise<number> {
    const startUsage = process.cpuUsage();
    const startTime = Date.now();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const endUsage = process.cpuUsage(startUsage);
    const endTime = Date.now();
    
    const totalUsage = (endUsage.user + endUsage.system) / 1000; // microseconds to milliseconds
    const percentage = (totalUsage / (endTime - startTime)) * 100;
    
    return Math.min(100, percentage);
  }

  private async getRedisMemoryUsage(): Promise<number> {
    // Implementation to get Redis memory usage
    return 45; // Mock return
  }

  private isHighPrioritySchedule(schedule: ScheduledPost): boolean {
    // Premium users
    if (schedule.user?.subscriptionTier === 'PREMIUM') return true;
    
    // Time-critical (within next 30 minutes)
    const timeUntilPost = schedule.scheduledFor.getTime() - Date.now();
    if (timeUntilPost < 30 * 60 * 1000) return true;
    
    // Already retried multiple times
    if (schedule.retryCount >= 2) return true;
    
    return false;
  }

  private async getCPUUsage(): Promise<number> {
    // Use system information library in production
    return 45;
  }

  private startMonitoring(): void {
    setInterval(async () => {
      const queueDepth = await this.scheduleQueue.getWaitingCount();
      const activeCount = await this.scheduleQueue.getActiveCount();
      const failedCount = await this.scheduleQueue.getFailedCount();
      
      this.metrics.queueLength = queueDepth;
      
      this.logger.debug(`Queue stats - Waiting: ${queueDepth}, Active: ${activeCount}, Failed: ${failedCount}`);
      
      // Alert if queue is building up
      if (queueDepth > 5000) {
        this.logger.warn(`Queue depth critical: ${queueDepth} pending jobs`);
      }
    }, 30000);
  }

  private async monitorProcessingLatency(): Promise<void> {
    // Track job processing time
    const jobs = await this.scheduleQueue.getJobs(['active', 'completed']);
    const latencies = [];
    
    for (const job of jobs) {
      if (job.processedOn) {
        const latency = Date.now() - job.processedOn;
        latencies.push(latency);
      }
    }
    
    if (latencies.length > 0) {
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      this.metrics.avgLatency = avgLatency;
      
      if (avgLatency > 30000) {
        this.logger.error(`High processing latency detected: ${avgLatency}ms average`);
      }
    }
  }
}

interface SystemLoad {
  cpu: number;
  memory: number;
  queueDepth: number;
  timestamp: Date;
}

interface RateLimitConfig {
  maxConcurrent: number;
  ratePerSecond: number;
  burst: number;
}

interface CircuitBreaker {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: Date | null;
  nextRetryTime: Date | null;
}