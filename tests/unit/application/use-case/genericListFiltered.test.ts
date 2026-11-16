import { describe, expect, it } from 'vitest';
import { LeadMapper } from '@/application/mappers/LeadMapper.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { GenericListFilteredUseCase } from '@/application/use-case/filter/GenericListFilteredUseCase.js';
import { Action } from '@/application/policies/authorizationPolicy.js';
import { Role } from '@/domain/enums/Role.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { DEFAULT_TEST_TENANT_ID, buildLead } from '@tests/support/builders/entityBuilders.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryLeadRepository } from '@tests/support/doubles/InMemoryLeadRepository.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const STORED_LEAD_COUNT = 25;

const filterConfig: IFilterFieldConfig = {
  contactName: { type: 'text', allowedOperators: ['contains', 'equals'], searchable: true },
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

// F1-T12: el alcance por rol del listado filtrado pasa del controller al caso de uso.
describe('GenericListFilteredUseCase con alcance por responsable', () => {
  const salesRepId = '33333333-3333-4333-8333-333333333333';
  const otherSalesRepId = '44444444-4444-4444-8444-444444444444';

  function setupScopedListFiltered() {
    const leadRepository = new InMemoryLeadRepository(new FixedTenantContext(DEFAULT_TEST_TENANT_ID));
    const listFilteredUseCase = new GenericListFilteredUseCase(leadRepository, new LeadMapper(), filterConfig, {
      action: Action.LEAD_LIST,
      ownerField: 'assignedToId',
    });
    return { listFilteredUseCase, leadRepository };
  }

  it('a un comercial le descarta cualquier filtro por responsable y le fuerza el suyo', async () => {
    const { listFilteredUseCase, leadRepository } = setupScopedListFiltered();

    await listFilteredUseCase.execute(
      { filters: [{ field: 'assignedToId', operator: 'equals', value: otherSalesRepId }] },
      { role: Role.SALES_REP, userId: salesRepId },
    );

    expect(leadRepository.lastFilterCriteria?.filters).toEqual([
      { field: 'assignedToId', operator: 'equals', value: salesRepId },
    ]);
  });

  it('a un rol de gestión le deja los filtros tal como llegan', async () => {
    const { listFilteredUseCase, leadRepository } = setupScopedListFiltered();
    const filters = [{ field: 'assignedToId', operator: 'equals', value: otherSalesRepId }];

    await listFilteredUseCase.execute({ filters }, { role: Role.OWNER, userId: salesRepId });

    expect(leadRepository.lastFilterCriteria?.filters).toEqual(filters);
  });

  it('sin actor, o con un rol sin permiso, responde ForbiddenError y no consulta', async () => {
    const { listFilteredUseCase, leadRepository } = setupScopedListFiltered();

    await expect(listFilteredUseCase.execute({})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      listFilteredUseCase.execute({}, { role: 'SUPER_USER' as Role, userId: salesRepId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(leadRepository.lastFilterCriteria).toBeUndefined();
  });
});
