/** Por qué se cerró una sesión. Se guarda en `UserSession.revokedReason`. */
export enum SessionRevocationReason {
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  /** Se presentó un refresh token ya rotado: alguien más lo tiene (D-09). */
  REFRESH_TOKEN_REUSED = 'REFRESH_TOKEN_REUSED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
}

/**
 * Sesión de un usuario (F2-T02, D-09). El refresh token del navegador es `<id>.<secreto>`; aquí solo se
 * guarda el hash SHA-256 del secreto, que cambia en cada renovación (rotación).
 *
 * Una sesión sirve mientras no esté revocada ni caducada. La caducidad es absoluta: renovar no la alarga,
 * así que pasado `expiresAt` hay que volver a iniciar sesión.
 */
export class UserSession {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly refreshTokenHash: string,
    public readonly expiresAt: Date,
    public readonly revokedAt?: Date,
  ) {}

  /** Indica si la sesión todavía puede renovarse o autenticar peticiones. */
  isUsableAt(moment: Date): boolean {
    return this.revokedAt === undefined && this.expiresAt.getTime() > moment.getTime();
  }
}
