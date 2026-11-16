import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { IPayload } from '@/application/ports/services/IAuthTokenService.js';
import { env } from '@/config/env.js';
import { Role } from '@/domain/enums/Role.js';
import { BcryptHashService } from '@/infrastructure/services/BcryptHashService.js';
import { JwTokenService } from '@/infrastructure/services/JwtTokenService.js';

const PLAIN_PASSWORD = 'Correct-Horse-Battery-9';
const TOKEN_SEGMENT_SEPARATOR = '.';
const SIGNATURE_SEGMENT_INDEX = 2;
const ONE_HOUR_IN_SECONDS = 3600;

const sessionPayload: IPayload = {
  sub: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  role: Role.SALES_LEADER,
};

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

describe('JwTokenService', () => {
  it('un token emitido se verifica y devuelve el usuario, el tenant y el rol', () => {
    const tokenService = new JwTokenService();

    const verifiedPayload = tokenService.verifyToken(tokenService.generateToken(sessionPayload));

    expect(verifiedPayload).toMatchObject(sessionPayload);
  });

  it('el token emitido caduca', () => {
    const tokenService = new JwTokenService();

    const decodedToken = jwt.decode(tokenService.generateToken(sessionPayload)) as { iat: number; exp: number };

    expect(decodedToken.exp).toBeGreaterThan(decodedToken.iat);
  });

  it('rechaza un token cuya firma fue alterada', () => {
    const tokenService = new JwTokenService();
    const tokenSegments = tokenService.generateToken(sessionPayload).split(TOKEN_SEGMENT_SEPARATOR);
    tokenSegments[SIGNATURE_SEGMENT_INDEX] = [...tokenSegments[SIGNATURE_SEGMENT_INDEX]].reverse().join('');

    expect(() => tokenService.verifyToken(tokenSegments.join(TOKEN_SEGMENT_SEPARATOR))).toThrow();
  });

  it('rechaza un token firmado con otro secreto', () => {
    const forgedToken = jwt.sign(sessionPayload, 'a-different-secret');

    expect(() => new JwTokenService().verifyToken(forgedToken)).toThrow();
  });

  it('rechaza un token caducado', () => {
    const issuedTwoHoursAgo = Math.floor(Date.now() / 1000) - 2 * ONE_HOUR_IN_SECONDS;
    const expiredToken = jwt.sign(
      { ...sessionPayload, iat: issuedTwoHoursAgo, exp: issuedTwoHoursAgo + ONE_HOUR_IN_SECONDS },
      env.JWT_SECRET,
    );

    expect(() => new JwTokenService().verifyToken(expiredToken)).toThrow();
  });

  it('rechaza un token sin firma (algoritmo "none")', () => {
    const unsignedToken = jwt.sign(sessionPayload, '', { algorithm: 'none' });

    expect(() => new JwTokenService().verifyToken(unsignedToken)).toThrow();
  });

  it('rechaza un texto que no es un token', () => {
    expect(() => new JwTokenService().verifyToken('not-a-token')).toThrow();
  });
});
