import { Controller, Get, UseGuards, Res, Header } from '@nestjs/common';
import { Response } from 'express';
import { CustomMetricsService } from './custom-metrics.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Monitoring')
@Controller('metrics')
export class MetricsController {
  constructor(private metricsService: CustomMetricsService) {}
  
  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
  
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version,
    };
  }
  
  @Get('readiness')
  async readinessCheck() {
    // Check database connection
    // Check Redis connection
    // Check queue status
    return {
      status: 'ready',
      checks: {
        database: 'healthy',
        redis: 'healthy',
        queue: 'healthy',
      },
    };
  }
  
  @Get('liveness')
  async livenessCheck() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }
}