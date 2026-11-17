import { type AccountToken as AccountTokenRecord } from '@prisma/client';
import { IAccountTokenRepository } from '../../../application/ports/repositories/IAccountTokenRepository.js';
import { AccountToken, AccountTokenPurpose } from '../../../domain/entities/AccountToken.js';
import { BasePrismaRepository } from './BasePrismaRepository.js';

function toDomain(record: AccountTokenRecord): AccountToken {
  return new AccountToken(
    record.id,
    record.tenantId,
    record.userId,
    record.purpose as AccountTokenPurpose,
    record.tokenHash,
    record.expiresAt,
    record.createdAt,
    record.usedAt ?? undefined,
  );
}

/** Adaptador de `IAccountTokenRepository`. Sin filtro del tenant del contexto: se usa sin sesión. */
export class PrismaAccountTokenRepository extends BasePrismaRepository implements IAccountTokenRepository {
  async create(token: AccountToken): Promise<void> {
    await this.prisma.accountToken.create({
      data: {
        id: token.id,
        tenantId: token.tenantId,
        userId: token.userId,
        purpose: token.purpose,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
      },
    });
  }

  async findById(tokenId: string): Promise<AccountToken | null> {
    const record = await this.prisma.accountToken.findUnique({ where: { id: tokenId } });
    return record ? toDomain(record) : null;
  }

  async consume(tokenId: string): Promise<boolean> {
    // Comparar y cambiar en una sentencia: un enlace abierto dos veces a la vez solo se canjea una.
    const { count } = await this.prisma.accountToken.updateMany({
      where: { id: tokenId, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  async invalidateOpenTokens(userId: string, purpose: AccountTokenPurpose): Promise<void> {
    await this.prisma.accountToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  async findLatestOpenTokenCreatedAt(userId: string, purpose: AccountTokenPurpose): Promise<Date | null> {
    const record = await this.prisma.accountToken.findFirst({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return record?.createdAt ?? null;
  }
}
