import { ScopedContainer } from '../cross-cutting/container';

declare global {
  namespace Express {
    interface Request {
      container?: ScopedContainer;
      user?: {
        userId: string;
        tenantId: string;
        role: string;
        /** Sesión de la petición (F2-T02). */
        sessionId: string;
      };
    }
  }
}
