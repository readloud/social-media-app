import { Injectable, OnModuleInit } from '@nestjs/common';
import tracer from 'dd-trace';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DatadogService implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const enabled = this.configService.get('DD_APM_ENABLED', false);
    
    if (!enabled) {
      console.log('Datadog APM disabled');
      return;
    }
    
    tracer.init({
      service: 'social-media-api',
      env: this.configService.get('NODE_ENV', 'development'),
      version: this.configService.get('npm_package_version', '1.0.0'),
      logInjection: true,
      runtimeMetrics: true,
      profiling: true,
      analytics: true,
      plugins: true,
      spanSampling: {
        rules: [
          { sampleRate: 1, name: 'http.request' },
          { sampleRate: 0.5, name: 'bullmq.process' },
          { sampleRate: 0.1, name: 'db.query' },
        ],
      },
    });
  }
  
  // Custom tracing for business operations
  traceScheduleCreation(userId: string, scheduleId: string, fn: () => Promise<any>) {
    return tracer.trace('schedule.create', {
      resource: 'Schedule Creation',
      tags: {
        'user.id': userId,
        'schedule.id': scheduleId,
        'business.operation': 'create_schedule',
      },
    }, fn);
  }
  
  tracePostPublishing(postId: string, platform: string, fn: () => Promise<any>) {
    return tracer.trace('post.publish', {
      resource: 'Post Publishing',
      tags: {
        'post.id': postId,
        'platform': platform,
        'business.operation': 'publish_post',
      },
    }, fn);
  }
  
  incrementMetric(metricName: string, value: number = 1, tags: Record<string, string> = {}) {
    tracer.increment(metricName, value, tags);
  }
  
  recordTiming(metricName: string, duration: number, tags: Record<string, string> = {}) {
    tracer.timing(metricName, duration, tags);
  }
}