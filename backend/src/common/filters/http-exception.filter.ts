import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };
    
    const errorId = this.generateErrorId();
    
    // Log error
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status} - Error: ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    
    // Send to Sentry
    if (status >= 500) {
      Sentry.captureException(exception, {
        tags: {
          errorId,
          url: request.url,
          method: request.method,
          status,
        },
        user: {
          id: request.user?.id,
          email: request.user?.email,
          ip: request.ip,
        },
        extra: {
          body: this.sanitizeBody(request.body),
          query: request.query,
          params: request.params,
          headers: this.sanitizeHeaders(request.headers),
        },
      });
    }
    
    // Send response
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      errorId,
      message: status === HttpStatus.INTERNAL_SERVER_ERROR 
        ? 'An unexpected error occurred. Please try again later.'
        : message,
    });
  }
  
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
  
  private sanitizeBody(body: any): any {
    if (!body) return body;
    const sanitized = { ...body };
    const sensitive = ['password', 'token', 'credit_card'];
    sensitive.forEach(field => {
      if (sanitized[field]) sanitized[field] = '[REDACTED]';
    });
    return sanitized;
  }
  
  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) sanitized[header] = '[REDACTED]';
    });
    return sanitized;
  }
}