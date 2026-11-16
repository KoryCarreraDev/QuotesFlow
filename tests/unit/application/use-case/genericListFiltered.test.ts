import { describe, expect, it } from 'vitest';
import { LeadMapper } from '@/application/mappers/LeadMapper.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { GenericListFilteredUseCase } from '@/application/use-case/filter/GenericListFilteredUseCase.js';
import { DEFAULT_TEST_TENANT_ID, buildLead } from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryLeadRepository } from '@tests/support/doubles/InMemoryLeadRepository.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const STORED_LEAD_COUNT = 25;

const filterConfig: IFilterFieldConfig = {
  contactName: { allowedOperators: ['contains', 'equals'], searchable: true },
};

function setupListFiltered() {
  const leadRepository = new InMemoryLeadRepository(new FixedTenantContext(DEFAULT_TEST_TENANT_ID));
  leadRepository.seed(...Array.from({ length: STORED_LEAD_COUNT }, () => buildLead()));

  const listFilteredUseCase = new GenericListFilteredUseCase(leadRepository, new LeadMapper(), filterConfig);
  return { listFilteredUseCase, leadRepository };
}

describe('GenericListFilteredUseCase', () => {
  it('sin página ni límite devuelve la primera página de 20 y el total real', async () => {
    const { listFilteredUseCase } = setupListFiltered();

    const result = await listFilteredUseCase.execute({});

    expect(result.page).toBe(DEFAULT_PAGE);
    expect(result.limit).toBe(DEFAULT_PAGE_SIZE);
    expect(result.total).toBe(STORED_LEAD_COUNT);
    expect(result.data).toHaveLength(DEFAULT_PAGE_SIZE);
  });

  it('respeta la página y el límite pedidos', async () => {
    const { listFilteredUseCase } = setupListFiltered();

    const result = await listFilteredUseCase.execute({ page: 3, limit: 10 });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.data).toHaveLength(5);
  });

  it('acepta el límite máximo de 100', async () => {
    const { listFilteredUseCase } = setupListFiltered();

    const result = await listFilteredUseCase.execute({ limit: MAX_PAGE_SIZE });

    expect(result.limit).toBe(MAX_PAGE_SIZE);
    expect(result.data).toHaveLength(STORED_LEAD_COUNT);
  });

  it.each([
    { description: 'un límite mayor que 100', criteria: { limit: 101 } },
    { description: 'un límite de cero', criteria: { limit: 0 } },
    { description: 'un límite negativo', criteria: { limit: -5 } },
    { description: 'un límite que no es un número', criteria: { limit: Number.NaN } },
  ])('ante $description usa el límite por defecto', async ({ criteria }) => {
    const { listFilteredUseCase } = setupListFiltered();

    const result = await listFilteredUseCase.execute(criteria);

    expect(result.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it.each([
    { description: 'una página cero', criteria: { page: 0 } },
    { description: 'una página negativa', criteria: { page: -2 } },
    { description: 'una página que no es un número', criteria: { page: Number.NaN } },
  ])('ante $description usa la primera página', async ({ criteria }) => {
    const { listFilteredUseCase } = setupListFiltered();

    const result = await listFilteredUseCase.execute(criteria);

    expect(result.page).toBe(DEFAULT_PAGE);
  });

  it('entrega al repositorio el criterio recibido y la lista blanca de campos del módulo', async () => {
    const { listFilteredUseCase, leadRepository } = setupListFiltered();
    const criteria = {
      search: 'ana',
      filters: [{ field: 'contactName', operator: 'contains', value: 'Ana' }],
    };

    await listFilteredUseCase.execute(criteria);

    expect(leadRepository.lastFilterCriteria).toEqual(criteria);
    expect(leadRepository.lastFilterConfig).toBe(filterConfig);
  });

  it('devuelve DTO, no entidades: el tenant no sale en la respuesta', async () => {
    const { listFilteredUseCase } = setupListFiltered();

    const result = await listFilteredUseCase.execute({ limit: 1 });

    expect(Object.keys(result.data[0])).not.toContain('tenantId');
  });
});
