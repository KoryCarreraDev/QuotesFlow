import { AsyncLocalStorage } from 'node:async_hooks';

/** Datos de la petición HTTP en curso que necesitan los logs y la auditoría. */
export interface RequestContextData {
  requestId: string;
  /** Usuario de la sesión, cuando la ruta está autenticada. */
  userId?: string;
  tenantId?: string;
}

// Una petición por cadena asíncrona: dos peticiones simultáneas nunca comparten contexto.
const requestContextStorage = new AsyncLocalStorage<RequestContextData>();

/** Contexto de la petición en curso; `undefined` fuera de una petición (arranque, tareas). */
export function currentRequestContext(): RequestContextData | undefined {
  return requestContextStorage.getStore();
}

/** Ejecuta `work` con un contexto de petición nuevo. */
export function runWithRequestContext<T>(context: RequestContextData, work: () => T): T {
  return requestContextStorage.run(context, work);
}

/** Añade al contexto en curso el usuario y el tenant de la sesión, una vez autenticada la petición. */
export function bindSessionToRequestContext(userId: string, tenantId: string): void {
  const context = requestContextStorage.getStore();
  if (!context) return;
  context.userId = userId;
  context.tenantId = tenantId;
}
