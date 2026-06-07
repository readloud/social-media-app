import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import logger from './winston.logger';

@Injectable({ scope: Scope.REQUEST })
export class LoggerService {
  constructor(@Inject(REQUEST) private request: Request) {}

  private getCorrelationId(): string {
    return this.request?.headers?.['x-correlation-id'] as string || 'no-correlation-id';
  }

  private getContext(): string {
    const route = this.request?.route?.path || this.request?.url || 'unknown';
    const method = this.request?.method || 'unknown';
    return `${method} ${route}`;
  }

  info(message: string, meta: any = {}) {
    logger.info(message, {
      correlationId: this.getCorrelationId(),
      context: this.getContext(),
      ...meta,
    });
  }

  error(message: string, trace?: string, meta: any = {}) {
    logger.error(message, {
      correlationId: this.getCorrelationId(),
      context: this.getContext(),
      trace,
      ...meta,
    });
  }

  warn(message: string, meta: any = {}) {
    logger.warn(message, {
      correlationId: this.getCorrelationId(),
      context: this.getContext(),
      ...meta,
    });
  }

  debug(message: string, meta: any = {}) {
    logger.debug(message, {
      correlationId: this.getCorrelationId(),
      context: this.getContext(),
      ...meta,
    });
  }

  http(message: string, meta: any = {}) {
    logger.http(message, {
      correlationId: this.getCorrelationId(),
      context: this.getContext(),
      ...meta,
    });
  }

  // Business event logging
  logScheduleEvent(userId: string, scheduleId: string, action: string, data: any = {}) {
    this.info(`Schedule ${action}`, {
      eventType: 'schedule',
      userId,
      scheduleId,
      action,
      ...data,
    });
  }

  logPostEvent(userId: string, postId: string, action: string, data: any = {}) {
    this.info(`Post ${action}`, {
      eventType: 'post',
      userId,
      postId,
      action,
      ...data,
    });
  }

  logAuthenticationEvent(userId: string, action: string, success: boolean, data: any = {}) {
    this.info(`Authentication ${action}`, {
      eventType: 'auth',
      userId,
      action,
      success,
      ...data,
    });
  }
}