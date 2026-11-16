import { IAuthTokenService } from '../../application/ports/services/IAuthTokenService.js';
import { IPayload } from '../../application/ports/services/IAuthTokenService.js';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';

type TokenLifetime = NonNullable<SignOptions['expiresIn']>;

export class JwTokenService implements IAuthTokenService {
  private readonly JWT_SECRET = env.JWT_SECRET;
  // `env.ts` ya comprobó que es un número + unidad que jsonwebtoken entiende (JWT_EXPIRATION_PATTERN).
  private readonly JWT_EXPIRATION = env.JWT_EXPIRATION as TokenLifetime;

  generateToken(payload: IPayload): string {
    const token = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRATION,
    });
    return token;
  }

  verifyToken(token: string): IPayload {
    const payload: IPayload = jwt.verify(token, this.JWT_SECRET) as IPayload;
    return payload;
  }
}
