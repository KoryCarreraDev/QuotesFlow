import winston from 'winston';
import { ILogger, LogContext } from '../../application/ports/services/ILogger.js';
import { currentRequestContext } from '../../cross-cutting/requestContext.js';
import { redactSensitiveData } from './redactSensitiveData.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/** Adaptador de `ILogger` sobre winston: una línea JSON por entrada, a la salida estándar. */
export class WinstonLogger implements ILogger {
  private readonly logger: winston.Logger;

  /** @param transport Destino de las entradas; por defecto la consola. Los tests pasan uno en memoria. */
  constructor(level: LogLevel, transport: winston.transport = new winston.transports.Console()) {
    this.logger = winston.createLogger({
      level: level === 'silent' ? 'error' : level,
      silent: level === 'silent',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      transports: [transport],
    });
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    this.write('error', message, { ...context, error });
  }

  private write(level: Exclude<LogLevel, 'silent'>, message: string, context?: LogContext): void {
    const requestContext = currentRequestContext();
    const entry = redactSensitiveData({
      ...context,
      requestId: requestContext?.requestId,
      userId: requestContext?.userId,
      tenantId: requestContext?.tenantId,
    }) as LogContext;
    this.logger.log(level, message, entry);
  }
}
