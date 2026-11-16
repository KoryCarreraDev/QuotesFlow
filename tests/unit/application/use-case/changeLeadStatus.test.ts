import { describe, expect, it, vi } from 'vitest';
import { LeadMapper } from '@/application/mappers/LeadMapper.js';
import { ChangeLeadStatusUseCase } from '@/application/use-case/leads/changeLeadStatusUseCase.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
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
import { InMemoryLeadStatusHistoryRepository } from '@tests/support/doubles/InMemoryLeadStatusHistoryRepository.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';

// F1-T13: el estado de un lead cambia con su propio caso de uso, que deja constancia en el historial.
// Antes `PATCH /api/v1/leads/:id` aceptaba `statusId` y lo ignoraba en silencio.

const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const leadRepository = new InMemoryLeadRepository(tenantContext);
  const statusRepository = new InMemoryLeadStatusConfigRepository(tenantContext);
  const historyRepository = new InMemoryLeadStatusHistoryRepository(tenantContext);
  const transactionManager = new RecordingTransactionManager();

  const salesRep = buildUser({ role: Role.SALES_REP });
  const otherSalesRep = buildUser({ role: Role.SALES_REP });
  const owner = buildUser({ role: Role.OWNER });
  const newStatus = buildLeadStatusConfig({ name: 'Nuevo', order: 1, isDefault: true });
  const contactedStatus = buildLeadStatusConfig({ name: 'Contactado', order: 2 });
  const foreignStatus = buildLeadStatusConfig({ name: 'Ajeno', order: 1, tenantId: OTHER_TENANT_ID });
  statusRepository.seed(newStatus, contactedStatus, foreignStatus);

  const lead = buildLead({ statusId: newStatus.id, assignedToId: salesRep.id });
  leadRepository.seed(lead);

  const changeLeadStatusUseCase = new ChangeLeadStatusUseCase(
    leadRepository,
    statusRepository,
    historyRepository,
    transactionManager,
    new LeadMapper(),
    tenantContext,
    new RecordingAuditLogger(),
  );

  return {
    changeLeadStatusUseCase,
    leadRepository,
    historyRepository,
    transactionManager,
    lead,
    salesRep,
    otherSalesRep,
    owner,
    newStatus,
    contactedStatus,
    foreignStatus,
  };
}

describe('ChangeLeadStatusUseCase', () => {
  it('cambia el estado del lead y lo devuelve con el estado nuevo', async () => {
    const { changeLeadStatusUseCase, leadRepository, lead, owner, contactedStatus } = setup();

    const updatedLead = await changeLeadStatusUseCase.execute(
      lead.id,
      { statusId: contactedStatus.id },
      { role: Role.OWNER, userId: owner.id },
    );

    expect(updatedLead.statusId).toBe(contactedStatus.id);
    expect(leadRepository.findStoredById(lead.id)?.statusId).toBe(contactedStatus.id);
  });

  it('registra en el historial el estado anterior, el nuevo, quién lo cambió, su nota y su empresa', async () => {
    const { changeLeadStatusUseCase, historyRepository, lead, owner, newStatus, contactedStatus } = setup();

    await changeLeadStatusUseCase.execute(
      lead.id,
      { statusId: contactedStatus.id, note: 'Respondió el correo' },
      { role: Role.OWNER, userId: owner.id },
    );

    expect(historyRepository.listStored()).toEqual([
      expect.objectContaining({
        tenantId: DEFAULT_TEST_TENANT_ID,
        leadId: lead.id,
        oldStatusId: newStatus.id,
        newStatusId: contactedStatus.id,
        changedById: owner.id,
        note: 'Respondió el correo',
      }),
    ]);
  });

  it('el lead y el historial se escriben en una sola transacción', async () => {
    const {
      changeLeadStatusUseCase,
      leadRepository,
      historyRepository,
      transactionManager,
      lead,
      owner,
      contactedStatus,
    } = setup();
    const writesOutsideTransaction: string[] = [];
    const originalStatusUpdate = leadRepository.updateStatus.bind(leadRepository);
    vi.spyOn(leadRepository, 'updateStatus').mockImplementation(async (leadId, statusId) => {
      if (!transactionManager.isInsideTransaction) writesOutsideTransaction.push('lead');
      await originalStatusUpdate(leadId, statusId);
    });
    const originalHistoryCreate = historyRepository.create.bind(historyRepository);
    vi.spyOn(historyRepository, 'create').mockImplementation(async (change) => {
      if (!transactionManager.isInsideTransaction) writesOutsideTransaction.push('history');
      await originalHistoryCreate(change);
    });
    await changeLeadStatusUseCase.execute(
      lead.id,
      { statusId: contactedStatus.id },
      { role: Role.OWNER, userId: owner.id },
    );

    expect(writesOutsideTransaction).toEqual([]);
    expect(transactionManager.completedTransactionCount).toBe(1);
  });

  it('pedir el estado que ya tiene no escribe nada en el historial', async () => {
    const { changeLeadStatusUseCase, historyRepository, lead, owner, newStatus } = setup();

    await changeLeadStatusUseCase.execute(lead.id, { statusId: newStatus.id }, { role: Role.OWNER, userId: owner.id });

    expect(historyRepository.listStored()).toEqual([]);
  });

  it('un comercial puede cambiar el estado de su propio lead', async () => {
    const { changeLeadStatusUseCase, lead, salesRep, contactedStatus } = setup();

    const updatedLead = await changeLeadStatusUseCase.execute(
      lead.id,
      { statusId: contactedStatus.id },
      { role: Role.SALES_REP, userId: salesRep.id },
    );

    expect(updatedLead.statusId).toBe(contactedStatus.id);
  });

  it('un comercial no puede cambiar el estado del lead de otro: ForbiddenError y nada cambia', async () => {
    const {
      changeLeadStatusUseCase,
      leadRepository,
      historyRepository,
      lead,
      otherSalesRep,
      newStatus,
      contactedStatus,
    } = setup();

    await expect(
      changeLeadStatusUseCase.execute(
        lead.id,
        { statusId: contactedStatus.id },
        { role: Role.SALES_REP, userId: otherSalesRep.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(leadRepository.findStoredById(lead.id)?.statusId).toBe(newStatus.id);
    expect(historyRepository.listStored()).toEqual([]);
  });

  it('un lead que no existe o es de otra empresa responde NotFoundError LEAD_NOT_FOUND', async () => {
    const { changeLeadStatusUseCase, owner, contactedStatus } = setup();

    await expect(
      changeLeadStatusUseCase.execute(
        NON_EXISTENT_ID,
        { statusId: contactedStatus.id },
        { role: Role.OWNER, userId: owner.id },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.LEAD_NOT_FOUND });
    await expect(
      changeLeadStatusUseCase.execute(
        NON_EXISTENT_ID,
        { statusId: contactedStatus.id },
        { role: Role.OWNER, userId: owner.id },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('un estado de otra empresa responde ValidationError INVALID_LEAD_STATUS y nada cambia', async () => {
    const { changeLeadStatusUseCase, leadRepository, lead, owner, newStatus, foreignStatus } = setup();

    await expect(
      changeLeadStatusUseCase.execute(lead.id, { statusId: foreignStatus.id }, { role: Role.OWNER, userId: owner.id }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_LEAD_STATUS });

    expect(leadRepository.findStoredById(lead.id)?.statusId).toBe(newStatus.id);
  });
});
