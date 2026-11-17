import { randomUUID } from 'node:crypto';
import { UserSession } from '../../domain/entities/UserSession.js';
import { ISessionRepository } from '../ports/repositories/ISessionRepository.js';
import { IAuthTokenService } from '../ports/services/IAuthTokenService.js';
import { buildCompositeToken, generateOpaqueSecret, hashOpaqueSecret } from './opaqueTokens.js';

/** Duración de las sesiones, desde la configuración (`REFRESH_TOKEN_EXPIRATION`). */
export interface SessionPolicy {
  /** Vida absoluta de la sesión: renovar no la alarga. */
  refreshTokenLifetimeMs: number;
}

/** Los dos tokens que recibe el navegador, cada uno en su cookie HTTP-only. */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
}

/** Usuario para el que se abre la sesión. */
export interface SessionOwner {
  id: string;
  tenantId: string;
}

/**
 * Abre sesiones (F2-T02, D-09): guarda la sesión con el hash del refresh token y emite el token de acceso
 * corto. Lo usan el login y, en F2-T05, aceptar una invitación.
 */
export class SessionIssuer {
  constructor(
    private readonly sessionRepository: ISessionRepository,
    private readonly authTokenService: IAuthTokenService,
    private readonly sessionPolicy: SessionPolicy,
  ) {}

  /** Crea la sesión. Si hay una transacción abierta, se escribe en ella. */
  async open(owner: SessionOwner): Promise<IssuedSession> {
    const refreshSecret = generateOpaqueSecret();
    const session = new UserSession(
      randomUUID(),
      owner.tenantId,
      owner.id,
      hashOpaqueSecret(refreshSecret),
      new Date(Date.now() + this.sessionPolicy.refreshTokenLifetimeMs),
    );
    await this.sessionRepository.create(session);
    return {
      accessToken: this.accessTokenFor(session),
      refreshToken: buildCompositeToken(session.id, refreshSecret),
    };
  }

  /** Token de acceso corto de una sesión ya abierta. */
  accessTokenFor(session: Pick<UserSession, 'id' | 'userId' | 'tenantId'>): string {
    return this.authTokenService.generateToken({ sub: session.userId, tenantId: session.tenantId, sid: session.id });
  }
}
