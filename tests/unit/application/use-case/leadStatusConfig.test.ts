import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LeadStatusConfigMapper } from '@/application/mappers/LeadStatusConfigMapper.js';
import { CreateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/createLeadStatusConfigUseCase.js';
import { GetLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/getLeadStatusConfigUseCase.js';
import { UpdateLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/updateLeadStatusConfigUseCase.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Role } from '@/domain/enums/Role.js';
import { LeadStatusType } from '@/domain/enums/LeadStatusType.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { DeleteLeadStatusConfigUseCase } from '@/application/use-case/LeadStatusConfig/deleteLeadStatusConfigUseCase.js';
import { ReorderLeadStatusConfigsUseCase } from '@/application/use-case/LeadStatusConfig/reorderLeadStatusConfigsUseCase.js';
import {
  DEFAULT_TEST_TENANT_ID,
  NON_EXISTENT_ID,
  buildLeadStatusConfig,
} from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryLeadStatusConfigRepository } from '@tests/support/doubles/InMemoryLeadStatusConfigRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

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
      new RecordingTransactionManager(),
    ),
    updateLeadStatusUseCase: new UpdateLeadStatusConfigUseCase(
      leadStatusRepository,
      leadStatusMapper,
      tenantContext,
      new RecordingAuditLogger(),
      new RecordingTransactionManager(),
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

const SECOND_ORDER = 2;
const CONSECUTIVE_ORDERS_FOR_TWO = [1, SECOND_ORDER];
const ownerActor = { role: Role.OWNER, userId: '22222222-2222-4222-8222-222222222222' };
const salesRepActor = { role: Role.SALES_REP, userId: '33333333-3333-4333-8333-333333333333' };

function setupLifecycleUseCases() {
  const setup = setupLeadStatusUseCases();
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  return {
    ...setup,
    deleteLeadStatusUseCase: new DeleteLeadStatusConfigUseCase(
      setup.leadStatusRepository,
      new RecordingTransactionManager(),
      new RecordingAuditLogger(),
    ),
    reorderLeadStatusesUseCase: new ReorderLeadStatusConfigsUseCase(
      setup.leadStatusRepository,
      new LeadStatusConfigMapper(),
      tenantContext,
      new RecordingTransactionManager(),
      new RecordingAuditLogger(),
    ),
  };
}

describe('tipo de estado (D-51, F1-T14)', () => {
  it('un estado nuevo es OPEN si no se indica tipo', async () => {
    const { createLeadStatusUseCase } = setupLeadStatusUseCases();

    const created = await createLeadStatusUseCase.execute(
      { name: 'Negociación', order: 3, isDefault: false },
      Role.OWNER,
    );

    expect(created.type).toBe(LeadStatusType.OPEN);
  });

  it('guarda el tipo indicado', async () => {
    const { createLeadStatusUseCase } = setupLeadStatusUseCases();

    const created = await createLeadStatusUseCase.execute(
      { name: 'Cerrado ganado', order: 3, isDefault: false, type: LeadStatusType.WON },
      Role.OWNER,
    );

    expect(created.type).toBe(LeadStatusType.WON);
  });

  it('el estado predeterminado tiene que ser OPEN: un lead no nace ganado ni perdido', async () => {
    const { createLeadStatusUseCase, updateLeadStatusUseCase, contactedStatus } = setupLeadStatusUseCases();

    await expect(
      createLeadStatusUseCase.execute(
        { name: 'Ganado', order: 3, isDefault: true, type: LeadStatusType.WON },
        Role.OWNER,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.DEFAULT_LEAD_STATUS_MUST_BE_OPEN });
    await expect(
      updateLeadStatusUseCase.execute(
        contactedStatus.id,
        { isDefault: true, type: LeadStatusType.LOST },
        Role.OWNER,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.DEFAULT_LEAD_STATUS_MUST_BE_OPEN });
  });

  it('no se puede cambiar a WON el tipo del estado predeterminado', async () => {
    const { updateLeadStatusUseCase, defaultStatus } = setupLeadStatusUseCases();

    await expect(
      updateLeadStatusUseCase.execute(defaultStatus.id, { type: LeadStatusType.WON }, Role.OWNER, randomUUID()),
    ).rejects.toMatchObject({ code: ErrorCode.DEFAULT_LEAD_STATUS_MUST_BE_OPEN });
  });
});

describe('DeleteLeadStatusConfigUseCase (F1-T14)', () => {
  it('borra de forma suave un estado sin leads que no es el predeterminado y libera su orden', async () => {
    const { deleteLeadStatusUseCase, leadStatusRepository, contactedStatus, createLeadStatusUseCase } =
      setupLifecycleUseCases();

    await deleteLeadStatusUseCase.execute(contactedStatus.id, ownerActor);

    await expect(leadStatusRepository.findById(contactedStatus.id)).resolves.toBeNull();
    expect(leadStatusRepository.findStoredById(contactedStatus.id)?.order).toBeLessThan(0);
    await expect(
      createLeadStatusUseCase.execute({ name: 'Reemplazo', order: 2, isDefault: false }, Role.OWNER),
    ).resolves.toMatchObject({ order: 2 });
  });

  it('no borra el estado predeterminado: ConflictError DEFAULT_LEAD_STATUS_CANNOT_BE_DELETED', async () => {
    const { deleteLeadStatusUseCase, defaultStatus } = setupLifecycleUseCases();

    await expect(deleteLeadStatusUseCase.execute(defaultStatus.id, ownerActor)).rejects.toMatchObject({
      code: ErrorCode.DEFAULT_LEAD_STATUS_CANNOT_BE_DELETED,
    });
  });

  it('no borra un estado que tiene leads: ConflictError LEAD_STATUS_IN_USE', async () => {
    const { deleteLeadStatusUseCase, leadStatusRepository, contactedStatus } = setupLifecycleUseCases();
    leadStatusRepository.setLeadCount(contactedStatus.id, 1);

    const deletion = deleteLeadStatusUseCase.execute(contactedStatus.id, ownerActor);

    await expect(deletion).rejects.toBeInstanceOf(ConflictError);
    await expect(deletion).rejects.toMatchObject({ code: ErrorCode.LEAD_STATUS_IN_USE });
  });

  it('un comercial no puede borrar estados', async () => {
    const { deleteLeadStatusUseCase, contactedStatus } = setupLifecycleUseCases();

    await expect(deleteLeadStatusUseCase.execute(contactedStatus.id, salesRepActor)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('un estado que no existe responde LEAD_STATUS_NOT_FOUND', async () => {
    const { deleteLeadStatusUseCase } = setupLifecycleUseCases();

    await expect(deleteLeadStatusUseCase.execute(NON_EXISTENT_ID, ownerActor)).rejects.toMatchObject({
      code: ErrorCode.LEAD_STATUS_NOT_FOUND,
    });
  });
});

describe('ReorderLeadStatusConfigsUseCase (F1-T14)', () => {
  it('asigna los órdenes 1..n en el orden recibido y devuelve la lista ordenada', async () => {
    const { reorderLeadStatusesUseCase, defaultStatus, contactedStatus } = setupLifecycleUseCases();

    const statuses = await reorderLeadStatusesUseCase.execute([contactedStatus.id, defaultStatus.id], ownerActor);

    expect(statuses.map((status) => status.id)).toEqual([contactedStatus.id, defaultStatus.id]);
    expect(statuses.map((status) => status.order)).toEqual(CONSECUTIVE_ORDERS_FOR_TWO);
  });

  it.each([
    ['falta un estado', (ids: string[]) => ids.slice(1)],
    ['se repite un estado', (ids: string[]) => [ids[0], ids[0]]],
    ['sobra un estado que no es de la empresa', (ids: string[]) => [...ids, NON_EXISTENT_ID]],
  ])('rechaza la lista si %s: LEAD_STATUS_LIST_MISMATCH', async (_case, buildList) => {
    const { reorderLeadStatusesUseCase, defaultStatus, contactedStatus } = setupLifecycleUseCases();

    await expect(
      reorderLeadStatusesUseCase.execute(buildList([defaultStatus.id, contactedStatus.id]), ownerActor),
    ).rejects.toMatchObject({ code: ErrorCode.LEAD_STATUS_LIST_MISMATCH });
  });

  it('un comercial no puede reordenar', async () => {
    const { reorderLeadStatusesUseCase, defaultStatus, contactedStatus } = setupLifecycleUseCases();

    await expect(
      reorderLeadStatusesUseCase.execute([contactedStatus.id, defaultStatus.id], salesRepActor),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
