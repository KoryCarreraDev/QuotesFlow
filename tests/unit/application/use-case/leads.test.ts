import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { UpdateLeadDTO } from '@/application/dtos/UpdateLeadDTO.js';
import { LeadMapper } from '@/application/mappers/LeadMapper.js';
import { CreateLeadUseCase } from '@/application/use-case/leads/createLeadUseCase.js';
import { DeleteLeadUseCase } from '@/application/use-case/leads/deleteLeadUseCase.js';
import { GetLeadsUseCase } from '@/application/use-case/leads/getLeadsUseCase.js';
import { UpdateLeadUseCase } from '@/application/use-case/leads/updateLeadUseCase.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Role } from '@/domain/enums/Role.js';
import {
  DEFAULT_TEST_TENANT_ID,
  NON_EXISTENT_ID,
  buildLead,
  buildLeadStatusConfig,
  buildUser,
} from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryLeadRepository } from '@tests/support/doubles/InMemoryLeadRepository.js';
import { InMemoryLeadStatusConfigRepository } from '@tests/support/doubles/InMemoryLeadStatusConfigRepository.js';
import { InMemoryUserRepository } from '@tests/support/doubles/InMemoryUserRepository.js';

const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';

// Roles que ven y gestionan todos los leads de la empresa. SALES_REP solo los suyos.
const ROLES_WITH_FULL_LEAD_ACCESS = [Role.OWNER, Role.PARTNER, Role.SALES_LEADER];

function setupLeadUseCases() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const leadRepository = new InMemoryLeadRepository(tenantContext);
  const leadStatusRepository = new InMemoryLeadStatusConfigRepository(tenantContext);
  const userRepository = new InMemoryUserRepository(tenantContext);
  const leadMapper = new LeadMapper();

  const salesRep = buildUser({ role: Role.SALES_REP });
  const otherSalesRep = buildUser({ role: Role.SALES_REP });
  userRepository.seed(salesRep, otherSalesRep);

  const defaultStatus = buildLeadStatusConfig({ name: 'Nuevo', order: 1, isDefault: true });
  const contactedStatus = buildLeadStatusConfig({ name: 'Contactado', order: 2 });
  leadStatusRepository.seed(defaultStatus, contactedStatus);

  return {
    leadRepository,
    leadStatusRepository,
    userRepository,
    salesRep,
    otherSalesRep,
    defaultStatus,
    contactedStatus,
    getLeadsUseCase: new GetLeadsUseCase(leadRepository, leadMapper),
    createLeadUseCase: new CreateLeadUseCase(
      leadRepository,
      leadMapper,
      tenantContext,
      leadStatusRepository,
      userRepository,
    ),
    updateLeadUseCase: new UpdateLeadUseCase(leadRepository, leadMapper, tenantContext),
    deleteLeadUseCase: new DeleteLeadUseCase(leadRepository, tenantContext),
  };
}

describe('GetLeadsUseCase', () => {
  it('SALES_REP solo recibe los leads que tiene asignados', async () => {
    const { getLeadsUseCase, leadRepository, salesRep, otherSalesRep } = setupLeadUseCases();
    const ownLead = buildLead({ assignedToId: salesRep.id });
    leadRepository.seed(ownLead, buildLead({ assignedToId: otherSalesRep.id }), buildLead());

    const leads = await getLeadsUseCase.execute(Role.SALES_REP, salesRep.id);

    expect(leads.map((lead) => lead.id)).toEqual([ownLead.id]);
  });

  it.each(ROLES_WITH_FULL_LEAD_ACCESS)('%s recibe todos los leads de la empresa', async (role) => {
    const { getLeadsUseCase, leadRepository, salesRep, otherSalesRep } = setupLeadUseCases();
    const manager = buildUser({ role });
    leadRepository.seed(
      buildLead({ assignedToId: salesRep.id }),
      buildLead({ assignedToId: otherSalesRep.id }),
      buildLead(),
    );

    const leads = await getLeadsUseCase.execute(role, manager.id);

    expect(leads).toHaveLength(3);
  });

  it('nunca devuelve leads borrados', async () => {
    const { getLeadsUseCase, leadRepository } = setupLeadUseCases();
    const activeLead = buildLead();
    leadRepository.seed(activeLead, buildLead({ deleted: DeletedState.Inactive }));

    const leads = await getLeadsUseCase.execute(Role.OWNER, randomUUID());

    expect(leads.map((lead) => lead.id)).toEqual([activeLead.id]);
  });
});

