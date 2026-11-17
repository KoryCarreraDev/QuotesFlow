import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { AccountToken, AccountTokenPurpose } from '@/domain/entities/AccountToken.js';
import { PrismaAccountTokenRepository } from '@/infrastructure/persistence/repositories/PrismaAccountTokenRepository.js';
import { persistTenant, persistUser } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F2-T04: tokens de cuenta de un solo uso contra PostgreSQL.

const ONE_HOUR_MS = 3_600_000;
const HALF_AN_HOUR_MS = 1_800_000;

let tenantId: string;
let userId: string;
let repository: PrismaAccountTokenRepository;

function tokenFor(purpose: AccountTokenPurpose, createdAt = new Date()): AccountToken {
  return new AccountToken(
    randomUUID(),
    tenantId,
    userId,
    purpose,
    'hash-del-secreto',
    new Date(createdAt.getTime() + ONE_HOUR_MS),
    createdAt,
  );
}

beforeEach(async () => {
  tenantId = (await persistTenant()).id;
  userId = (await persistUser(tenantId)).id;
  repository = new PrismaAccountTokenRepository(prisma, new FixedTenantContext(randomUUID()));
});

describe('PrismaAccountTokenRepository', () => {
  it('guarda un token y lo recupera sin usar', async () => {
    const token = tokenFor(AccountTokenPurpose.EMAIL_VERIFICATION);

    await repository.create(token);

    await expect(repository.findById(token.id)).resolves.toMatchObject({
      id: token.id,
      tenantId,
      userId,
      purpose: AccountTokenPurpose.EMAIL_VERIFICATION,
      usedAt: undefined,
    });
  });

  it('de dos canjes simultáneos del mismo token, solo uno gana', async () => {
    const token = tokenFor(AccountTokenPurpose.PASSWORD_RESET);
    await repository.create(token);

    const results = await Promise.all([repository.consume(token.id), repository.consume(token.id)]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('anular los tokens abiertos de un fin no toca los de otro fin', async () => {
    const verificationToken = tokenFor(AccountTokenPurpose.EMAIL_VERIFICATION);
    const resetToken = tokenFor(AccountTokenPurpose.PASSWORD_RESET);
    await repository.create(verificationToken);
    await repository.create(resetToken);

    await repository.invalidateOpenTokens(userId, AccountTokenPurpose.PASSWORD_RESET);

    expect((await repository.findById(resetToken.id))?.usedAt).toBeDefined();
    expect((await repository.findById(verificationToken.id))?.usedAt).toBeUndefined();
  });

  it('devuelve la fecha del último token abierto de un fin, o null si no hay', async () => {
    const olderCreatedAt = new Date(Date.now() - HALF_AN_HOUR_MS);
    const newerToken = tokenFor(AccountTokenPurpose.PASSWORD_RESET);
    await repository.create(tokenFor(AccountTokenPurpose.PASSWORD_RESET, olderCreatedAt));
    await repository.create(newerToken);

    await expect(repository.findLatestOpenTokenCreatedAt(userId, AccountTokenPurpose.PASSWORD_RESET)).resolves.toEqual(
      newerToken.createdAt,
    );
    await expect(
      repository.findLatestOpenTokenCreatedAt(userId, AccountTokenPurpose.EMAIL_VERIFICATION),
    ).resolves.toBeNull();
  });
});
