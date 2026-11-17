import { randomUUID } from 'node:crypto';
import { AccountToken, AccountTokenPurpose } from '../../domain/entities/AccountToken.js';
import { ErrorCode } from '../../domain/errors/ErrorCode.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';
import { IAccountTokenRepository } from '../ports/repositories/IAccountTokenRepository.js';
import {
  buildCompositeToken,
  generateOpaqueSecret,
  hashesMatch,
  hashOpaqueSecret,
  parseCompositeToken,
} from './opaqueTokens.js';

/** D-12: el enlace de verificación dura un día. */
export const EMAIL_VERIFICATION_LIFETIME_HOURS = 24;
/** El de recuperación dura poco: quien tenga acceso al buzón un rato después no debe poder usarlo. */
export const PASSWORD_RESET_LIFETIME_MINUTES = 30;

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

const LIFETIME_MS_BY_PURPOSE: ReadonlyMap<AccountTokenPurpose, number> = new Map([
  [
    AccountTokenPurpose.EMAIL_VERIFICATION,
    EMAIL_VERIFICATION_LIFETIME_HOURS * MINUTES_PER_HOUR * MILLISECONDS_PER_MINUTE,
  ],
  [AccountTokenPurpose.PASSWORD_RESET, PASSWORD_RESET_LIFETIME_MINUTES * MILLISECONDS_PER_MINUTE],
]);

/** Dueño del token. */
export interface AccountTokenOwner {
  id: string;
  tenantId: string;
}

/**
 * Emite y canjea tokens de cuenta de un solo uso (F2-T04). Emitir anula los anteriores del mismo fin; canjear
 * comprueba el secreto en tiempo constante y lo marca como usado de forma atómica.
 */
export class AccountTokenIssuer {
  constructor(private readonly accountTokenRepository: IAccountTokenRepository) {}

  /** Crea el token y devuelve su valor completo, para el enlace del correo. Solo vale el último emitido. */
  async issue(owner: AccountTokenOwner, purpose: AccountTokenPurpose): Promise<string> {
    await this.accountTokenRepository.invalidateOpenTokens(owner.id, purpose);
    const secret = generateOpaqueSecret();
    const now = new Date();
    const token = new AccountToken(
      randomUUID(),
      owner.tenantId,
      owner.id,
      purpose,
      hashOpaqueSecret(secret),
      new Date(now.getTime() + (LIFETIME_MS_BY_PURPOSE.get(purpose) ?? 0)),
      now,
    );
    await this.accountTokenRepository.create(token);
    return buildCompositeToken(token.id, secret);
  }

  /**
   * Canjea el token: lo marca como usado y devuelve sus datos.
   *
   * @throws {ValidationError} `INVALID_ACCOUNT_TOKEN` si no existe, no coincide, caducó, ya se usó o es para otro
   * fin; no dice cuál.
   */
  async redeem(presentedToken: string, purpose: AccountTokenPurpose): Promise<AccountToken> {
    const storedToken = await this.inspect(presentedToken, purpose);
    if (!(await this.accountTokenRepository.consume(storedToken.id))) throw invalidAccountTokenError();
    return storedToken;
  }

  /**
   * Comprueba el token sin gastarlo (por ejemplo, para validar la contraseña nueva antes de canjearlo).
   *
   * @throws {ValidationError} `INVALID_ACCOUNT_TOKEN`, igual que `redeem`.
   */
  async inspect(presentedToken: string, purpose: AccountTokenPurpose): Promise<AccountToken> {
    const parsedToken = parseCompositeToken(presentedToken);
    const storedToken = parsedToken ? await this.accountTokenRepository.findById(parsedToken.recordId) : null;
    if (
      !parsedToken ||
      !storedToken ||
      !hashesMatch(hashOpaqueSecret(parsedToken.secret), storedToken.tokenHash) ||
      !storedToken.isUsableAt(new Date(), purpose)
    ) {
      throw invalidAccountTokenError();
    }
    return storedToken;
  }
}

function invalidAccountTokenError(): ValidationError {
  return new ValidationError(ErrorCode.INVALID_ACCOUNT_TOKEN, 'Token is invalid, expired or already used');
}
