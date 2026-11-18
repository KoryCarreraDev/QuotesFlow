import { describe, expect, it } from 'vitest';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { parseFilterQuery } from '@/infrastructure/web/filters/parseFilterQuery.js';

// F1-T12 (H11): `filters[].value` llegaba a Prisma sin tipo; un valor de tipo equivocado respondía 500.
// El parser valida cada filtro según el tipo declarado del campo antes de que llegue al caso de uso.

const VALID_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_VALID_ID = '22222222-2222-4222-8222-222222222222';
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const REQUESTED_PAGE = 3;
const REQUESTED_LIMIT = 50;
const MAXIMUM_FILTER_COUNT = 20;
const MAXIMUM_TEXT_LENGTH = 200;
// R8 (F3-A11): los importes se filtran como texto decimal exacto, nunca como number.
const POSITION = 7;
const FRACTIONAL_NUMBER = 1_500_000.5;
const WHOLE_NUMBER = 1000;
const ESTIMATED_VALUE = '1500000.50';

const config: IFilterFieldConfig = {
  contactName: { type: 'text', allowedOperators: ['contains', 'equals'], searchable: true, sortable: true },
  estimatedValue: { type: 'money', allowedOperators: ['equals', 'in', 'gt', 'gte', 'lt', 'lte'], searchable: false },
  position: { type: 'number', allowedOperators: ['equals', 'gt', 'gte', 'lt', 'lte'], searchable: false },
  createdAt: { type: 'date', allowedOperators: ['gt', 'gte', 'lt', 'lte'], searchable: false, sortable: true },
  statusId: { type: 'id', allowedOperators: ['equals', 'in'], searchable: false },
};

function filtersQuery(filters: unknown): Record<string, unknown> {
  return { filters: JSON.stringify(filters) };
}

