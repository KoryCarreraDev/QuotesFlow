/**
 * Datos que viajan firmados en el token de sesión: usuario (`sub`), empresa y rol.
 */
export interface IPayload {
  sub: string;
  tenantId: string;
  role: string;
}

/**
 * Emite y verifica los tokens de sesión. `verifyToken` lanza si el token es inválido o caducó.
 */
export interface IAuthTokenService {
  generateToken(payload: IPayload): string;
  verifyToken(token: string): IPayload;
}
