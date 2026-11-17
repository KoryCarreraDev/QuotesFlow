import jwt, { type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import {
  AccessTokenClaims,
  IAuthTokenService,
  InvalidAccessTokenError,
} from '../../application/ports/services/IAuthTokenService.js';
import { env } from '../../config/env.js';

type TokenLifetime = NonNullable<SignOptions['expiresIn']>;

// H2 (F2-T02): algoritmo fijo. Sin `algorithms`, una configuración descuidada podría aceptar `none` o
// confundir una clave pública con un secreto HMAC.
const SIGNING_ALGORITHM = 'HS256';
// Emisor y audiencia: un token firmado con el mismo secreto para otro uso (por ejemplo, el panel de
// administración de F5) no sirve como sesión de la API.
export const ACCESS_TOKEN_ISSUER = 'quotesflow-api';
export const ACCESS_TOKEN_AUDIENCE = 'quotesflow-app';

const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  tenantId: z.string().min(1),
  sid: z.string().min(1),
});

/** Adaptador de `IAuthTokenService` con JWT HS256 (`jsonwebtoken`). */
export class JwtTokenService implements IAuthTokenService {
  private readonly secret = env.JWT_SECRET;
  // `env.ts` ya comprobó que es un número + unidad que jsonwebtoken entiende (JWT_EXPIRATION_PATTERN).
  private readonly lifetime = env.JWT_EXPIRATION as TokenLifetime;

  generateToken(claims: AccessTokenClaims): string {
    return jwt.sign({ tenantId: claims.tenantId, sid: claims.sid }, this.secret, {
      subject: claims.sub,
      algorithm: SIGNING_ALGORITHM,
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      expiresIn: this.lifetime,
    });
  }

  verifyToken(token: string): AccessTokenClaims {
    let decodedPayload: unknown;
    try {
      decodedPayload = jwt.verify(token, this.secret, {
        algorithms: [SIGNING_ALGORITHM],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
      });
    } catch (verificationError) {
      throw new InvalidAccessTokenError(verificationError instanceof jwt.TokenExpiredError, {
        cause: verificationError,
      });
    }

    const parsedClaims = accessTokenClaimsSchema.safeParse(decodedPayload);
    if (!parsedClaims.success) throw new InvalidAccessTokenError(false);
    return parsedClaims.data;
  }
}
