import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { AccessTokenClaims, InvalidAccessTokenError } from '@/application/ports/services/IAuthTokenService.js';
import { env } from '@/config/env.js';
import { BcryptHashService } from '@/infrastructure/services/BcryptHashService.js';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  JwtTokenService,
} from '@/infrastructure/services/JwtTokenService.js';

const MILLISECONDS_PER_SECOND = 1000;
const TWO_HOURS = 2;

const PLAIN_PASSWORD = 'Correct-Horse-Battery-9';
const TOKEN_SEGMENT_SEPARATOR = '.';
const SIGNATURE_SEGMENT_INDEX = 2;
const ONE_HOUR_IN_SECONDS = 3600;

describe('BcryptHashService', () => {
  it('genera un hash distinto del texto plano', async () => {
    const passwordHash = await new BcryptHashService().hash(PLAIN_PASSWORD);

    expect(passwordHash).not.toContain(PLAIN_PASSWORD);
  });

  it('genera hashes distintos para la misma contraseña, porque cada uno lleva su propia sal', async () => {
    const hashService = new BcryptHashService();

    const firstHash = await hashService.hash(PLAIN_PASSWORD);
    const secondHash = await hashService.hash(PLAIN_PASSWORD);

    expect(firstHash).not.toBe(secondHash);
  });

  it('compare acepta la contraseña correcta', async () => {
    const hashService = new BcryptHashService();
    const passwordHash = await hashService.hash(PLAIN_PASSWORD);

    await expect(hashService.compare(PLAIN_PASSWORD, passwordHash)).resolves.toBe(true);
  });

  it('compare rechaza una contraseña distinta', async () => {
    const hashService = new BcryptHashService();
    const passwordHash = await hashService.hash(PLAIN_PASSWORD);

    await expect(hashService.compare('wrong-password', passwordHash)).resolves.toBe(false);
  });
});

const sessionClaims: AccessTokenClaims = {
  sub: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  sid: '33333333-3333-4333-8333-333333333333',
};
const signedForApi = { issuer: ACCESS_TOKEN_ISSUER, audience: ACCESS_TOKEN_AUDIENCE } as const;
const claimsInPayload = { tenantId: sessionClaims.tenantId, sid: sessionClaims.sid };

// F2-T02 (H2, D-09): token de acceso corto con usuario, empresa y sesión; algoritmo, emisor y audiencia fijos.
describe('JwtTokenService', () => {
  it('un token emitido se verifica y devuelve el usuario, el tenant y la sesión, sin el rol', () => {
    const tokenService = new JwtTokenService();

    const verifiedClaims = tokenService.verifyToken(tokenService.generateToken(sessionClaims));

    expect(verifiedClaims).toEqual(sessionClaims);
  });

  it('el token emitido caduca según JWT_EXPIRATION', () => {
    const tokenService = new JwtTokenService();

    const decodedToken = jwt.decode(tokenService.generateToken(sessionClaims)) as { iat: number; exp: number };

    expect(decodedToken.exp - decodedToken.iat).toBe(ONE_HOUR_IN_SECONDS);
  });

  it('el token declara el emisor, la audiencia y el algoritmo HS256', () => {
    const token = new JwtTokenService().generateToken(sessionClaims);

    const decodedToken = jwt.decode(token, { complete: true });

    expect(decodedToken?.header.alg).toBe('HS256');
    expect(decodedToken?.payload).toMatchObject({ iss: ACCESS_TOKEN_ISSUER, aud: ACCESS_TOKEN_AUDIENCE });
  });

  it('rechaza un token cuya firma fue alterada', () => {
    const tokenService = new JwtTokenService();
    const tokenSegments = tokenService.generateToken(sessionClaims).split(TOKEN_SEGMENT_SEPARATOR);
    tokenSegments[SIGNATURE_SEGMENT_INDEX] = [...tokenSegments[SIGNATURE_SEGMENT_INDEX]].reverse().join('');

    expect(() => tokenService.verifyToken(tokenSegments.join(TOKEN_SEGMENT_SEPARATOR))).toThrow(
      InvalidAccessTokenError,
    );
  });

  it('rechaza un token firmado con otro secreto', () => {
    const forgedToken = jwt.sign(claimsInPayload, 'a-different-secret', {
      ...signedForApi,
      subject: sessionClaims.sub,
    });

    expect(() => new JwtTokenService().verifyToken(forgedToken)).toThrow(InvalidAccessTokenError);
  });

  it('rechaza un token caducado y lo marca como caducado, para que el frontend renueve', () => {
    const issuedTwoHoursAgo = Math.floor(Date.now() / MILLISECONDS_PER_SECOND) - TWO_HOURS * ONE_HOUR_IN_SECONDS;
    const expiredToken = jwt.sign(
      { ...claimsInPayload, iat: issuedTwoHoursAgo, exp: issuedTwoHoursAgo + ONE_HOUR_IN_SECONDS },
      env.JWT_SECRET,
      { ...signedForApi, subject: sessionClaims.sub },
    );

    expect(() => new JwtTokenService().verifyToken(expiredToken)).toThrow(expect.objectContaining({ isExpired: true }));
  });

  it('rechaza un token sin firma (algoritmo "none")', () => {
    const unsignedToken = jwt.sign(claimsInPayload, '', {
      ...signedForApi,
      subject: sessionClaims.sub,
      algorithm: 'none',
    });

    expect(() => new JwtTokenService().verifyToken(unsignedToken)).toThrow(InvalidAccessTokenError);
  });

  it('rechaza un token firmado con el mismo secreto pero otro algoritmo (H2: algoritmo fijo)', () => {
    const otherAlgorithmToken = jwt.sign(claimsInPayload, env.JWT_SECRET, {
      ...signedForApi,
      subject: sessionClaims.sub,
      algorithm: 'HS512',
    });

    expect(() => new JwtTokenService().verifyToken(otherAlgorithmToken)).toThrow(InvalidAccessTokenError);
  });

  it('rechaza un token de otro emisor o para otra audiencia, aunque esté bien firmado', () => {
    const otherAudienceToken = jwt.sign(claimsInPayload, env.JWT_SECRET, {
      issuer: ACCESS_TOKEN_ISSUER,
      audience: 'quotesflow-admin',
      subject: sessionClaims.sub,
    });
    const otherIssuerToken = jwt.sign(claimsInPayload, env.JWT_SECRET, {
      issuer: 'someone-else',
      audience: ACCESS_TOKEN_AUDIENCE,
      subject: sessionClaims.sub,
    });

    expect(() => new JwtTokenService().verifyToken(otherAudienceToken)).toThrow(InvalidAccessTokenError);
    expect(() => new JwtTokenService().verifyToken(otherIssuerToken)).toThrow(InvalidAccessTokenError);
  });

  it('rechaza un token de la versión anterior, sin sesión (sid)', () => {
    const legacyToken = jwt.sign({ tenantId: sessionClaims.tenantId, role: 'OWNER' }, env.JWT_SECRET, {
      ...signedForApi,
      subject: sessionClaims.sub,
    });

    expect(() => new JwtTokenService().verifyToken(legacyToken)).toThrow(expect.objectContaining({ isExpired: false }));
  });

  it('rechaza un texto que no es un token', () => {
    expect(() => new JwtTokenService().verifyToken('not-a-token')).toThrow(InvalidAccessTokenError);
  });
});
