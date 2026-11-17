import { AccountToken, AccountTokenPurpose } from '../../../domain/entities/AccountToken.js';

/**
 * Tokens de cuenta de un solo uso (F2-T04). Sin filtro del tenant del contexto: se usan sin sesión (verificar,
 * recuperar) y cada token ya guarda su tenant y su usuario.
 */
export interface IAccountTokenRepository {
  create(token: AccountToken): Promise<void>;

  /** El token, usado o no; `null` si no existe. */
  findById(tokenId: string): Promise<AccountToken | null>;

  /**
   * Marca el token como usado solo si aún no lo estaba. De dos usos simultáneos del mismo enlace, solo uno gana.
   * @returns `false` si ya estaba usado.
   */
  consume(tokenId: string): Promise<boolean>;

  /** Anula los tokens sin usar del usuario para ese fin: solo vale el último enlace enviado. */
  invalidateOpenTokens(userId: string, purpose: AccountTokenPurpose): Promise<void>;

  /** Fecha del último token sin usar del usuario para ese fin, para no enviar correos en ráfaga. */
  findLatestOpenTokenCreatedAt(userId: string, purpose: AccountTokenPurpose): Promise<Date | null>;
}
