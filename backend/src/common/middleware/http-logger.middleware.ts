import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import logger from '../logger/winston.logger';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method, originalUrl, ip, headers } = req;
    const userAgent = headers['user-agent'] || 'unknown';
    const correlationId = headers['x-correlation-id'] || this.generateCorrelationId();

    // Add correlation ID to request
    req.headers['x-correlation-id'] = correlationId;

    // Log request
    logger.http(`Incoming Request`, {
      correlationId,
      method,
      url: originalUrl,
      ip,
      userAgent,
      body: this.sanitizeBody(req.body),
    });

    // Capture response
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;

      const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'http';

      logger[logLevel](`Request completed`, {
        correlationId,
        method,
        url: originalUrl,
        statusCode,
        duration: `${duration}ms`,
        ip,
        userAgent,
      });
    });

    next();
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;
    
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'authorization', 'secret'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });
    
    return sanitized;
  }
}