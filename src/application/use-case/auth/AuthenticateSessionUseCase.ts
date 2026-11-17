import { AuthenticatedSession, ISessionRepository } from '@/application/ports/repositories/ISessionRepository.js';
import { IAuthTokenService, InvalidAccessTokenError } from '@/application/ports/services/IAuthTokenService.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { UnauthorizedError } from '@/domain/errors/UnauthorizedError.js';

/**
 * Autentica una petición con su token de acceso (F2-T02). Además de la firma, comprueba en la base que la
 * sesión sigue abierta y que el usuario y su empresa siguen activos, y devuelve el rol actual (H2): cerrar
 * sesión, desactivar a un usuario o cambiarle el rol surte efecto en la siguiente petición.
 *
 * @throws {UnauthorizedError} `SESSION_EXPIRED` si el token caducó (el frontend debe renovar) o
 * `INVALID_SESSION` si el token no vale o la sesión ya no sirve.
 */
export class AuthenticateSessionUseCase {
  constructor(
    private readonly authTokenService: IAuthTokenService,
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async execute(accessToken: string): Promise<AuthenticatedSession> {
    let claims;
    try {
      claims = this.authTokenService.verifyToken(accessToken);
    } catch (verificationError) {
      const isExpired = verificationError instanceof InvalidAccessTokenError && verificationError.isExpired;
      throw new UnauthorizedError(
        isExpired ? ErrorCode.SESSION_EXPIRED : ErrorCode.INVALID_SESSION,
        isExpired ? 'Session expired, refresh it' : 'Session is invalid or expired',
        { cause: verificationError },
      );
    }

    const session = await this.sessionRepository.findAuthenticatedSession(claims.sid, claims.sub, claims.tenantId);
    if (!session) {
      throw new UnauthorizedError(ErrorCode.INVALID_SESSION, 'Session is invalid or expired');
    }
    return session;
  }
}
