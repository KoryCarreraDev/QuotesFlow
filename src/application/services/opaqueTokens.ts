import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Tokens opacos de un solo uso o rotatorios (refresh de sesión, verificación de correo, recuperación de
// contraseña, invitaciones). El navegador recibe el secreto; la base guarda solo su hash SHA-256, así una
// copia robada de la base no sirve para entrar.

// 32 bytes = 256 bits de entropía: imposible de adivinar, por eso basta un hash rápido (no bcrypt).
const SECRET_BYTES = 32;
const TOKEN_PART_SEPARATOR = '.';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Secreto aleatorio en base64url. */
export function generateOpaqueSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

/** Hash SHA-256 (hex) del secreto: lo único que se guarda. */
export function hashOpaqueSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Compara dos hashes en tiempo constante, para no revelar por el tiempo cuántos caracteres coinciden. */
export function hashesMatch(firstHash: string, secondHash: string): boolean {
  const first = Buffer.from(firstHash);
  const second = Buffer.from(secondHash);
  return first.length === second.length && timingSafeEqual(first, second);
}

/** Token compuesto `<id>.<secreto>`: el id localiza el registro sin consultar por el secreto. */
export interface CompositeToken {
  recordId: string;
  secret: string;
}

export function buildCompositeToken(recordId: string, secret: string): string {
  return `${recordId}${TOKEN_PART_SEPARATOR}${secret}`;
}

/** Separa un token compuesto; `null` si no tiene la forma esperada. */
export function parseCompositeToken(token: string): CompositeToken | null {
  const separatorIndex = token.lastIndexOf(TOKEN_PART_SEPARATOR);
  if (separatorIndex <= 0) return null;
  const recordId = token.slice(0, separatorIndex);
  const secret = token.slice(separatorIndex + TOKEN_PART_SEPARATOR.length);
  return BASE64URL_PATTERN.test(secret) ? { recordId, secret } : null;
}
