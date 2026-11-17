import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { SessionRevocationReason, UserSession } from '@/domain/entities/UserSession.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Role } from '@/domain/enums/Role.js';
import { PrismaSessionRepository } from '@/infrastructure/persistence/repositories/PrismaSessionRepository.js';
import { persistTenant, persistUser } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F2-T02: sesiones contra PostgreSQL. Autenticar exige sesión abierta y usuario y empresa activos (H2).

const ONE_DAY_MS = 86_400_000;
const ONE_SECOND_MS = 1_000;

let tenantId: string;
let userId: string;
let repository: PrismaSessionRepository;

function sessionFor(owner: string, overrides: { expiresAt?: Date; hash?: string } = {}): UserSession {
  return new UserSession(
    randomUUID(),
    tenantId,
    owner,
    overrides.hash ?? 'hash-actual',
    overrides.expiresAt ?? new Date(Date.now() + ONE_DAY_MS),
  );
}

beforeEach(async () => {
  tenantId = (await persistTenant()).id;
  userId = (await persistUser(tenantId, { role: Role.SALES_LEADER })).id;
  // Sin tenant en el contexto a propósito: el repositorio no debe depender de él.
  repository = new PrismaSessionRepository(prisma, new FixedTenantContext(randomUUID()));
});

describe('PrismaSessionRepository', () => {
  it('guarda una sesión y la recupera por id', async () => {
    const session = sessionFor(userId);

    await repository.create(session);

    await expect(repository.findById(session.id)).resolves.toMatchObject({
      id: session.id,
      tenantId,
      userId,
      refreshTokenHash: 'hash-actual',
      revokedAt: undefined,
    });
  });

  it('autentica una sesión abierta con el rol actual del usuario', async () => {
    const session = sessionFor(userId);
    await repository.create(session);
    await prisma.user.update({ where: { id: userId }, data: { role: Role.SALES_REP } });

    await expect(repository.findAuthenticatedSession(session.id, userId, tenantId)).resolves.toEqual({
      sessionId: session.id,
      userId,
      tenantId,
      role: Role.SALES_REP,
    });
  });

  it.each([
    ['revocada', async (session: UserSession) => repository.revoke(session.id, SessionRevocationReason.LOGOUT)],
    ['de un usuario desactivado', async () => prisma.user.update({ where: { id: userId }, data: { isActive: false } })],
    [
      'de un usuario borrado',
      async () => prisma.user.update({ where: { id: userId }, data: { deleted: DeletedState.INACTIVE } }),
    ],
    [
      'de una empresa borrada',
      async () => prisma.tenant.update({ where: { id: tenantId }, data: { deleted: DeletedState.INACTIVE } }),
    ],
  ])('no autentica una sesión %s', async (_case, makeUnusable) => {
    const session = sessionFor(userId);
    await repository.create(session);
    await makeUnusable(session);

    await expect(repository.findAuthenticatedSession(session.id, userId, tenantId)).resolves.toBeNull();
  });

  it('no autentica una sesión caducada', async () => {
    const session = sessionFor(userId, { expiresAt: new Date(Date.now() - ONE_SECOND_MS) });
    await repository.create(session);

    await expect(repository.findAuthenticatedSession(session.id, userId, tenantId)).resolves.toBeNull();
  });

  it('no autentica si el usuario o la empresa del token no son los de la sesión', async () => {
    const otherUserId = (await persistUser(tenantId)).id;
    const otherTenantId = (await persistTenant({ name: 'Otra Empresa SAS' })).id;
    const session = sessionFor(userId);
    await repository.create(session);

    await expect(repository.findAuthenticatedSession(session.id, otherUserId, tenantId)).resolves.toBeNull();
    await expect(repository.findAuthenticatedSession(session.id, userId, otherTenantId)).resolves.toBeNull();
  });

  it('rota el refresh token solo si el hash actual coincide: de dos rotaciones con el mismo, gana una', async () => {
    const session = sessionFor(userId);
    await repository.create(session);

    const results = await Promise.all([
      repository.rotateRefreshToken(session.id, 'hash-actual', 'hash-nuevo-a'),
      repository.rotateRefreshToken(session.id, 'hash-actual', 'hash-nuevo-b'),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const storedSession = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(['hash-nuevo-a', 'hash-nuevo-b']).toContain(storedSession.refreshTokenHash);
    expect(storedSession.lastRefreshedAt).not.toBeNull();
  });

  it('no rota una sesión revocada', async () => {
    const session = sessionFor(userId);
    await repository.create(session);
    await repository.revoke(session.id, SessionRevocationReason.LOGOUT);

    await expect(repository.rotateRefreshToken(session.id, 'hash-actual', 'hash-nuevo')).resolves.toBe(false);
  });

  it('revocar guarda el momento y el motivo, y no pisa una revocación anterior', async () => {
    const session = sessionFor(userId);
    await repository.create(session);

    await repository.revoke(session.id, SessionRevocationReason.REFRESH_TOKEN_REUSED);
    await repository.revoke(session.id, SessionRevocationReason.LOGOUT);

    const storedSession = await prisma.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(storedSession.revokedAt).not.toBeNull();
    expect(storedSession.revokedReason).toBe('REFRESH_TOKEN_REUSED');
  });

  it('revoca todas las sesiones abiertas de un usuario y ninguna de otro', async () => {
    const otherUserId = (await persistUser(tenantId)).id;
    await repository.create(sessionFor(userId));
    await repository.create(sessionFor(userId));
    const otherUserSession = sessionFor(otherUserId);
    await repository.create(otherUserSession);

    const revokedCount = await repository.revokeAllForUser(userId, SessionRevocationReason.LOGOUT_ALL);

    // Más la sesión de test que `persistUser` abre para cada usuario.
    const SESSIONS_OF_USER = 3;
    expect(revokedCount).toBe(SESSIONS_OF_USER);
    await expect(
      repository.findAuthenticatedSession(otherUserSession.id, otherUserId, tenantId),
    ).resolves.not.toBeNull();
  });
});
