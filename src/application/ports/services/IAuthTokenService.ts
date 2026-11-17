/**
 * Lo que viaja firmado en el token de acceso (F2-T02): usuario (`sub`), empresa y sesión (`sid`).
 * El rol no viaja: se lee de la base en cada petición, así un cambio de rol o una desactivación surten
 * efecto de inmediato (H2).
 */
export interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  sid: string;
}

/** El token de acceso no vale. `isExpired` distingue el caducado (el frontend renueva) del inválido. */
export class InvalidAccessTokenError extends Error {
  constructor(
    readonly isExpired: boolean,
    options?: ErrorOptions,
  ) {
    super(isExpired ? 'Access token expired' : 'Access token is invalid', options);
    this.name = 'InvalidAccessTokenError';
  }
}

/**
 * Emite y verifica los tokens de acceso de corta duración (D-09: 15 minutos por defecto).
 */
export interface IAuthTokenService {
  generateToken(claims: AccessTokenClaims): string;

  /** @throws {InvalidAccessTokenError} Si la firma, el emisor, la audiencia o la caducidad no son válidos. */
  verifyToken(token: string): AccessTokenClaims;
}
