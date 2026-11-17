import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { User } from '@/domain/entities/User.js';
import { Role } from '@/domain/enums/Role.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { PrismaUserRepository } from '@/infrastructure/persistence/repositories/PrismaUserRepository.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { persistTenant, persistUser } from '@tests/support/database/persistenceFactories.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

describe('PrismaUserRepository', () => {
  let tenantId: string;
  let otherTenantId: string;
  let userRepository: PrismaUserRepository;

  beforeEach(async () => {
    tenantId = (await persistTenant()).id;
    otherTenantId = (await persistTenant({ name: 'Otra Empresa SAS' })).id;
    userRepository = new PrismaUserRepository(prisma, new FixedTenantContext(tenantId));
  });

  it('guarda un usuario y lo recupera por id con su rol y su tenant', async () => {
    const user = User.create({
      email: 'leader@example.com',
      passwordHash: 'stored-password-hash',
      firstName: 'Marta',
      lastName: 'Rojas',
      role: Role.SALES_LEADER,
      tenantId,
    });

    await userRepository.create(user);

    await expect(userRepository.findById(user.id)).resolves.toMatchObject({
      id: user.id,
      email: 'leader@example.com',
      passwordHash: 'stored-password-hash',
      firstName: 'Marta',
      lastName: 'Rojas',
      role: Role.SALES_LEADER,
      isActive: true,
      tenantId,
    });
  });

  it('findById devuelve null si el usuario no existe', async () => {
    await expect(userRepository.findById(NON_EXISTENT_ID)).resolves.toBeNull();
  });

  it('findById no devuelve un usuario de otra empresa', async () => {
    const foreignUser = await persistUser(otherTenantId);

    await expect(userRepository.findById(foreignUser.id)).resolves.toBeNull();
  });

  it('findByEmail encuentra al usuario en cualquier empresa: el correo es único en toda la plataforma', async () => {
    const foreignUser = await persistUser(otherTenantId, { email: 'someone@example.com' });

    const foundUser = await userRepository.findByEmail('someone@example.com');

    expect(foundUser?.id).toBe(foreignUser.id);
    expect(foundUser?.tenantId).toBe(otherTenantId);
  });

  it('findByEmail devuelve null si nadie usa ese correo', async () => {
    await expect(userRepository.findByEmail('nobody@example.com')).resolves.toBeNull();
  });

  it('la base de datos impide dos usuarios con el mismo correo, aunque sean de empresas distintas', async () => {
    await persistUser(otherTenantId, { email: 'someone@example.com' });
    const duplicatedEmailUser = User.create({
      email: 'someone@example.com',
      passwordHash: 'stored-password-hash',
      firstName: 'Marta',
      lastName: 'Rojas',
      role: Role.SALES_REP,
      tenantId,
    });

    await expect(userRepository.create(duplicatedEmailUser)).rejects.toThrow();
  });

  it('un correo duplicado se traduce a ConflictError EMAIL_ALREADY_IN_USE, no a un error de Prisma', async () => {
    await persistUser(otherTenantId, { email: 'someone@example.com' });
    const duplicatedEmailUser = User.create({
      email: 'someone@example.com',
      passwordHash: 'stored-password-hash',
      firstName: 'Marta',
      lastName: 'Rojas',
      role: Role.SALES_REP,
      tenantId,
    });

    const creation = userRepository.create(duplicatedEmailUser);

    await expect(creation).rejects.toBeInstanceOf(ConflictError);
    await expect(creation).rejects.toMatchObject({ code: ErrorCode.EMAIL_ALREADY_IN_USE });
  });

  describe('findActiveByEmail (H3)', () => {
    it('encuentra a un usuario activo de una empresa activa', async () => {
      const activeUser = await persistUser(tenantId, { email: 'active@example.com' });

      await expect(userRepository.findActiveByEmail('active@example.com')).resolves.toMatchObject({
        id: activeUser.id,
      });
    });

    it('no encuentra a un usuario desactivado', async () => {
      await persistUser(tenantId, { email: 'inactive@example.com', isActive: false });

      await expect(userRepository.findActiveByEmail('inactive@example.com')).resolves.toBeNull();
    });

    it('no encuentra a un usuario borrado', async () => {
      await persistUser(tenantId, { email: 'deleted@example.com', deleted: DeletedState.INACTIVE });

      await expect(userRepository.findActiveByEmail('deleted@example.com')).resolves.toBeNull();
    });

    it('no encuentra a un usuario de una empresa borrada', async () => {
      const deletedTenantId = (await persistTenant({ name: 'Empresa Borrada', deleted: DeletedState.INACTIVE })).id;
      await persistUser(deletedTenantId, { email: 'orphan@example.com' });

      await expect(userRepository.findActiveByEmail('orphan@example.com')).resolves.toBeNull();
    });
  });

  it('findById no devuelve un usuario borrado: no se le pueden asignar leads', async () => {
    const deletedUser = await persistUser(tenantId, { deleted: DeletedState.INACTIVE });

    await expect(userRepository.findById(deletedUser.id)).resolves.toBeNull();
  });
});

// F2-T03: contador de fallos de login y bloqueo.
describe('PrismaUserRepository: intentos de login fallidos', () => {
  it('cuenta los fallos de forma atómica: diez simultáneos suman diez', async () => {
    const SIMULTANEOUS_FAILURES = 10;
    const tenant = await persistTenant();
    const user = await persistUser(tenant.id);
    const repository = new PrismaUserRepository(prisma, new FixedTenantContext(tenant.id));

    await Promise.all(Array.from({ length: SIMULTANEOUS_FAILURES }, () => repository.recordFailedLogin(user.id)));

    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(storedUser.failedLoginAttempts).toBe(SIMULTANEOUS_FAILURES);
  });

  it('bloquea hasta un momento y, tras un acierto, quita bloqueo y contador', async () => {
    const LOCK_MS = 60_000;
    const tenant = await persistTenant();
    const user = await persistUser(tenant.id);
    const repository = new PrismaUserRepository(prisma, new FixedTenantContext(tenant.id));
    const lockedUntil = new Date(Date.now() + LOCK_MS);
    await repository.recordFailedLogin(user.id);
    await repository.lockLogin(user.id, lockedUntil);

    const lockedUser = await repository.findActiveByEmail(user.email);
    await repository.clearFailedLogins(user.id);
    const clearedUser = await repository.findActiveByEmail(user.email);

    expect(lockedUser?.loginLockedUntil).toEqual(lockedUntil);
    expect(lockedUser?.failedLoginAttempts).toBe(1);
    expect(clearedUser?.loginLockedUntil).toBeUndefined();
    expect(clearedUser?.failedLoginAttempts).toBe(0);
  });
});
