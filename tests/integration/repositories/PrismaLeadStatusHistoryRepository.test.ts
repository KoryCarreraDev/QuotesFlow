import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { LeadStatusChange } from '@/domain/entities/LeadStatusChange.js';
import { PrismaLeadStatusHistoryRepository } from '@/infrastructure/persistence/repositories/PrismaLeadStatusHistoryRepository.js';
import {
  type TenantWithTeam,
  persistLead,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

describe('PrismaLeadStatusHistoryRepository', () => {
  let company: TenantWithTeam;
  let otherCompany: TenantWithTeam;
  let historyRepository: PrismaLeadStatusHistoryRepository;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    historyRepository = new PrismaLeadStatusHistoryRepository(prisma, new FixedTenantContext(company.tenant.id));
  });

  function changeFor(owner: TenantWithTeam, leadId: string, note?: string): LeadStatusChange {
    return LeadStatusChange.create({
      tenantId: owner.tenant.id,
      leadId,
      oldStatusId: owner.leadStatuses[0].id,
      newStatusId: owner.leadStatuses[1].id,
      changedById: owner.owner.id,
      note,
    });
  }

  it('guarda un cambio con su tenant y lo devuelve en el historial del lead', async () => {
    const lead = await persistLead(company.tenant.id);
    const change = changeFor(company, lead.id, 'Llamada realizada');

    await historyRepository.create(change);

    const stored = await prisma.leadStatusHistory.findUniqueOrThrow({ where: { id: change.id } });
    expect(stored.tenantId).toBe(company.tenant.id);
    await expect(historyRepository.findByLead(lead.id)).resolves.toEqual([
      expect.objectContaining({
        id: change.id,
        oldStatusId: change.oldStatusId,
        newStatusId: change.newStatusId,
        changedById: company.owner.id,
        note: 'Llamada realizada',
      }),
    ]);
  });

  it('devuelve el historial en orden cronológico', async () => {
    const lead = await persistLead(company.tenant.id);
    const earlierChange = changeFor(company, lead.id, 'primero');
    const laterChange = changeFor(company, lead.id, 'segundo');
    const withDate = (change: LeadStatusChange, changedAt: Date) =>
      new LeadStatusChange(
        change.id,
        change.tenantId,
        change.leadId,
        change.oldStatusId,
        change.newStatusId,
        change.changedById,
        change.note,
        changedAt,
      );

    // Se guardan en orden inverso para que el orden lo dé la fecha, no la inserción.
    await historyRepository.create(withDate(laterChange, new Date('2026-11-16T10:05:00Z')));
    await historyRepository.create(withDate(earlierChange, new Date('2026-11-16T10:00:00Z')));

    const history = await historyRepository.findByLead(lead.id);
    expect(history.map((change) => change.note)).toEqual(['primero', 'segundo']);
  });

  it('no devuelve el historial de un lead de otra empresa', async () => {
    const foreignLead = await persistLead(otherCompany.tenant.id);
    await new PrismaLeadStatusHistoryRepository(prisma, new FixedTenantContext(otherCompany.tenant.id)).create(
      changeFor(otherCompany, foreignLead.id),
    );

    await expect(historyRepository.findByLead(foreignLead.id)).resolves.toEqual([]);
  });

  it('guarda siempre el tenant de la sesión, aunque el cambio diga otro', async () => {
    const lead = await persistLead(company.tenant.id);
    const changeClaimingOtherTenant = LeadStatusChange.create({
      ...changeFor(company, lead.id),
      tenantId: otherCompany.tenant.id,
    });

    await historyRepository.create(changeClaimingOtherTenant);

    const stored = await prisma.leadStatusHistory.findUniqueOrThrow({ where: { id: changeClaimingOtherTenant.id } });
    expect(stored.tenantId).toBe(company.tenant.id);
  });
});
