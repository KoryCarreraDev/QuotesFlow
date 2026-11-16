/** Datos estructurados que acompañan a un mensaje de log. Las claves sensibles se redactan al escribir. */
export type LogContext = Record<string, unknown>;

/**
 * Registro de eventos técnicos (F1-T07, H13). Los mensajes van en inglés (R11).
 *
 * El adaptador añade a cada entrada el id de la petición en curso y redacta contraseñas, tokens,
 * cookies y secretos aunque se pasen por error en `context`.
 */
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  /** `error` se registra con su mensaje y su traza; nunca llega al cliente. */
  error(message: string, error?: unknown, context?: LogContext): void;
}
