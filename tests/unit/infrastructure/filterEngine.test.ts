import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { companyContactFilterConfig } from '@/infrastructure/persistence/filters/companyContactFilterConfig.js';
import { contactFilterConfig } from '@/infrastructure/persistence/filters/contactFilterConfig.js';
import { leadFilterConfig } from '@/infrastructure/persistence/filters/leadFilterConfig.js';
import { BasePrismaRepository } from '@/infrastructure/persistence/repositories/BasePrismaRepository.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';

const DEFAULT_PAGE_SIZE = 20;

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';
const RECORD_ID = '22222222-2222-4222-8222-222222222222';

const SUPPORTED_OPERATORS = ['contains', 'equals', 'in', 'gt', 'gte', 'lt', 'lte'];

// Columnas internas: si entraran en una lista blanca, un cliente podría filtrar por ellas o saltarse el tenant.
const FORBIDDEN_FILTER_FIELDS = ['tenantId', 'deleted', 'passwordHash'];

const TENANT_CONDITION = { tenantId: TENANT_ID };
const NOT_DELETED_CONDITION = { deleted: DeletedState.ACTIVE };

const filterConfig: IFilterFieldConfig = {
  contactName: { type: 'text', allowedOperators: ['contains', 'equals'], searchable: true },
  email: { type: 'text', allowedOperators: ['contains', 'equals'], searchable: true },
  statusId: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
  estimatedValue: { type: 'number', allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'], searchable: false },
};

/** Expone los métodos protegidos de la clase base para poder probarlos sin base de datos. */
class RepositoryUnderTest extends BasePrismaRepository {
  constructor(tenantId: string) {
    // Estos tests no ejecutan consultas: el cliente de Prisma no se usa.
    super({} as PrismaClient, new FixedTenantContext(tenantId));
  }

  exposeTenantWhere() {
    return this.tenantWhere();
  }

  exposeWithTenant(additionalWhere: Record<string, unknown>) {
    return this.withTenant(additionalWhere);
  }

  exposeValidateTenant(record: { tenantId?: string }) {
    this.validateTenant(record);
  }

  exposeBuildFilterWhere(criteria: FilterCriteriaDTO, config: IFilterFieldConfig = filterConfig) {
    return this.buildFilterWhere(criteria, config);
  }

  exposeBuildPagination(criteria: FilterCriteriaDTO) {
    return this.buildPagination(criteria);
  }

  exposeSoftDelete(model: { update: (query: unknown) => Promise<unknown> }, id: string) {
    return this.softDeleteRegister(model, id);
  }
}

function createRepository(): RepositoryUnderTest {
  return new RepositoryUnderTest(TENANT_ID);
}

function conditionsOf(where: Record<string, unknown>): unknown[] {
  return where.AND as unknown[];
}

describe('BasePrismaRepository: alcance por tenant', () => {
  it('tenantWhere acota al tenant actual y a registros no borrados', () => {
    expect(createRepository().exposeTenantWhere()).toEqual({ tenantId: TENANT_ID, deleted: DeletedState.ACTIVE });
  });

  it('withTenant añade el tenant actual y pisa el que venga en la condición', () => {
    const where = createRepository().exposeWithTenant({ id: RECORD_ID, tenantId: OTHER_TENANT_ID });

    expect(where).toEqual({ id: RECORD_ID, tenantId: TENANT_ID });
  });

  it('validateTenant acepta un registro del tenant actual', () => {
    expect(() => createRepository().exposeValidateTenant({ tenantId: TENANT_ID })).not.toThrow();
  });

  it('validateTenant rechaza un registro de otro tenant', () => {
    expect(() => createRepository().exposeValidateTenant({ tenantId: OTHER_TENANT_ID })).toThrow();
  });
});

describe('BasePrismaRepository.buildFilterWhere', () => {
  it('sin filtros ni búsqueda sigue acotando al tenant y a registros no borrados', () => {
    const where = createRepository().exposeBuildFilterWhere({});

    expect(conditionsOf(where)).toEqual([TENANT_CONDITION, NOT_DELETED_CONDITION]);
  });

  it('con filtros conserva siempre las condiciones de tenant y de no borrado', () => {
    const where = createRepository().exposeBuildFilterWhere({
      filters: [{ field: 'contactName', operator: 'equals', value: 'Ana Gómez' }],
    });

    expect(conditionsOf(where)).toEqual(expect.arrayContaining([TENANT_CONDITION, NOT_DELETED_CONDITION]));
  });

  it('rechaza un campo que no está en la lista blanca', () => {
    expect(() =>
      createRepository().exposeBuildFilterWhere({
        filters: [{ field: 'passwordHash', operator: 'contains', value: '$2' }],
      }),
    ).toThrow(/passwordHash/);
  });

  it('rechaza filtrar por tenant aunque el cliente lo pida', () => {
    expect(() =>
      createRepository().exposeBuildFilterWhere({
        filters: [{ field: 'tenantId', operator: 'equals', value: OTHER_TENANT_ID }],
      }),
    ).toThrow(/tenantId/);
  });

  it('rechaza un operador que el campo no permite', () => {
    expect(() =>
      createRepository().exposeBuildFilterWhere({
        filters: [{ field: 'statusId', operator: 'contains', value: 'abc' }],
      }),
    ).toThrow(/contains/);
  });

  it('contains busca sin distinguir mayúsculas', () => {
    const where = createRepository().exposeBuildFilterWhere({
      filters: [{ field: 'contactName', operator: 'contains', value: 'ana' }],
    });

    expect(conditionsOf(where)).toContainEqual({ contactName: { contains: 'ana', mode: 'insensitive' } });
  });

  it.each([
    { operator: 'equals', field: 'statusId', value: RECORD_ID },
    { operator: 'in', field: 'statusId', value: [RECORD_ID] },
    { operator: 'gt', field: 'estimatedValue', value: 1000 },
    { operator: 'gte', field: 'estimatedValue', value: 1000 },
    { operator: 'lt', field: 'estimatedValue', value: 1000 },
    { operator: 'lte', field: 'estimatedValue', value: 1000 },
  ])('traduce el operador $operator a la condición equivalente de Prisma', ({ operator, field, value }) => {
    const where = createRepository().exposeBuildFilterWhere({ filters: [{ field, operator, value }] });

    expect(conditionsOf(where)).toContainEqual({ [field]: { [operator]: value } });
  });

  it('combina varios filtros con AND', () => {
    const where = createRepository().exposeBuildFilterWhere({
      filters: [
        { field: 'statusId', operator: 'equals', value: RECORD_ID },
        { field: 'estimatedValue', operator: 'gte', value: 1000 },
      ],
    });

    expect(conditionsOf(where)).toEqual([
      TENANT_CONDITION,
      NOT_DELETED_CONDITION,
      { statusId: { equals: RECORD_ID } },
      { estimatedValue: { gte: 1000 } },
    ]);
  });

  it('la búsqueda libre usa OR solo sobre los campos marcados como buscables', () => {
    const where = createRepository().exposeBuildFilterWhere({ search: 'ana' });

    expect(conditionsOf(where)).toContainEqual({
      OR: [
        { contactName: { contains: 'ana', mode: 'insensitive' } },
        { email: { contains: 'ana', mode: 'insensitive' } },
      ],
    });
  });

  it('ignora la búsqueda libre si ningún campo es buscable', () => {
    const configWithoutSearchableFields: IFilterFieldConfig = {
      statusId: { type: 'id', allowedOperators: ['equals'], searchable: false },
    };

    const where = createRepository().exposeBuildFilterWhere({ search: 'ana' }, configWithoutSearchableFields);

    expect(conditionsOf(where)).toEqual([TENANT_CONDITION, NOT_DELETED_CONDITION]);
  });
});

describe('BasePrismaRepository.buildPagination', () => {
  it('sin página ni límite devuelve los primeros 20 registros', () => {
    expect(createRepository().exposeBuildPagination({})).toEqual({ skip: 0, take: 20 });
  });

  it('calcula el salto según la página y el límite', () => {
    expect(createRepository().exposeBuildPagination({ page: 3, limit: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('acepta el límite máximo de 100', () => {
    expect(createRepository().exposeBuildPagination({ limit: 100 })).toEqual({ skip: 0, take: 100 });
  });

  it.each([{ limit: 101 }, { limit: 0 }, { limit: -1 }, { limit: Number.NaN }])(
    'con un límite fuera de rango ($limit) usa 20: nunca devuelve páginas sin tope',
    (criteria) => {
      expect(createRepository().exposeBuildPagination(criteria).take).toBe(DEFAULT_PAGE_SIZE);
    },
  );

  it.each([{ page: 0 }, { page: -3 }, { page: Number.NaN }])(
    'con una página inválida ($page) usa la primera',
    (criteria) => {
      expect(createRepository().exposeBuildPagination(criteria).skip).toBe(0);
    },
  );
});

describe('BasePrismaRepository.softDeleteRegister', () => {
  it('marca el registro como borrado, acotando la escritura al tenant actual', async () => {
    const model = { update: vi.fn().mockResolvedValue(undefined) };

    await createRepository().exposeSoftDelete(model, RECORD_ID);

    expect(model.update).toHaveBeenCalledWith({
      where: { id: RECORD_ID, tenantId: TENANT_ID },
      data: { deleted: DeletedState.INACTIVE, updatedAt: expect.any(Date) },
    });
  });

  it('rechaza un id vacío sin tocar la base de datos', async () => {
    const model = { update: vi.fn().mockResolvedValue(undefined) };

    await expect(createRepository().exposeSoftDelete(model, '')).rejects.toThrow();
    expect(model.update).not.toHaveBeenCalled();
  });
});

describe('Listas blancas de filtrado por módulo', () => {
  const filterConfigsByModule = [
    { moduleName: 'leads', config: leadFilterConfig },
    { moduleName: 'contactos', config: contactFilterConfig },
    { moduleName: 'empresas', config: companyContactFilterConfig },
  ];

  it.each(filterConfigsByModule)('$moduleName: no permite filtrar por columnas internas', ({ config }) => {
    const allowedFields = Object.keys(config);

    for (const forbiddenField of FORBIDDEN_FILTER_FIELDS) {
      expect(allowedFields).not.toContain(forbiddenField);
    }
  });

  it.each(filterConfigsByModule)('$moduleName: solo declara operadores que el motor implementa', ({ config }) => {
    const declaredOperators = Object.values(config).flatMap((fieldConfig) => fieldConfig.allowedOperators);

    for (const operator of declaredOperators) {
      expect(SUPPORTED_OPERATORS).toContain(operator);
    }
  });

  it.each(filterConfigsByModule)('$moduleName: todo campo buscable admite el operador contains', ({ config }) => {
    const searchableFieldConfigs = Object.values(config).filter((fieldConfig) => fieldConfig.searchable);

    expect(searchableFieldConfigs.length).toBeGreaterThan(0);
    for (const fieldConfig of searchableFieldConfigs) {
      expect(fieldConfig.allowedOperators).toContain('contains');
    }
  });
});
