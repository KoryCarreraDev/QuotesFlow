import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LeadStatusConfigMapper } from '@/application/mappers/LeadConfigStatusMapper.js';
import { CreateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { GetLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Role } from '@/domain/enums/Role.js';
import {
  DEFAULT_TEST_TENANT_ID,
  NON_EXISTENT_ID,
  buildLeadStatusConfig,
} from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryLeadStatusConfigRepository } from '@tests/support/doubles/InMemoryLeadStatusConfigRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';

const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';

// Roles que pueden configurar los estados de lead. SALES_REP no puede.
const ROLES_ALLOWED_TO_CONFIGURE_STATUSES = [Role.OWNER, Role.PARTNER, Role.SALES_LEADER];

function setupLeadStatusUseCases() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const leadStatusRepository = new InMemoryLeadStatusConfigRepository(tenantContext);
  const leadStatusMapper = new LeadStatusConfigMapper();

  const defaultStatus = buildLeadStatusConfig({ name: 'Nuevo', order: 1, isDefault: true });
  const contactedStatus = buildLeadStatusConfig({ name: 'Contactado', order: 2, color: '#F59E0B' });
  leadStatusRepository.seed(defaultStatus, contactedStatus);

  async function listDefaultStatusNames(): Promise<Array<string | undefined>> {
    const statuses = await leadStatusRepository.findAllByTenant(DEFAULT_TEST_TENANT_ID);
    return statuses.filter((status) => status.isDefault).map((status) => status.name);
  }

  return {
    leadStatusRepository,
    defaultStatus,
    contactedStatus,
    listDefaultStatusNames,
    getLeadStatusUseCase: new GetLeadStatusConfigUseCase(leadStatusRepository, leadStatusMapper, tenantContext),
    createLeadStatusUseCase: new CreateLeadStatusConfigUseCase(
      leadStatusRepository,
      leadStatusMapper,
      tenantContext,
      new RecordingAuditLogger(),
    ),
    updateLeadStatusUseCase: new UpdateLeadStatusConfigUseCase(
      leadStatusRepository,
      leadStatusMapper,
      tenantContext,
      new RecordingAuditLogger(),
    ),
  };
}

describe('GetLeadStatusConfigUseCase', () => {
  it('devuelve los estados de la empresa ordenados por su campo de orden', async () => {
    const { getLeadStatusUseCase, leadStatusRepository } = setupLeadStatusUseCases();
    leadStatusRepository.seed(buildLeadStatusConfig({ name: 'Antes de todo', order: 0 }));

    const statuses = await getLeadStatusUseCase.execute();

    expect(statuses.map((status) => status.name)).toEqual(['Antes de todo', 'Nuevo', 'Contactado']);
  });

  it('no devuelve estados de otra empresa ni estados borrados', async () => {
    const { getLeadStatusUseCase, leadStatusRepository } = setupLeadStatusUseCases();
    leadStatusRepository.seed(
      buildLeadStatusConfig({ name: 'De otra empresa', order: 3, tenantId: OTHER_TENANT_ID }),
      buildLeadStatusConfig({ name: 'Borrado', order: 4, deleted: DeletedState.Inactive }),
    );

    const statuses = await getLeadStatusUseCase.execute();

    expect(statuses.map((status) => status.name)).toEqual(['Nuevo', 'Contactado']);
  });
});

describe('CreateLeadStatusConfigUseCase', () => {
  it.each(ROLES_ALLOWED_TO_CONFIGURE_STATUSES)('%s puede crear un estado en su empresa', async (role) => {
    const { createLeadStatusUseCase, leadStatusRepository } = setupLeadStatusUseCases();

    const createdStatus = await createLeadStatusUseCase.execute(
      { name: 'En negociación', order: 3, isDefault: false, color: '#0EA5E9' },
      role,
    );

    expect(createdStatus).toMatchObject({ name: 'En negociación', order: 3, isDefault: false, color: '#0EA5E9' });
    expect(leadStatusRepository.findStoredById(createdStatus.id)?.tenantId).toBe(DEFAULT_TEST_TENANT_ID);
  });

  it('SALES_REP no puede crear estados', async () => {
    const { createLeadStatusUseCase, leadStatusRepository } = setupLeadStatusUseCases();
    const statusCountBefore = leadStatusRepository.listStored().length;

    await expect(
      createLeadStatusUseCase.execute({ name: 'En negociación', order: 3, isDefault: false }, Role.SALES_REP),
    ).rejects.toThrow('Insufficient permissions');
    expect(leadStatusRepository.listStored()).toHaveLength(statusCountBefore);
  });

  it('crear un estado no predeterminado conserva el predeterminado actual', async () => {
    const { createLeadStatusUseCase, listDefaultStatusNames } = setupLeadStatusUseCases();

    await createLeadStatusUseCase.execute({ name: 'En negociación', order: 3, isDefault: false }, Role.OWNER);

    await expect(listDefaultStatusNames()).resolves.toEqual(['Nuevo']);
  });

  it('crear un estado predeterminado desmarca el anterior: solo hay uno por empresa', async () => {
    const { createLeadStatusUseCase, listDefaultStatusNames } = setupLeadStatusUseCases();

    await createLeadStatusUseCase.execute({ name: 'Entrante', order: 3, isDefault: true }, Role.OWNER);

    await expect(listDefaultStatusNames()).resolves.toEqual(['Entrante']);
  });

  it('crear un estado predeterminado no toca los estados de otra empresa', async () => {
    const { createLeadStatusUseCase, leadStatusRepository } = setupLeadStatusUseCases();
    const foreignDefaultStatus = buildLeadStatusConfig({ tenantId: OTHER_TENANT_ID, isDefault: true });
    leadStatusRepository.seed(foreignDefaultStatus);

    await createLeadStatusUseCase.execute({ name: 'Entrante', order: 3, isDefault: true }, Role.OWNER);

    expect(leadStatusRepository.findStoredById(foreignDefaultStatus.id)?.isDefault).toBe(true);
  });
});

