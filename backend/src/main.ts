import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { setupSentry } from './common/sentry/sentry.config';
import { setupOpenTelemetry } from './common/telemetry/opentelemetry.config';
import * as Sentry from '@sentry/node';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  
  // Setup Sentry
  setupSentry(configService);
  
  // Setup OpenTelemetry
  if (configService.get('OTEL_ENABLED') === 'true') {
    setupOpenTelemetry();
  }
  
  // Global middleware
  app.use(new HttpLoggerMiddleware().use);
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  
  // Global pipes & filters
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));
  
  app.useGlobalFilters(new GlobalExceptionFilter());
  
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL', 'http://localhost:3001'),
    credentials: true,
  });
  
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  
  app.setGlobalPrefix('api/v1');
  
  await app.listen(port);
  
  logger.log(`🚀 Server running on http://localhost:${port}`);
  logger.log(`📝 Environment: ${nodeEnv}`);
  logger.log(`🔍 Sentry: ${configService.get('SENTRY_DSN') ? 'enabled' : 'disabled'}`);
  logger.log(`📊 APM: ${configService.get('DD_APM_ENABLED') === 'true' ? 'Datadog enabled' : 'disabled'}`);
}

bootstrap();