import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { User } from '@/domain/entities/User.js';
import { Role } from '@/domain/enums/Role.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { PrismaUserRepository } from '@/infrastructure/persistence/repositories/PrismaUserRepository.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { persistTenant, persistUser } from '@tests/support/database/persistenceFactories.js';
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
});