describe('CreateLeadUseCase', () => {
  it('sin estado indicado usa el estado predeterminado de la empresa', async () => {
    const { createLeadUseCase, defaultStatus } = setupLeadUseCases();

    const createdLead = await createLeadUseCase.execute({ contactName: 'Ana Gómez' }, randomUUID(), Role.OWNER);

    expect(createdLead.statusId).toBe(defaultStatus.id);
  });

  it('falla si la empresa no tiene estado predeterminado y no se indica uno', async () => {
    const { createLeadUseCase, leadStatusRepository, leadRepository, defaultStatus } = setupLeadUseCases();
    leadStatusRepository.seed(buildLeadStatusConfig({ id: defaultStatus.id, isDefault: false }));

    await expect(
      createLeadUseCase.execute({ contactName: 'Ana Gómez' }, randomUUID(), Role.OWNER),
    ).rejects.toThrow('Default lead status not configured for this tenant');
    expect(leadRepository.listStored()).toHaveLength(0);
  });

  it('acepta un estado indicado que pertenece a la empresa', async () => {
    const { createLeadUseCase, contactedStatus } = setupLeadUseCases();

    const createdLead = await createLeadUseCase.execute(
      { contactName: 'Ana Gómez', statusId: contactedStatus.id },
      randomUUID(),
      Role.OWNER,
    );

    expect(createdLead.statusId).toBe(contactedStatus.id);
  });

  it('rechaza un estado de otra empresa', async () => {
    const { createLeadUseCase, leadStatusRepository, leadRepository } = setupLeadUseCases();
    const foreignStatus = buildLeadStatusConfig({ tenantId: OTHER_TENANT_ID });
    leadStatusRepository.seed(foreignStatus);

    await expect(
      createLeadUseCase.execute({ contactName: 'Ana Gómez', statusId: foreignStatus.id }, randomUUID(), Role.OWNER),
    ).rejects.toThrow('Invalid statusId');
    expect(leadRepository.listStored()).toHaveLength(0);
  });

  it('rechaza un estado que no existe', async () => {
    const { createLeadUseCase } = setupLeadUseCases();

    await expect(
      createLeadUseCase.execute({ contactName: 'Ana Gómez', statusId: NON_EXISTENT_ID }, randomUUID(), Role.OWNER),
    ).rejects.toThrow('Invalid statusId');
  });

  it('guarda el lead en la empresa del usuario con todos sus datos', async () => {
    const { createLeadUseCase, leadRepository } = setupLeadUseCases();
    const expectedCloseDate = new Date('2026-06-30T00:00:00.000Z');

    const createdLead = await createLeadUseCase.execute(
      {
        contactName: 'Ana Gómez',
        companyName: 'Vidrios del Norte',
        email: 'ana@example.com',
        phone: '3001234567',
        source: 'Referido',
        estimatedValue: 2_500_000,
        expectedCloseDate,
        notes: 'Llamar el lunes',
      },
      randomUUID(),
      Role.OWNER,
    );

    expect(leadRepository.findStoredById(createdLead.id)).toMatchObject({
      tenantId: DEFAULT_TEST_TENANT_ID,
      contactName: 'Ana Gómez',
      companyName: 'Vidrios del Norte',
      email: 'ana@example.com',
      phone: '3001234567',
      source: 'Referido',
      estimatedValue: 2_500_000,
      expectedCloseDate,
      notes: 'Llamar el lunes',
    });
  });

  it('SALES_REP queda siempre como responsable del lead que crea, aunque indique a otro usuario', async () => {
    const { createLeadUseCase, salesRep, otherSalesRep } = setupLeadUseCases();

    const createdLead = await createLeadUseCase.execute(
      { contactName: 'Ana Gómez', assignedToId: otherSalesRep.id },
      salesRep.id,
      Role.SALES_REP,
    );

    expect(createdLead.assignedToId).toBe(salesRep.id);
  });

  it.each(ROLES_WITH_FULL_LEAD_ACCESS)('%s puede crear un lead sin responsable', async (role) => {
    const { createLeadUseCase } = setupLeadUseCases();

    const createdLead = await createLeadUseCase.execute({ contactName: 'Ana Gómez' }, randomUUID(), role);

    expect(createdLead.assignedToId).toBeUndefined();
  });

  it.each(ROLES_WITH_FULL_LEAD_ACCESS)('%s puede asignar el lead a un usuario de la empresa', async (role) => {
    const { createLeadUseCase, salesRep } = setupLeadUseCases();

    const createdLead = await createLeadUseCase.execute(
      { contactName: 'Ana Gómez', assignedToId: salesRep.id },
      randomUUID(),
      role,
    );

    expect(createdLead.assignedToId).toBe(salesRep.id);
  });

  it('rechaza asignar el lead a un usuario de otra empresa', async () => {
    const { createLeadUseCase, userRepository, leadRepository } = setupLeadUseCases();
    const foreignUser = buildUser({ tenantId: OTHER_TENANT_ID });
    userRepository.seed(foreignUser);

    await expect(
      createLeadUseCase.execute({ contactName: 'Ana Gómez', assignedToId: foreignUser.id }, randomUUID(), Role.OWNER),
    ).rejects.toThrow('User not found');
    expect(leadRepository.listStored()).toHaveLength(0);
  });
});

