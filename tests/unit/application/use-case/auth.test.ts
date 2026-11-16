import { describe, expect, it } from 'vitest';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import { RegisterCompanyDTO } from '@/application/dtos/RegisterCompanyDTO.js';
import { LoginUseCase } from '@/application/use-case/auth/LoginUseCase.js';
import { RegisterCompanyAndOwnerUseCase } from '@/application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { DEFAULT_TEST_TENANT_ID, buildUser } from '@tests/support/builders/entityBuilders.js';
import { FakeAuthTokenService } from '@tests/support/doubles/FakeAuthTokenService.js';
import { FakeHashService } from '@tests/support/doubles/FakeHashService.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryLeadStatusConfigRepository } from '@tests/support/doubles/InMemoryLeadStatusConfigRepository.js';
import { InMemoryTenantRepository } from '@tests/support/doubles/InMemoryTenantRepository.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';

const PLAIN_PASSWORD = 'Correct-Horse-Battery-9';

describe('LoginUseCase', () => {
  async function setupLogin() {
    const hashService = new FakeHashService();
    const authTokenService = new FakeAuthTokenService();
    const userRepository = new InMemoryUserRepository(new FixedTenantContext(DEFAULT_TEST_TENANT_ID));
    const registeredUser = buildUser({
      email: 'owner@example.com',
      passwordHash: await hashService.hash(PLAIN_PASSWORD),
      role: Role.OWNER,
    });
    userRepository.seed(registeredUser);

    const loginUseCase = new LoginUseCase(userRepository, hashService, authTokenService);
    return { loginUseCase, authTokenService, registeredUser };
  }

  it('emite un token con el id del usuario, su tenant y su rol', async () => {
    const { loginUseCase, authTokenService, registeredUser } = await setupLogin();

    const result = await loginUseCase.execute({ email: 'owner@example.com', password: PLAIN_PASSWORD });

    expect(authTokenService.verifyToken(result.token)).toEqual({
      sub: registeredUser.id,
      tenantId: registeredUser.tenantId,
      role: Role.OWNER,
    });
  });

  it('rechaza una contraseña incorrecta y no emite token', async () => {
    const { loginUseCase, authTokenService } = await setupLogin();

    await expect(
      loginUseCase.execute({ email: 'owner@example.com', password: 'wrong-password' }),
    ).rejects.toThrow('Invalid Credentials');
    expect(authTokenService.issuedPayloads).toHaveLength(0);
  });

  it('rechaza un correo desconocido con el mismo mensaje que una contraseña incorrecta', async () => {
    const { loginUseCase, authTokenService } = await setupLogin();

    // Mismo mensaje en ambos casos: el login no debe revelar si un correo está registrado.
    await expect(
      loginUseCase.execute({ email: 'unknown@example.com', password: PLAIN_PASSWORD }),
    ).rejects.toThrow('Invalid Credentials');
    expect(authTokenService.issuedPayloads).toHaveLength(0);
  });
});

describe('RegisterCompanyAndOwnerUseCase', () => {
  const registration: RegisterCompanyDTO = {
    companyName: 'Aluminios Andinos SAS',
    ownerEmail: 'owner@example.com',
    password: PLAIN_PASSWORD,
    ownerFirstName: 'Carlos',
    ownerLastName: 'Pérez',
  };

  function setupRegistration() {
    const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
    const tenantRepository = new InMemoryTenantRepository();
    const userRepository = new InMemoryUserRepository(tenantContext);
    const leadStatusRepository = new InMemoryLeadStatusConfigRepository(tenantContext);
    const hashService = new FakeHashService();

    const registerUseCase = new RegisterCompanyAndOwnerUseCase(
      tenantRepository,
      userRepository,
      hashService,
      leadStatusRepository,
    );
    return { registerUseCase, tenantRepository, userRepository, leadStatusRepository, hashService };
  }

  it('crea la empresa y devuelve los ids de la empresa y de su dueño', async () => {
    const { registerUseCase, tenantRepository, userRepository } = setupRegistration();

    const result = await registerUseCase.execute(registration);

    const [createdTenant] = tenantRepository.listStored();
    const [createdOwner] = userRepository.listStored();
    expect(createdTenant.name).toBe('Aluminios Andinos SAS');
    expect(result).toEqual({ tenantId: createdTenant.id, ownerId: createdOwner.id });
  });

  it('crea al dueño con rol OWNER, activo y dentro de la empresa nueva', async () => {
    const { registerUseCase, userRepository } = setupRegistration();

    const result = await registerUseCase.execute(registration);

    const [createdOwner] = userRepository.listStored();
    expect(createdOwner).toMatchObject({
      email: 'owner@example.com',
      firstName: 'Carlos',
      lastName: 'Pérez',
      role: Role.OWNER,
      isActive: true,
      tenantId: result.tenantId,
    });
  });

  it('guarda la contraseña con hash, nunca en texto plano', async () => {
    const { registerUseCase, userRepository, hashService } = setupRegistration();

    await registerUseCase.execute(registration);

    const [createdOwner] = userRepository.listStored();
    expect(createdOwner.passwordHash).not.toBe(PLAIN_PASSWORD);
    await expect(hashService.compare(PLAIN_PASSWORD, createdOwner.passwordHash)).resolves.toBe(true);
  });

  it('crea los cinco estados de lead por defecto en la empresa nueva, con Nuevo como predeterminado', async () => {
    const { registerUseCase, leadStatusRepository } = setupRegistration();

    const result = await registerUseCase.execute(registration);

    const createdStatuses = await leadStatusRepository.findAllByTenant(result.tenantId);
    expect(createdStatuses.map((status) => status.name)).toEqual(defaultLeadStatuses.map((status) => status.name));
    expect(createdStatuses.filter((status) => status.isDefault).map((status) => status.name)).toEqual(['Nuevo']);
    expect(createdStatuses.every((status) => status.tenantId === result.tenantId)).toBe(true);
  });

  it('rechaza un correo ya registrado y no crea empresa, usuario ni estados', async () => {
    const { registerUseCase, tenantRepository, userRepository, leadStatusRepository } = setupRegistration();
    userRepository.seed(buildUser({ email: 'owner@example.com' }));

    await expect(registerUseCase.execute(registration)).rejects.toThrow('Email already in use');

    expect(tenantRepository.listStored()).toHaveLength(0);
    expect(userRepository.listStored()).toHaveLength(1);
    expect(leadStatusRepository.listStored()).toHaveLength(0);
  });
});
