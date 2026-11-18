import { beforeEach, describe, expect, it } from 'vitest';
import prisma from '@/config/database.js';
import { Lead } from '@/domain/entities/Lead.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { Money } from '@/domain/value-objects/money.js';
import { leadFilterConfig } from '@/infrastructure/persistence/filters/leadFilterConfig.js';
import { PrismaLeadRepository } from '@/infrastructure/persistence/repositories/PrismaLeadRepository.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import {
  type TenantWithTeam,
  persistLead,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

const UPDATED_ESTIMATED_VALUE = Money.fromDecimalString('3000000');
// Más cifras de las que number guarda sin error: comprueba que el valor no pasa por number (H21).
const PRECISE_ESTIMATED_VALUE = '12345678901234.57';
const TWO_MATCHING_RECORDS = 2;

function createRepositoryFor(tenantId: string): PrismaLeadRepository {
  return new PrismaLeadRepository(prisma, new FixedTenantContext(tenantId));
}

function idsOf(leads: Lead[]): string[] {
  return leads.map((lead) => lead.id).sort();
}

describe('PrismaLeadRepository', () => {
  let company: TenantWithTeam;
  let otherCompany: TenantWithTeam;
  let leadRepository: PrismaLeadRepository;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    otherCompany = await persistTenantWithTeam({ name: 'Otra Empresa SAS' });
    leadRepository = createRepositoryFor(company.tenant.id);
  });

  describe('create y findById', () => {
    it('guarda un lead con todos sus datos y lo recupera', async () => {
      const expectedCloseDate = new Date('2026-06-30T00:00:00.000Z');
      const lead = Lead.create({
        tenantId: company.tenant.id,
        companyName: 'Vidrios del Norte',
        contactName: 'Ana Gómez',
        email: 'ana@example.com',
        phone: '3001234567',
        statusId: company.defaultLeadStatus.id,
        source: 'Referido',
        assignedToId: company.salesRep.id,
        estimatedValue: Money.fromDecimalString(PRECISE_ESTIMATED_VALUE),
        expectedCloseDate,
        notes: 'Llamar el lunes',
      });

      await leadRepository.create(lead);
      const foundLead = await leadRepository.findById(lead.id);

      expect(foundLead).toMatchObject({
        id: lead.id,
        tenantId: company.tenant.id,
        companyName: 'Vidrios del Norte',
        contactName: 'Ana Gómez',
        email: 'ana@example.com',
        phone: '3001234567',
        statusId: company.defaultLeadStatus.id,
        source: 'Referido',
        assignedToId: company.salesRep.id,
        expectedCloseDate,
        notes: 'Llamar el lunes',
        deleted: DeletedState.ACTIVE,
      });
      expect(foundLead?.estimatedValue?.toDecimalString()).toBe(PRECISE_ESTIMATED_VALUE);
    });

    it('findById devuelve null si el lead no existe', async () => {
      await expect(leadRepository.findById(NON_EXISTENT_ID)).resolves.toBeNull();
    });

    it('findById no devuelve un lead de otra empresa', async () => {
      const foreignLead = await persistLead(otherCompany.tenant.id);

      await expect(leadRepository.findById(foreignLead.id)).resolves.toBeNull();
    });

    it('findById no devuelve un lead borrado', async () => {
      const deletedLead = await persistLead(company.tenant.id, { deleted: DeletedState.INACTIVE });

      await expect(leadRepository.findById(deletedLead.id)).resolves.toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('devuelve solo los leads activos de la empresa', async () => {
      const firstLead = await persistLead(company.tenant.id);
      const secondLead = await persistLead(company.tenant.id);
      await persistLead(company.tenant.id, { deleted: DeletedState.INACTIVE });
      await persistLead(otherCompany.tenant.id);

      const leads = await leadRepository.findByTenant();

      expect(idsOf(leads)).toEqual([firstLead.id, secondLead.id].sort());
    });

    it('con un responsable indicado devuelve solo sus leads', async () => {
      const ownLead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });
      await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id });
      await persistLead(company.tenant.id);

      const leads = await leadRepository.findByTenant(company.salesRep.id);

      expect(idsOf(leads)).toEqual([ownLead.id]);
    });
  });

  describe('update', () => {
    it('actualiza los datos comerciales y el responsable', async () => {
      const storedLead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });
      const changes = new Lead(
        storedLead.id,
        company.tenant.id,
        'Vidrios y Aluminios del Norte',
        'Ana María Gómez',
        'ana.maria@example.com',
        '3007654321',
        undefined,
        'Feria',
        company.otherSalesRep.id,
        UPDATED_ESTIMATED_VALUE,
        new Date('2026-09-15T00:00:00.000Z'),
        'Reasignado',
      );

      await leadRepository.update(storedLead.id, changes);

      await expect(leadRepository.findById(storedLead.id)).resolves.toMatchObject({
        companyName: 'Vidrios y Aluminios del Norte',
        contactName: 'Ana María Gómez',
        email: 'ana.maria@example.com',
        phone: '3007654321',
        source: 'Feria',
        assignedToId: company.otherSalesRep.id,
        estimatedValue: UPDATED_ESTIMATED_VALUE,
        expectedCloseDate: new Date('2026-09-15T00:00:00.000Z'),
        notes: 'Reasignado',
      });
    });

    it('no cambia el estado del lead', async () => {
      const [, contactedStatus] = company.leadStatuses;
      const storedLead = await persistLead(company.tenant.id, { statusId: company.defaultLeadStatus.id });
      const changes = Lead.create({ tenantId: company.tenant.id, statusId: contactedStatus.id, notes: 'Nota' });

      await leadRepository.update(storedLead.id, changes);

      const foundLead = await leadRepository.findById(storedLead.id);
      expect(foundLead?.statusId).toBe(company.defaultLeadStatus.id);
    });

    it('no modifica un lead de otra empresa', async () => {
      const foreignLead = await persistLead(otherCompany.tenant.id, { notes: 'Nota original' });
      const changes = Lead.create({ tenantId: company.tenant.id, notes: 'Nota ajena' });

      await expect(leadRepository.update(foreignLead.id, changes)).rejects.toThrow();

      const untouchedLead = await prisma.lead.findUniqueOrThrow({ where: { id: foreignLead.id } });
      expect(untouchedLead.notes).toBe('Nota original');
    });
  });

  describe('updateStatus', () => {
    it('cambia solo el estado del lead', async () => {
      const lead = await persistLead(company.tenant.id, { statusId: company.defaultLeadStatus.id, notes: 'Nota' });
      const [, contactedStatus] = company.leadStatuses;

      await leadRepository.updateStatus(lead.id, contactedStatus.id);

      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(storedLead.statusId).toBe(contactedStatus.id);
      expect(storedLead.notes).toBe('Nota');
    });

    it('no cambia el estado de un lead de otra empresa', async () => {
      const foreignLead = await persistLead(otherCompany.tenant.id, { statusId: otherCompany.defaultLeadStatus.id });

      await expect(leadRepository.updateStatus(foreignLead.id, company.defaultLeadStatus.id)).rejects.toThrow();

      const storedLead = await prisma.lead.findUniqueOrThrow({ where: { id: foreignLead.id } });
      expect(storedLead.statusId).toBe(otherCompany.defaultLeadStatus.id);
    });
  });

  describe('delete', () => {
    it('borra de forma suave: la fila sigue en la base de datos marcada como DELETED', async () => {
      const storedLead = await persistLead(company.tenant.id);

      await leadRepository.delete(storedLead.id);

      const deletedLead = await prisma.lead.findUniqueOrThrow({ where: { id: storedLead.id } });
      expect(deletedLead.deleted).toBe(DeletedState.INACTIVE);
      await expect(leadRepository.findById(storedLead.id)).resolves.toBeNull();
    });

    it('no borra un lead de otra empresa', async () => {
      const foreignLead = await persistLead(otherCompany.tenant.id);

      await expect(leadRepository.delete(foreignLead.id)).rejects.toThrow();

      const untouchedLead = await prisma.lead.findUniqueOrThrow({ where: { id: foreignLead.id } });
      expect(untouchedLead.deleted).toBe(DeletedState.ACTIVE);
    });
  });

  describe('findFiltered y countFiltered', () => {
    it('sin criterios devuelve los leads activos de la empresa y su total', async () => {
      const firstLead = await persistLead(company.tenant.id);
      const secondLead = await persistLead(company.tenant.id);
      await persistLead(company.tenant.id, { deleted: DeletedState.INACTIVE });
      await persistLead(otherCompany.tenant.id);

      const leads = await leadRepository.findFiltered({}, leadFilterConfig);
      const total = await leadRepository.countFiltered({}, leadFilterConfig);

      expect(idsOf(leads)).toEqual([firstLead.id, secondLead.id].sort());
      expect(total).toBe(TWO_MATCHING_RECORDS);
    });

    it('contains encuentra texto parcial sin distinguir mayúsculas', async () => {
      const matchingLead = await persistLead(company.tenant.id, { contactName: 'Ana Gómez' });
      await persistLead(company.tenant.id, { contactName: 'Pedro Ruiz' });

      const leads = await leadRepository.findFiltered(
        { filters: [{ field: 'contactName', operator: 'contains', value: 'GÓMEZ' }] },
        leadFilterConfig,
      );

      expect(idsOf(leads)).toEqual([matchingLead.id]);
    });

    it('equals filtra por estado', async () => {
      const [, contactedStatus] = company.leadStatuses;
      const contactedLead = await persistLead(company.tenant.id, { statusId: contactedStatus.id });
      await persistLead(company.tenant.id, { statusId: company.defaultLeadStatus.id });

      const leads = await leadRepository.findFiltered(
        { filters: [{ field: 'statusId', operator: 'equals', value: contactedStatus.id }] },
        leadFilterConfig,
      );

      expect(idsOf(leads)).toEqual([contactedLead.id]);
    });

    it('in filtra por varios responsables', async () => {
      const firstLead = await persistLead(company.tenant.id, { assignedToId: company.salesRep.id });
      const secondLead = await persistLead(company.tenant.id, { assignedToId: company.otherSalesRep.id });
      await persistLead(company.tenant.id, { assignedToId: company.salesLeader.id });

      const leads = await leadRepository.findFiltered(
        {
          filters: [{ field: 'assignedToId', operator: 'in', value: [company.salesRep.id, company.otherSalesRep.id] }],
        },
        leadFilterConfig,
      );

      expect(idsOf(leads)).toEqual([firstLead.id, secondLead.id].sort());
    });

    it('gte y lt acotan por valor estimado', async () => {
      await persistLead(company.tenant.id, { estimatedValue: 500_000 });
      const midValueLead = await persistLead(company.tenant.id, { estimatedValue: 1_000_000 });
      await persistLead(company.tenant.id, { estimatedValue: 5_000_000 });

      const leads = await leadRepository.findFiltered(
        {
          filters: [
            { field: 'estimatedValue', operator: 'gte', value: 1_000_000 },
            { field: 'estimatedValue', operator: 'lt', value: 5_000_000 },
          ],
        },
        leadFilterConfig,
      );

      expect(idsOf(leads)).toEqual([midValueLead.id]);
    });

    it('la búsqueda libre mira en cualquier campo buscable', async () => {
      const matchByCompany = await persistLead(company.tenant.id, { companyName: 'Roble Construcciones' });
      const matchByNotes = await persistLead(company.tenant.id, { notes: 'Pidió cotización de roble' });
      await persistLead(company.tenant.id, { source: 'roble' });

      const criteria = { search: 'ROBLE' };
      const leads = await leadRepository.findFiltered(criteria, leadFilterConfig);
      const total = await leadRepository.countFiltered(criteria, leadFilterConfig);

      // `source` no es buscable: el tercer lead no entra.
      expect(idsOf(leads)).toEqual([matchByCompany.id, matchByNotes.id].sort());
      expect(total).toBe(TWO_MATCHING_RECORDS);
    });

    it('pagina los resultados y el total cuenta todos los que cumplen el criterio', async () => {
      const storedLeadCount = 5;
      for (let leadNumber = 0; leadNumber < storedLeadCount; leadNumber += 1) {
        await persistLead(company.tenant.id);
      }

      const firstPage = await leadRepository.findFiltered({ page: 1, limit: 2 }, leadFilterConfig);
      const lastPage = await leadRepository.findFiltered({ page: 3, limit: 2 }, leadFilterConfig);
      const total = await leadRepository.countFiltered({ page: 3, limit: 2 }, leadFilterConfig);

      expect(firstPage).toHaveLength(TWO_MATCHING_RECORDS);
      expect(lastPage).toHaveLength(1);
      expect(total).toBe(storedLeadCount);
    });

    it('ningún filtro alcanza leads de otra empresa ni leads borrados', async () => {
      await persistLead(otherCompany.tenant.id, { contactName: 'Ana Gómez' });
      await persistLead(company.tenant.id, { contactName: 'Ana Gómez', deleted: DeletedState.INACTIVE });

      const criteria = { filters: [{ field: 'contactName', operator: 'equals', value: 'Ana Gómez' }] };
      const leads = await leadRepository.findFiltered(criteria, leadFilterConfig);
      const total = await leadRepository.countFiltered(criteria, leadFilterConfig);

      expect(leads).toEqual([]);
      expect(total).toBe(0);
    });

    it('rechaza filtrar por un campo fuera de la lista blanca', async () => {
      const criteria = { filters: [{ field: 'tenantId', operator: 'equals', value: otherCompany.tenant.id }] };

      await expect(leadRepository.findFiltered(criteria, leadFilterConfig)).rejects.toThrow();
      await expect(leadRepository.countFiltered(criteria, leadFilterConfig)).rejects.toThrow();
    });
  });
});
