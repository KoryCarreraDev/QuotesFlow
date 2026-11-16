import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { PrismaLeadStatusConfigRepository } from '@/infrastructure/persistence/repositories/PrismaLeadStatusConfigRepository.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { persistLead, persistLeadStatus, persistTenant } from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

const UPDATED_STATUS_ORDER = 5;
const LEADS_USING_THE_STATUS = 2;

describe('PrismaLeadStatusConfigRepository', () => {
  let tenantId: string;
  let otherTenantId: string;
  let leadStatusRepository: PrismaLeadStatusConfigRepository;

  beforeEach(async () => {
    tenantId = (await persistTenant()).id;
    otherTenantId = (await persistTenant({ name: 'Otra Empresa SAS' })).id;
    leadStatusRepository = new PrismaLeadStatusConfigRepository(prisma, new FixedTenantContext(tenantId));
  });

  it('guarda un estado y lo recupera por id', async () => {
    const status = LeadStatusConfig.create({
      name: 'En negociación',
      order: 3,
      isDefault: false,
      tenantId,
      color: '#0EA5E9',
    });

    await leadStatusRepository.create(status);

    await expect(leadStatusRepository.findById(status.id)).resolves.toMatchObject({
      id: status.id,
      tenantId,
      name: 'En negociación',
      order: 3,
      isDefault: false,
      color: '#0EA5E9',
      deleted: DeletedState.ACTIVE,
    });
  });

  it('findById devuelve null si el estado no existe, es de otra empresa o está borrado', async () => {
    const foreignStatus = await persistLeadStatus(otherTenantId);
    const deletedStatus = await persistLeadStatus(tenantId, { deleted: DeletedState.INACTIVE });

    await expect(leadStatusRepository.findById(NON_EXISTENT_ID)).resolves.toBeNull();
    await expect(leadStatusRepository.findById(foreignStatus.id)).resolves.toBeNull();
    await expect(leadStatusRepository.findById(deletedStatus.id)).resolves.toBeNull();
  });

  it('findAllByTenant devuelve los estados activos de la empresa ordenados por orden ascendente', async () => {
    await persistLeadStatus(tenantId, { name: 'Tercero', order: 3 });
    await persistLeadStatus(tenantId, { name: 'Primero', order: 1 });
    await persistLeadStatus(tenantId, { name: 'Segundo', order: 2 });
    await persistLeadStatus(tenantId, { name: 'Borrado', order: 4, deleted: DeletedState.INACTIVE });
    await persistLeadStatus(otherTenantId, { name: 'Ajeno', order: 1 });

    const statuses = await leadStatusRepository.findAllByTenant(tenantId);

    expect(statuses.map((status) => status.name)).toEqual(['Primero', 'Segundo', 'Tercero']);
  });

  it('findDefaultByTenant devuelve el estado predeterminado de la empresa', async () => {
    await persistLeadStatus(tenantId, { name: 'Contactado', order: 2 });
    const defaultStatus = await persistLeadStatus(tenantId, { name: 'Nuevo', order: 1, isDefault: true });
    await persistLeadStatus(otherTenantId, { name: 'Ajeno', order: 1, isDefault: true });

    const foundStatus = await leadStatusRepository.findDefaultByTenant(tenantId);

    expect(foundStatus?.id).toBe(defaultStatus.id);
  });

  it('findDefaultByTenant devuelve null si la empresa no tiene predeterminado', async () => {
    await persistLeadStatus(tenantId, { name: 'Contactado', order: 2 });

    await expect(leadStatusRepository.findDefaultByTenant(tenantId)).resolves.toBeNull();
  });

  it('update cambia nombre, orden, color y marca de predeterminado', async () => {
    const storedStatus = await persistLeadStatus(tenantId, { name: 'Contactado', order: 2 });
    const changes = new LeadStatusConfig(
      storedStatus.id,
      'Primer contacto',
      UPDATED_STATUS_ORDER,
      true,
      new Date(),
      storedStatus.createdAt,
      '#F59E0B',
      tenantId,
    );

    await leadStatusRepository.update(storedStatus.id, changes);

    await expect(leadStatusRepository.findById(storedStatus.id)).resolves.toMatchObject({
      name: 'Primer contacto',
      order: 5,
      isDefault: true,
      color: '#F59E0B',
    });
  });

  it('update no modifica un estado de otra empresa', async () => {
    const foreignStatus = await persistLeadStatus(otherTenantId, { name: 'Estado ajeno' });
    const changes = LeadStatusConfig.create({ name: 'Renombrado', order: 9, isDefault: false, tenantId });

    await expect(leadStatusRepository.update(foreignStatus.id, changes)).rejects.toThrow();

    const untouchedStatus = await prisma.leadStatusConfig.findUniqueOrThrow({ where: { id: foreignStatus.id } });
    expect(untouchedStatus.name).toBe('Estado ajeno');
  });

  it('la base de datos impide dos estados con el mismo orden en una empresa', async () => {
    await persistLeadStatus(tenantId, { name: 'Nuevo', order: 1 });
    const duplicatedOrderStatus = LeadStatusConfig.create({ name: 'Duplicado', order: 1, isDefault: false, tenantId });

    await expect(leadStatusRepository.create(duplicatedOrderStatus)).rejects.toThrow();
  });

  it('dos empresas distintas sí pueden usar el mismo orden', async () => {
    await persistLeadStatus(otherTenantId, { name: 'Nuevo', order: 1 });
    const sameOrderStatus = LeadStatusConfig.create({ name: 'Nuevo', order: 1, isDefault: true, tenantId });

    await expect(leadStatusRepository.create(sameOrderStatus)).resolves.toBeUndefined();
  });

  it('countLeadByStatus cuenta los leads que usan el estado', async () => {
    const usedStatus = await persistLeadStatus(tenantId, { name: 'Nuevo', order: 1 });
    const unusedStatus = await persistLeadStatus(tenantId, { name: 'Contactado', order: 2 });
    await persistLead(tenantId, { statusId: usedStatus.id });
    await persistLead(tenantId, { statusId: usedStatus.id });

    await expect(leadStatusRepository.countLeadByStatus(usedStatus.id)).resolves.toBe(LEADS_USING_THE_STATUS);
    await expect(leadStatusRepository.countLeadByStatus(unusedStatus.id)).resolves.toBe(0);
  });

  it('countLeadByStatus devuelve cero para un estado de otra empresa', async () => {
    const foreignStatus = await persistLeadStatus(otherTenantId, { name: 'Ajeno', order: 1 });
    await persistLead(otherTenantId, { statusId: foreignStatus.id });

    await expect(leadStatusRepository.countLeadByStatus(foreignStatus.id)).resolves.toBe(0);
  });
});
