import {
  AccessTokenClaims,
  IAuthTokenService,
  InvalidAccessTokenError,
} from '@/application/ports/services/IAuthTokenService.js';

const FAKE_TOKEN_PREFIX = 'fake-token:';
const EXPIRED_TOKEN_PREFIX = 'expired-token:';

/** Servicio de tokens sin criptografía: el token es el payload serializado. */
export class FakeAuthTokenService implements IAuthTokenService {
  /** Payloads para los que se emitió un token, en orden. */
  readonly issuedPayloads: AccessTokenClaims[] = [];

  generateToken(claims: AccessTokenClaims): string {
    this.issuedPayloads.push(claims);
    return `${FAKE_TOKEN_PREFIX}${JSON.stringify(claims)}`;
  }

  /** Token que `verifyToken` rechaza como caducado. */
  expiredToken(): string {
    return `${EXPIRED_TOKEN_PREFIX}x`;
  }

  verifyToken(token: string): AccessTokenClaims {
    if (token.startsWith(EXPIRED_TOKEN_PREFIX)) throw new InvalidAccessTokenError(true);
    if (!token.startsWith(FAKE_TOKEN_PREFIX)) throw new InvalidAccessTokenError(false);
    return JSON.parse(token.slice(FAKE_TOKEN_PREFIX.length)) as AccessTokenClaims;
  }
}