describe('UpdateLeadUseCase', () => {
  it('actualiza solo los campos enviados y conserva el resto', async () => {
    const { updateLeadUseCase, leadRepository } = setupLeadUseCases();
    const lead = buildLead({ contactName: 'Ana Gómez', phone: '3001234567', notes: 'Nota original' });
    leadRepository.seed(lead);

    const updatedLead = await updateLeadUseCase.execute(
      lead.id,
      { contactName: 'Ana María Gómez', estimatedValue: 3_000_000 },
      Role.OWNER,
      randomUUID(),
    );

    expect(updatedLead).toMatchObject({
      id: lead.id,
      contactName: 'Ana María Gómez',
      estimatedValue: 3_000_000,
      phone: '3001234567',
      notes: 'Nota original',
    });
    expect(leadRepository.findStoredById(lead.id)).toMatchObject({
      contactName: 'Ana María Gómez',
      estimatedValue: 3_000_000,
      phone: '3001234567',
    });
  });

  it('permite cambiar todos los datos comerciales a la vez', async () => {
    const { updateLeadUseCase, leadRepository, salesRep } = setupLeadUseCases();
    const lead = buildLead();
    leadRepository.seed(lead);
    const allFieldsUpdate: UpdateLeadDTO = {
      companyName: 'Vidrios y Aluminios del Norte',
      contactName: 'Ana María Gómez',
      email: 'ana.maria@example.com',
      phone: '3007654321',
      source: 'Feria',
      assignedToId: salesRep.id,
      estimatedValue: 3_000_000,
      expectedCloseDate: new Date('2026-09-15T00:00:00.000Z'),
      notes: 'Reasignado',
    };

    const updatedLead = await updateLeadUseCase.execute(lead.id, allFieldsUpdate, Role.OWNER, randomUUID());

    expect(updatedLead).toMatchObject(allFieldsUpdate);
    expect(leadRepository.findStoredById(lead.id)).toMatchObject(allFieldsUpdate);
  });

  it('no cambia el estado del lead: el cambio de estado no pasa por la actualización', async () => {
    const { updateLeadUseCase, leadRepository, defaultStatus, contactedStatus } = setupLeadUseCases();
    const lead = buildLead({ statusId: defaultStatus.id });
    leadRepository.seed(lead);
    const updateWithStatus: UpdateLeadDTO & { statusId: string } = {
      notes: 'Intento de cambio de estado',
      statusId: contactedStatus.id,
    };

    const updatedLead = await updateLeadUseCase.execute(lead.id, updateWithStatus, Role.OWNER, randomUUID());

    expect(updatedLead.statusId).toBe(defaultStatus.id);
    expect(leadRepository.findStoredById(lead.id)?.statusId).toBe(defaultStatus.id);
  });

  it('falla si falta el id del lead', async () => {
    const { updateLeadUseCase } = setupLeadUseCases();

    await expect(updateLeadUseCase.execute('', { notes: 'Nota' }, Role.OWNER, randomUUID())).rejects.toThrow(
      'All information is required',
    );
  });

  it('falla si el lead no existe', async () => {
    const { updateLeadUseCase } = setupLeadUseCases();

    await expect(
      updateLeadUseCase.execute(NON_EXISTENT_ID, { notes: 'Nota' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('Lead not found');
  });

  it('trata como inexistente un lead de otra empresa y no lo modifica', async () => {
    const { updateLeadUseCase, leadRepository } = setupLeadUseCases();
    const foreignLead = buildLead({ tenantId: OTHER_TENANT_ID, notes: 'Nota original' });
    leadRepository.seed(foreignLead);

    await expect(
      updateLeadUseCase.execute(foreignLead.id, { notes: 'Nota ajena' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('Lead not found');
    expect(leadRepository.findStoredById(foreignLead.id)?.notes).toBe('Nota original');
  });

  it('trata como inexistente un lead borrado', async () => {
    const { updateLeadUseCase, leadRepository } = setupLeadUseCases();
    const deletedLead = buildLead({ deleted: DeletedState.Inactive });
    leadRepository.seed(deletedLead);

    await expect(
      updateLeadUseCase.execute(deletedLead.id, { notes: 'Nota' }, Role.OWNER, randomUUID()),
    ).rejects.toThrow('Lead not found');
  });

  it('SALES_REP puede actualizar un lead que tiene asignado', async () => {
    const { updateLeadUseCase, leadRepository, salesRep } = setupLeadUseCases();
    const ownLead = buildLead({ assignedToId: salesRep.id });
    leadRepository.seed(ownLead);

    const updatedLead = await updateLeadUseCase.execute(
      ownLead.id,
      { notes: 'Cliente interesado' },
      Role.SALES_REP,
      salesRep.id,
    );

    expect(updatedLead.notes).toBe('Cliente interesado');
  });

  it('SALES_REP no puede actualizar un lead de otro comercial', async () => {
    const { updateLeadUseCase, leadRepository, salesRep, otherSalesRep } = setupLeadUseCases();
    const lead = buildLead({ assignedToId: otherSalesRep.id, notes: 'Nota original' });
    leadRepository.seed(lead);

    await expect(
      updateLeadUseCase.execute(lead.id, { notes: 'Nota ajena' }, Role.SALES_REP, salesRep.id),
    ).rejects.toThrow('You can only update your own leads');
    expect(leadRepository.findStoredById(lead.id)?.notes).toBe('Nota original');
  });

  it('SALES_REP no puede reasignar su lead a otro usuario', async () => {
    const { updateLeadUseCase, leadRepository, salesRep, otherSalesRep } = setupLeadUseCases();
    const ownLead = buildLead({ assignedToId: salesRep.id });
    leadRepository.seed(ownLead);

    const updatedLead = await updateLeadUseCase.execute(
      ownLead.id,
      { assignedToId: otherSalesRep.id },
      Role.SALES_REP,
      salesRep.id,
    );

    expect(updatedLead.assignedToId).toBe(salesRep.id);
    expect(leadRepository.findStoredById(ownLead.id)?.assignedToId).toBe(salesRep.id);
  });

  it.each(ROLES_WITH_FULL_LEAD_ACCESS)('%s puede actualizar y reasignar cualquier lead de la empresa', async (role) => {
    const { updateLeadUseCase, leadRepository, salesRep, otherSalesRep } = setupLeadUseCases();
    const lead = buildLead({ assignedToId: salesRep.id });
    leadRepository.seed(lead);

    const updatedLead = await updateLeadUseCase.execute(
      lead.id,
      { assignedToId: otherSalesRep.id, notes: 'Reasignado' },
      role,
      randomUUID(),
    );

    expect(updatedLead).toMatchObject({ assignedToId: otherSalesRep.id, notes: 'Reasignado' });
  });
});

describe('DeleteLeadUseCase', () => {
  it('borra de forma suave: el lead sigue guardado pero marcado como borrado', async () => {
    const { deleteLeadUseCase, leadRepository } = setupLeadUseCases();
    const lead = buildLead();
    leadRepository.seed(lead);

    await deleteLeadUseCase.execute(lead.id, randomUUID(), Role.OWNER);

    expect(leadRepository.findStoredById(lead.id)?.deleted).toBe(DeletedState.Inactive);
    await expect(leadRepository.findById(lead.id)).resolves.toBeNull();
  });

  it('falla si el lead no existe', async () => {
    const { deleteLeadUseCase } = setupLeadUseCases();

    await expect(deleteLeadUseCase.execute(NON_EXISTENT_ID, randomUUID(), Role.OWNER)).rejects.toThrow(
      'Lead not found',
    );
  });

  it('trata como inexistente un lead de otra empresa y no lo borra', async () => {
    const { deleteLeadUseCase, leadRepository } = setupLeadUseCases();
    const foreignLead = buildLead({ tenantId: OTHER_TENANT_ID });
    leadRepository.seed(foreignLead);

    await expect(deleteLeadUseCase.execute(foreignLead.id, randomUUID(), Role.OWNER)).rejects.toThrow(
      'Lead not found',
    );
    expect(leadRepository.findStoredById(foreignLead.id)?.deleted).toBe(DeletedState.Active);
  });

  it('SALES_REP puede borrar un lead que tiene asignado', async () => {
    const { deleteLeadUseCase, leadRepository, salesRep } = setupLeadUseCases();
    const ownLead = buildLead({ assignedToId: salesRep.id });
    leadRepository.seed(ownLead);

    await deleteLeadUseCase.execute(ownLead.id, salesRep.id, Role.SALES_REP);

    expect(leadRepository.findStoredById(ownLead.id)?.deleted).toBe(DeletedState.Inactive);
  });

  it('SALES_REP no puede borrar un lead de otro comercial', async () => {
    const { deleteLeadUseCase, leadRepository, salesRep, otherSalesRep } = setupLeadUseCases();
    const lead = buildLead({ assignedToId: otherSalesRep.id });
    leadRepository.seed(lead);

    await expect(deleteLeadUseCase.execute(lead.id, salesRep.id, Role.SALES_REP)).rejects.toThrow(
      'You do not have the necessary permissions.',
    );
    expect(leadRepository.findStoredById(lead.id)?.deleted).toBe(DeletedState.Active);
  });

  it.each(ROLES_WITH_FULL_LEAD_ACCESS)('%s puede borrar cualquier lead de la empresa', async (role) => {
    const { deleteLeadUseCase, leadRepository, salesRep } = setupLeadUseCases();
    const lead = buildLead({ assignedToId: salesRep.id });
    leadRepository.seed(lead);

    await deleteLeadUseCase.execute(lead.id, randomUUID(), role);

    expect(leadRepository.findStoredById(lead.id)?.deleted).toBe(DeletedState.Inactive);
  });
});
