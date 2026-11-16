import { IAuthTokenService, IPayload } from '@/application/ports/services/IAuthTokenService.js';

const FAKE_TOKEN_PREFIX = 'fake-token:';

/** Servicio de tokens sin criptografía: el token es el payload serializado. */
export class FakeAuthTokenService implements IAuthTokenService {
  /** Payloads para los que se emitió un token, en orden. */
  readonly issuedPayloads: IPayload[] = [];

  generateToken(payload: IPayload): string {
    this.issuedPayloads.push(payload);
    return `${FAKE_TOKEN_PREFIX}${JSON.stringify(payload)}`;
  }

  verifyToken(token: string): IPayload {
    if (!token.startsWith(FAKE_TOKEN_PREFIX)) {
      throw new Error('Invalid token');
    }
    return JSON.parse(token.slice(FAKE_TOKEN_PREFIX.length)) as IPayload;
  }
}