describe('UpdateLeadStatusConfigUseCase', () => {
  it.each(ROLES_ALLOWED_TO_CONFIGURE_STATUSES)('%s puede actualizar un estado de su empresa', async (role) => {
    const { updateLeadStatusUseCase, contactedStatus } = setupLeadStatusUseCases();

    const updatedStatus = await updateLeadStatusUseCase.execute(
      contactedStatus.id,
      { name: 'Primer contacto' },
      role,
      randomUUID(),
    );

    expect(updatedStatus.name).toBe('Primer contacto');
  });

  it('actualiza solo los campos enviados y conserva el resto', async () => {
    const { updateLeadStatusUseCase, leadStatusRepository, contactedStatus } = setupLeadStatusUseCases();

    const updatedStatus = await updateLeadStatusUseCase.execute(
      contactedStatus.id,
      { name: 'Primer contacto', order: 5 },
      Role.OWNER,
      randomUUID(),
    );

    expect(updatedStatus).toMatchObject({ name: 'Primer contacto', order: 5, color: '#F59E0B', isDefault: false });
    expect(leadStatusRepository.findStoredById(contactedStatus.id)).toMatchObject({
      name: 'Primer contacto',
      order: 5,
      color: '#F59E0B',
    });
  });

  it('SALES_REP no puede actualizar estados', async () => {
    const { updateLeadStatusUseCase, leadStatusRepository, contactedStatus } = setupLeadStatusUseCases();

    await expect(
      updateLeadStatusUseCase.execute(contactedStatus.id, { name: 'Primer contacto' }, Role.SALES_REP, randomUUID()),
    ).rejects.toThrow('Insufficient permissions');
    expect(leadStatusRepository.findStoredById(contactedStatus.id)?.name).toBe('Contactado');
  });

  it('falla si falta el id del estado', async () => {
    const { updateLeadStatusUseCase } = setupLeadStatusUseCases();

    await expect(
      updateLeadStatusUseCase.execute('', { name: 'Primer contacto' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('All information is required');
  });

  it('falla si el estado no existe', async () => {
    const { updateLeadStatusUseCase } = setupLeadStatusUseCases();

    await expect(
      updateLeadStatusUseCase.execute(NON_EXISTENT_ID, { name: 'Primer contacto' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('Status Lead not found');
  });

  it('trata como inexistente un estado de otra empresa y no lo modifica', async () => {
    const { updateLeadStatusUseCase, leadStatusRepository } = setupLeadStatusUseCases();
    const foreignStatus = buildLeadStatusConfig({ tenantId: OTHER_TENANT_ID, name: 'Estado ajeno' });
    leadStatusRepository.seed(foreignStatus);

    await expect(
      updateLeadStatusUseCase.execute(foreignStatus.id, { name: 'Renombrado' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('Status Lead not found');
    expect(leadStatusRepository.findStoredById(foreignStatus.id)?.name).toBe('Estado ajeno');
  });

  it('marcar otro estado como predeterminado desmarca el anterior', async () => {
    const { updateLeadStatusUseCase, contactedStatus, listDefaultStatusNames } = setupLeadStatusUseCases();

    await updateLeadStatusUseCase.execute(contactedStatus.id, { isDefault: true }, Role.OWNER, randomUUID());

    await expect(listDefaultStatusNames()).resolves.toEqual(['Contactado']);
  });

  it('no permite desmarcar el predeterminado actual sin que otro lo reemplace', async () => {
    const { updateLeadStatusUseCase, defaultStatus, listDefaultStatusNames } = setupLeadStatusUseCases();

    await expect(
      updateLeadStatusUseCase.execute(defaultStatus.id, { isDefault: false }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('You cannot disable a default state without first having another one');
    await expect(listDefaultStatusNames()).resolves.toEqual(['Nuevo']);
  });

  it('volver a marcar como predeterminado al que ya lo es lo deja igual', async () => {
    const { updateLeadStatusUseCase, defaultStatus, listDefaultStatusNames } = setupLeadStatusUseCases();

    await updateLeadStatusUseCase.execute(
      defaultStatus.id,
      { isDefault: true, name: 'Nuevo lead' },
      Role.OWNER,
      randomUUID(),
    );

    await expect(listDefaultStatusNames()).resolves.toEqual(['Nuevo lead']);
  });
});
