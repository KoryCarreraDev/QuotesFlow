import { IAccountTokenRepository } from '@/application/ports/repositories/IAccountTokenRepository.js';
import { AccountToken, AccountTokenPurpose } from '@/domain/entities/AccountToken.js';

/** Doble en memoria de `IAccountTokenRepository`. */
export class InMemoryAccountTokenRepository implements IAccountTokenRepository {
  private readonly tokensById = new Map<string, AccountToken>();

  seed(...tokens: AccountToken[]): void {
    for (const token of tokens) this.tokensById.set(token.id, token);
  }

  listStored(): AccountToken[] {
    return [...this.tokensById.values()];
  }

  async create(token: AccountToken): Promise<void> {
    this.tokensById.set(token.id, token);
  }

  async findById(tokenId: string): Promise<AccountToken | null> {
    return this.tokensById.get(tokenId) ?? null;
  }

  async consume(tokenId: string): Promise<boolean> {
    const token = this.tokensById.get(tokenId);
    if (!token || token.usedAt) return false;
    this.tokensById.set(tokenId, used(token));
    return true;
  }

  async invalidateOpenTokens(userId: string, purpose: AccountTokenPurpose): Promise<void> {
    for (const token of this.tokensById.values()) {
      if (token.userId === userId && token.purpose === purpose && !token.usedAt) {
        this.tokensById.set(token.id, used(token));
      }
    }
  }

  async findLatestOpenTokenCreatedAt(userId: string, purpose: AccountTokenPurpose): Promise<Date | null> {
    const openTokens = this.listStored()
      .filter((token) => token.isUsableAt(new Date(), purpose) && token.userId === userId)
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime());
    return openTokens[0]?.createdAt ?? null;
  }
}

function used(token: AccountToken): AccountToken {
  return new AccountToken(
    token.id,
    token.tenantId,
    token.userId,
    token.purpose,
    token.tokenHash,
    token.expiresAt,
    token.createdAt,
    new Date(),
  );
}