function errorOf(query: Record<string, unknown>): ValidationError {
  try {
    parseFilterQuery(query, config);
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error('parseFilterQuery accepted an invalid query');
}

describe('parseFilterQuery', () => {
  it('sin parámetros devuelve la primera página de 20, sin filtros y el orden por defecto', () => {
    expect(parseFilterQuery({}, config)).toEqual({
      filters: [],
      search: undefined,
      page: DEFAULT_PAGE,
      limit: DEFAULT_LIMIT,
      sortBy: undefined,
      sortDir: 'desc',
    });
  });

  it('convierte página y límite a número', () => {
    const criteria = parseFilterQuery({ page: String(REQUESTED_PAGE), limit: String(REQUESTED_LIMIT) }, config);

    expect(criteria).toMatchObject({ page: REQUESTED_PAGE, limit: REQUESTED_LIMIT });
  });

  it.each([
    ['0', 'abc'],
    ['-1', '1000'],
  ])('una página %s o un límite %s fuera de rango vuelven al valor por defecto', (page, limit) => {
    expect(parseFilterQuery({ page, limit }, config)).toMatchObject({ page: DEFAULT_PAGE, limit: DEFAULT_LIMIT });
  });

  describe('importes como texto decimal (R8, F3-A11)', () => {
    it.each(['0', '1500000', '1500000.5', '0.10', '98765432109876.54'])('acepta el importe %s', (amount) => {
      const criteria = parseFilterQuery(
        filtersQuery([{ field: 'estimatedValue', operator: 'gte', value: amount }]),
        config,
      );

      expect(criteria.filters).toEqual([{ field: 'estimatedValue', operator: 'gte', value: amount }]);
    });

    it.each([
      ['un number, que pierde céntimos', FRACTIONAL_NUMBER],
      ['un number entero', WHOLE_NUMBER],
      ['notación científica', '1e15'],
      ['separador de miles', '1,500,000'],
      ['más de dos decimales', '10.001'],
      ['negativo', '-5'],
      ['texto', 'mucho'],
      ['vacío', ''],
      ['un objeto de Prisma', { not: '1' }],
    ])('rechaza %s con 400 INVALID_FILTER_VALUE', (_description, value) => {
      expect(() =>
        parseFilterQuery(filtersQuery([{ field: 'estimatedValue', operator: 'gte', value }]), config),
      ).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_FILTER_VALUE }));
    });

    it('con in exige una lista de importes en texto', () => {
      expect(() =>
        parseFilterQuery(filtersQuery([{ field: 'estimatedValue', operator: 'in', value: [WHOLE_NUMBER] }]), config),
      ).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_FILTER_VALUE }));
    });
  });

  describe('tipos de valor (H11)', () => {
    it('acepta texto, número, fecha e id con su tipo y convierte las fechas a Date', () => {
      const criteria = parseFilterQuery(
        filtersQuery([
          { field: 'contactName', operator: 'contains', value: 'Ana' },
          { field: 'estimatedValue', operator: 'gte', value: ESTIMATED_VALUE },
          { field: 'position', operator: 'lt', value: POSITION },
          { field: 'createdAt', operator: 'gte', value: '2026-01-01' },
          { field: 'statusId', operator: 'in', value: [VALID_ID, OTHER_VALID_ID] },
        ]),
        config,
      );

      expect(criteria.filters).toEqual([
        { field: 'contactName', operator: 'contains', value: 'Ana' },
        { field: 'estimatedValue', operator: 'gte', value: ESTIMATED_VALUE },
        { field: 'position', operator: 'lt', value: POSITION },
        { field: 'createdAt', operator: 'gte', value: new Date('2026-01-01') },
        { field: 'statusId', operator: 'in', value: [VALID_ID, OTHER_VALID_ID] },
      ]);
    });

    it.each([
      ['un objeto en un campo numérico', { field: 'position', operator: 'gte', value: { not: 'a number' } }],
      ['texto en un campo numérico', { field: 'position', operator: 'gte', value: '1000' }],
      [
        'un objeto en un campo de texto (inyección de operadores de Prisma)',
        {
          field: 'contactName',
          operator: 'equals',
          value: { not: '' },
        },
      ],
      ['un texto que no es fecha', { field: 'createdAt', operator: 'gte', value: 'yesterday' }],
      ['un id que no es uuid', { field: 'statusId', operator: 'equals', value: 'status-1' }],
      ['in sin lista', { field: 'statusId', operator: 'in', value: VALID_ID }],
      ['in con una lista vacía', { field: 'statusId', operator: 'in', value: [] }],
      [
        'un texto de más de 200 caracteres',
        {
          field: 'contactName',
          operator: 'contains',
          value: 'x'.repeat(MAXIMUM_TEXT_LENGTH + 1),
        },
      ],
    ])('rechaza %s con 400 INVALID_FILTER_VALUE', (_case, filter) => {
      const error = errorOf(filtersQuery([filter]));

      expect(error.code).toBe(ErrorCode.INVALID_FILTER_VALUE);
      expect(error.details).toEqual([expect.objectContaining({ path: ['filters', 0, 'value'] })]);
    });
  });

  describe('forma de filters', () => {
    it.each([
      ['no es JSON', { filters: '{broken' }],
      ['es un objeto en lugar de una lista', filtersQuery({ field: 'contactName' })],
      ['un filtro no tiene campo u operador', filtersQuery([{ value: 'Ana' }])],
      ['se repite el parámetro', { filters: ['[]', '[]'] }],
      [
        'trae más de 20 filtros',
        filtersQuery(
          Array.from({ length: MAXIMUM_FILTER_COUNT + 1 }, () => ({
            field: 'contactName',
            operator: 'equals',
            value: 'A',
          })),
        ),
      ],
    ])('responde INVALID_FILTERS_FORMAT si %s', (_case, query) => {
      expect(errorOf(query).code).toBe(ErrorCode.INVALID_FILTERS_FORMAT);
    });

    it('un campo fuera de la lista blanca responde FILTER_FIELD_NOT_ALLOWED', () => {
      expect(errorOf(filtersQuery([{ field: 'tenantId', operator: 'equals', value: VALID_ID }])).code).toBe(
        ErrorCode.FILTER_FIELD_NOT_ALLOWED,
      );
    });

    it('un nombre heredado de Object (__proto__) no cuenta como campo permitido', () => {
      expect(errorOf(filtersQuery([{ field: '__proto__', operator: 'equals', value: 'x' }])).code).toBe(
        ErrorCode.FILTER_FIELD_NOT_ALLOWED,
      );
    });

    it('un operador que el campo no permite responde FILTER_OPERATOR_NOT_ALLOWED', () => {
      expect(errorOf(filtersQuery([{ field: 'contactName', operator: 'gt', value: 'A' }])).code).toBe(
        ErrorCode.FILTER_OPERATOR_NOT_ALLOWED,
      );
    });
  });

  describe('búsqueda', () => {
    it('acepta un texto de búsqueda', () => {
      expect(parseFilterQuery({ search: 'roble' }, config).search).toBe('roble');
    });

    it('rechaza una búsqueda de más de 200 caracteres o repetida', () => {
      expect(errorOf({ search: 'x'.repeat(MAXIMUM_TEXT_LENGTH + 1) }).code).toBe(ErrorCode.INVALID_FILTER_VALUE);
      expect(errorOf({ search: ['a', 'b'] }).code).toBe(ErrorCode.INVALID_FILTER_VALUE);
    });
  });

  describe('orden', () => {
    it('acepta ordenar por un campo de la lista blanca, en el sentido pedido', () => {
      expect(parseFilterQuery({ sortBy: 'contactName', sortDir: 'asc' }, config)).toMatchObject({
        sortBy: 'contactName',
        sortDir: 'asc',
      });
    });

    it('rechaza ordenar por un campo que no es ordenable: SORT_FIELD_NOT_ALLOWED', () => {
      expect(errorOf({ sortBy: 'statusId' }).code).toBe(ErrorCode.SORT_FIELD_NOT_ALLOWED);
      expect(errorOf({ sortBy: 'passwordHash' }).code).toBe(ErrorCode.SORT_FIELD_NOT_ALLOWED);
    });

    it('rechaza un sentido que no es asc ni desc', () => {
      expect(errorOf({ sortBy: 'contactName', sortDir: 'sideways' }).code).toBe(ErrorCode.INVALID_FILTER_VALUE);
    });
  });
});
