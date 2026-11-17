import { z } from 'zod';
import { FilterCriteriaDTO, FilterCondition, SortDirection } from '../../../application/dtos/FilterCriteriaDTO.js';
import { FilterFieldType, IFilterFieldConfig } from '../../../application/ports/services/IFilterFieldConfig.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';

// Convierte la query de un listado filtrado (`?filters=[…]&search=&page=&limit=&sortBy=&sortDir=`) en
// criterios ya validados (F1-T12, H11). Nada que no pase por aquí llega al repositorio: cada valor tiene
// el tipo declarado de su campo, así que el cliente no puede colar operadores de Prisma como `{ not: … }`.

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 100;
const MAXIMUM_FILTER_COUNT = 20;
const MAXIMUM_TEXT_LENGTH = 200;
const MAXIMUM_LIST_LENGTH = 100;
const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';
const LIST_OPERATOR = 'in';

const filterShapeSchema = z
  .array(z.object({ field: z.string(), operator: z.string(), value: z.unknown() }))
  .max(MAXIMUM_FILTER_COUNT);

const valueSchemaByType: Record<FilterFieldType, z.ZodType> = {
  text: z.string().max(MAXIMUM_TEXT_LENGTH),
  number: z.number().finite(),
  // Fecha (2026-01-31) o fecha y hora ISO con zona; llega al repositorio como Date.
  date: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).transform((value) => new Date(value)),
  id: z.uuid(),
  // F3-T02: por ejemplo, solo los productos activos.
  boolean: z.boolean(),
};

function invalidValue(message: string, path: Array<string | number>): ValidationError {
  return new ValidationError(ErrorCode.INVALID_FILTER_VALUE, message, [{ path, message }]);
}

function singleQueryValue(value: unknown, parameterName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw invalidValue(`Query parameter ${parameterName} must appear once`, [parameterName]);
  }
  return value;
}

/** Página y límite inválidos vuelven al valor por defecto: es la conducta que ya usa el frontend. */
function positiveIntegerOrDefault(value: unknown, defaultValue: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : defaultValue;
}

function readRawFilters(filtersParameter: unknown): Array<{ field: string; operator: string; value: unknown }> {
  if (filtersParameter === undefined || filtersParameter === '') return [];
  if (typeof filtersParameter !== 'string') {
    throw new ValidationError(ErrorCode.INVALID_FILTERS_FORMAT, 'Query parameter filters must appear once');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(filtersParameter);
  } catch (error) {
    throw new ValidationError(ErrorCode.INVALID_FILTERS_FORMAT, 'Invalid filters format', [], { cause: error });
  }

  const shape = filterShapeSchema.safeParse(parsedJson);
  if (!shape.success) {
    throw new ValidationError(
      ErrorCode.INVALID_FILTERS_FORMAT,
      `filters must be a list of at most ${MAXIMUM_FILTER_COUNT} { field, operator, value } objects`,
    );
  }
  return shape.data;
}

function validateFilter(
  rawFilter: { field: string; operator: string; value: unknown },
  index: number,
  fieldConfigs: ReadonlyMap<string, IFilterFieldConfig[string]>,
): FilterCondition {
  // Map: un nombre como `__proto__` no resuelve a nada heredado de Object.
  const fieldConfig = fieldConfigs.get(rawFilter.field);
  if (!fieldConfig) {
    throw new ValidationError(
      ErrorCode.FILTER_FIELD_NOT_ALLOWED,
      `Field is not allowed in filters: ${rawFilter.field}`,
    );
  }
  if (!fieldConfig.allowedOperators.includes(rawFilter.operator)) {
    throw new ValidationError(
      ErrorCode.FILTER_OPERATOR_NOT_ALLOWED,
      `Operator ${rawFilter.operator} is not allowed for field ${rawFilter.field}`,
    );
  }

  const baseSchema = valueSchemaByType[fieldConfig.type];
  const valueSchema =
    rawFilter.operator === LIST_OPERATOR ? z.array(baseSchema).min(1).max(MAXIMUM_LIST_LENGTH) : baseSchema;
  const parsedValue = valueSchema.safeParse(rawFilter.value);
  if (!parsedValue.success) {
    const expected = rawFilter.operator === LIST_OPERATOR ? `a list of ${fieldConfig.type}` : fieldConfig.type;
    throw invalidValue(`Value for field ${rawFilter.field} must be ${expected}`, ['filters', index, 'value']);
  }

  return { field: rawFilter.field, operator: rawFilter.operator, value: parsedValue.data };
}

function readSort(query: Record<string, unknown>, fieldConfigs: ReadonlyMap<string, IFilterFieldConfig[string]>) {
  const sortBy = singleQueryValue(query.sortBy, 'sortBy');
  if (sortBy !== undefined && !fieldConfigs.get(sortBy)?.sortable) {
    throw new ValidationError(ErrorCode.SORT_FIELD_NOT_ALLOWED, `Field is not allowed for sorting: ${sortBy}`);
  }

  const sortDirection = singleQueryValue(query.sortDir, 'sortDir') ?? DEFAULT_SORT_DIRECTION;
  if (sortDirection !== 'asc' && sortDirection !== 'desc') {
    throw invalidValue('sortDir must be asc or desc', ['sortDir']);
  }
  return { sortBy, sortDir: sortDirection as SortDirection };
}

/**
 * Valida la query de un listado filtrado contra la configuración de campos de la entidad.
 *
 * @throws {ValidationError} `INVALID_FILTERS_FORMAT`, `FILTER_FIELD_NOT_ALLOWED`,
 * `FILTER_OPERATOR_NOT_ALLOWED`, `INVALID_FILTER_VALUE` o `SORT_FIELD_NOT_ALLOWED`.
 */
export function parseFilterQuery(query: Record<string, unknown>, config: IFilterFieldConfig): FilterCriteriaDTO {
  const fieldConfigs = new Map(Object.entries(config));

  const filters = readRawFilters(query.filters).map((rawFilter, index) =>
    validateFilter(rawFilter, index, fieldConfigs),
  );

  const search = singleQueryValue(query.search, 'search');
  if (search !== undefined && search.length > MAXIMUM_TEXT_LENGTH) {
    throw invalidValue(`search must have at most ${MAXIMUM_TEXT_LENGTH} characters`, ['search']);
  }

  return {
    filters,
    search,
    page: positiveIntegerOrDefault(query.page, DEFAULT_PAGE),
    limit: positiveIntegerOrDefault(query.limit, DEFAULT_LIMIT, MAXIMUM_LIMIT),
    ...readSort(query, fieldConfigs),
  };
}
