import { createLogger, format, transports, addColors } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as path from 'path';

const { combine, timestamp, printf, colorize, json, errors } = format;

// Custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

addColors(colors);

// Custom log format for development
const devFormat = printf(({ level, message, timestamp, context, trace, ...meta }) => {
  return `${timestamp} [${context}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''} ${trace ? `\n${trace}` : ''}`;
});

// JSON format for production (for log aggregation)
const prodFormat = json();

// Determine log format based on environment
const isProduction = process.env.NODE_ENV === 'production';

// Create transports
const transports_list = [];

// Console transport
transports_list.push(
  new transports.Console({
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    format: combine(
      colorize({ all: true }),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      isProduction ? prodFormat : devFormat,
    ),
  })
);

// File transport for errors
if (isProduction) {
  transports_list.push(
    new DailyRotateFile({
      level: 'error',
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(timestamp(), errors({ stack: true }), prodFormat),
    })
  );

  // File transport for all logs
  transports_list.push(
    new DailyRotateFile({
      level: 'info',
      filename: path.join('logs', 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: combine(timestamp(), prodFormat),
    })
  );

  // HTTP request logs
  transports_list.push(
    new DailyRotateFile({
      level: 'http',
      filename: path.join('logs', 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: combine(timestamp(), prodFormat),
    })
  );
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  levels,
  format: combine(
    timestamp(),
    errors({ stack: true }),
    isProduction ? prodFormat : devFormat,
  ),
  transports: transports_list,
  exceptionHandlers: [
    new transports.File({ filename: path.join('logs', 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join('logs', 'rejections.log') }),
  ],
});

export default logger;