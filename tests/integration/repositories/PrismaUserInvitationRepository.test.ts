import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { UserInvitation } from '@/domain/entities/UserInvitation.js';
import { Role } from '@/domain/enums/Role.js';
import { PrismaUserInvitationRepository } from '@/infrastructure/persistence/repositories/PrismaUserInvitationRepository.js';
import { PrismaUserRepository } from '@/infrastructure/persistence/repositories/PrismaUserRepository.js';
import { persistTenant, persistUser, persistUserInvitation } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

// F2-T05: invitaciones y gestión de usuarios contra PostgreSQL, siempre dentro del tenant (R5).

const ONE_DAY_MS = 86_400_000;

let tenantId: string;
let ownerId: string;
let otherTenantId: string;
let otherOwnerId: string;
let repository: PrismaUserInvitationRepository;

beforeEach(async () => {
  tenantId = (await persistTenant()).id;
  ownerId = (await persistUser(tenantId, { role: Role.OWNER })).id;
  otherTenantId = (await persistTenant({ name: 'Otra Empresa SAS' })).id;
  otherOwnerId = (await persistUser(otherTenantId, { role: Role.OWNER })).id;
  repository = new PrismaUserInvitationRepository(prisma, new FixedTenantContext(tenantId));
});

describe('PrismaUserInvitationRepository', () => {
  it('guarda una invitación y la lista como pendiente', async () => {
    const invitation = new UserInvitation(
      randomUUID(),
      tenantId,
      'ana@example.com',
      Role.SALES_REP,
      ownerId,
      'hash',
      new Date(Date.now() + ONE_DAY_MS),
      new Date(),
    );

    await repository.create(invitation);

    await expect(repository.listPending()).resolves.toEqual([
      expect.objectContaining({ id: invitation.id, email: 'ana@example.com', role: Role.SALES_REP }),
    ]);
  });

  it('no lista ni encuentra invitaciones de otra empresa, ni caducadas, ni revocadas', async () => {
    const foreign = await persistUserInvitation(otherTenantId, otherOwnerId);
    await persistUserInvitation(tenantId, ownerId, { expiresAt: new Date(Date.now() - ONE_DAY_MS) });
    await persistUserInvitation(tenantId, ownerId, { revokedAt: new Date() });

    await expect(repository.listPending()).resolves.toEqual([]);
    await expect(repository.findById(foreign.id)).resolves.toBeNull();
    await expect(repository.findByIdAcrossTenants(foreign.id)).resolves.not.toBeNull();
  });

  it('revocar una invitación de otra empresa no la toca', async () => {
    const foreign = await persistUserInvitation(otherTenantId, otherOwnerId);

    await repository.revoke(foreign.id);

    const storedInvitation = await prisma.userInvitation.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(storedInvitation.revokedAt).toBeNull();
  });

  it('revoca las pendientes de un correo solo en la empresa actual', async () => {
    const own = await persistUserInvitation(tenantId, ownerId, { email: 'misma@example.com' });
    const foreign = await persistUserInvitation(otherTenantId, otherOwnerId, { email: 'misma@example.com' });

    await repository.revokePendingForEmail('misma@example.com');

    expect((await prisma.userInvitation.findUniqueOrThrow({ where: { id: own.id } })).revokedAt).not.toBeNull();
    expect((await prisma.userInvitation.findUniqueOrThrow({ where: { id: foreign.id } })).revokedAt).toBeNull();
  });

  it('de dos aceptaciones simultáneas solo una gana', async () => {
    const invitation = await persistUserInvitation(tenantId, ownerId);

    const results = await Promise.all([repository.markAccepted(invitation.id), repository.markAccepted(invitation.id)]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('PrismaUserRepository: gestión de usuarios (F2-T05)', () => {
  it('lista solo los usuarios no borrados de la empresa actual', async () => {
    const userRepository = new PrismaUserRepository(prisma, new FixedTenantContext(tenantId));

    const users = await userRepository.listByTenant();

    expect(users.map((user) => user.id)).toEqual([ownerId]);
  });

  it('cambiar rol y estado de un usuario de otra empresa no hace nada', async () => {
    const userRepository = new PrismaUserRepository(prisma, new FixedTenantContext(tenantId));

    await userRepository.updateRoleAndStatus(otherOwnerId, { role: Role.SALES_REP, isActive: false });

    await expect(prisma.user.findUniqueOrThrow({ where: { id: otherOwnerId } })).resolves.toMatchObject({
      role: Role.OWNER,
      isActive: true,
    });
  });
});
