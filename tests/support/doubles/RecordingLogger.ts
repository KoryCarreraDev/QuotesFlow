import { ILogger, LogContext } from '@/application/ports/services/ILogger.js';

export interface RecordedLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  error?: unknown;
  context?: LogContext;
}

/** Doble de `ILogger`: guarda las entradas en memoria. */
export class RecordingLogger implements ILogger {
  readonly entries: RecordedLogEntry[] = [];

  debug(message: string, context?: LogContext): void {
    this.entries.push({ level: 'debug', message, context });
  }

  info(message: string, context?: LogContext): void {
    this.entries.push({ level: 'info', message, context });
  }

  warn(message: string, context?: LogContext): void {
    this.entries.push({ level: 'warn', message, context });
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    this.entries.push({ level: 'error', message, error, context });
  }
}
