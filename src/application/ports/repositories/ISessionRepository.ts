import { SessionRevocationReason, UserSession } from '../../../domain/entities/UserSession.js';
import { Role } from '../../../domain/enums/Role.js';

/** Quién está detrás de una sesión válida, con su rol actual (leído de la base, no del token). */
export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  role: Role;
}

/**
 * Sesiones de usuario (F2-T02). No filtra por el tenant del contexto: el refresh y el logout llegan sin
 * sesión de acceso, y la sesión ya identifica a su tenant.
 */
export interface ISessionRepository {
  create(session: UserSession): Promise<void>;

  /** La sesión, revocada o no; `null` si no existe. */
  findById(sessionId: string): Promise<UserSession | null>;

  /**
   * La sesión si sirve para autenticar: no revocada, no caducada, de un usuario activo y no borrado de una
   * empresa no borrada, y del usuario y la empresa indicados. Si no, `null`.
   */
  findAuthenticatedSession(sessionId: string, userId: string, tenantId: string): Promise<AuthenticatedSession | null>;

  /**
   * Cambia el hash del refresh token solo si sigue siendo `currentHash` y la sesión no está revocada.
   * Así, de dos renovaciones simultáneas con el mismo token, solo una gana.
   *
   * @returns `false` si el token ya había rotado o la sesión se revocó entretanto.
   */
  rotateRefreshToken(sessionId: string, currentHash: string, newHash: string): Promise<boolean>;

  /** Revoca la sesión si aún no lo estaba. */
  revoke(sessionId: string, reason: SessionRevocationReason): Promise<void>;

  /** Revoca todas las sesiones abiertas del usuario. @returns Cuántas revocó. */
  revokeAllForUser(userId: string, reason: SessionRevocationReason): Promise<number>;
}
