import * as Sentry from '@sentry/node';
import { Integrations } from '@sentry/tracing';
import { ConfigService } from '@nestjs/config';

export const setupSentry = (configService: ConfigService) => {
  const dsn = configService.get('SENTRY_DSN');
  const environment = configService.get('NODE_ENV', 'development');
  const release = configService.get('npm_package_version', '1.0.0');

  if (!dsn) {
    console.warn('Sentry DSN not provided. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn,
    environment,
    release,
    integrations: [
      new Integrations.Http({ tracing: true }),
      new Integrations.Express(),
    ],
    tracesSampleRate: environment === 'production' ? 0.2 : 1.0,
    beforeSend(event, hint) {
      // Don't send 404 errors to Sentry
      if (hint?.originalException?.statusCode === 404) {
        return null;
      }
      
      // Sanitize sensitive data
      if (event.request?.data) {
        event.request.data = sanitizeData(event.request.data);
      }
      
      return event;
    },
    // Ignore specific errors
    ignoreErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'EPIPE',
      'Request aborted',
    ],
  });
};

const sanitizeData = (data: any): any => {
  if (!data) return data;
  
  const sensitive = ['password', 'token', 'authorization', 'secret', 'credit_card'];
  const sanitized = { ...data };
  
  sensitive.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

// Sentry interceptor for NestJS
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        Sentry.captureException(error, {
          extra: {
            route: context.getHandler().name,
            controller: context.getClass().name,
            userId: context.switchToHttp().getRequest()?.user?.id,
          },
        });
        return throwError(() => error);
      })
    );
  }
}
2. Frontend Sentry Configuration
typescript
// frontend/src/utils/sentry.ts
import * as Sentry from '@sentry/nextjs';

export const initSentry = () => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.warn('Sentry DSN not provided');
    return;
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay(),
    ],
    beforeSend(event) {
      // Don't send bot errors
      if (event.request?.headers?.['user-agent']?.includes('bot')) {
        return null;
      }
      return event;
    },
  });
};

// Custom error tracking function
export const trackError = (error: Error, context?: Record<string, any>) => {
  Sentry.captureException(error, {
    extra: context,
    tags: {
      component: context?.component || 'unknown',
    },
  });
};

// Track user interactions
export const trackUserAction = (action: string, data?: Record<string, any>) => {
  Sentry.addBreadcrumb({
    category: 'user',
    message: action,
    data,
    level: 'info',
  });
};