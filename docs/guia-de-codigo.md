# Guía de código de QuotesFlow

Convenciones obligatorias para personas e IAs. Desarrolla las reglas R4, R8, R11, R12 y R13 de `PLAN.md` y las respuestas Q-001 a Q-003 de `QUESTION.md`.
Lo que se pueda comprobar con una herramienta lo comprueban ESLint (F0-T03) y `dependency-cruiser` (F0-T04). El resto, la revisión.

Los ejemplos "malo" están tomados del código actual. Se corrigen en F1-T15 y F1-T18; no copies ese estilo en código nuevo.

---

## 1. Idioma (R11)

| Va en **español** | Va en **inglés** |
|---|---|
| Archivos `.md` y `docs/` | Nombres de variables, funciones, clases, tipos, archivos y carpetas |
| Comentarios (`//`, `/* */`, `#`, `<!-- -->`) y JSDoc (Q-001) | Nombres de ramas (`feat/F1-T02-error-handling`) |
| Mensajes de commit, títulos y descripciones de PR (Q-002) | Rutas de la API y campos de la base de datos |
| Descripciones de OpenAPI | Códigos y mensajes de error de la API (Q-003) |
| Títulos de `describe` e `it` en los tests (supuesto de Q-006) | Mensajes de log |
| Lo que lee el cliente final: correos, PDF, notificaciones | Valores de enums y constantes |

Malo (mezcla de idiomas en errores; `BasePrismaRepository.ts`):
```ts
throw new Error(`Campo no permitido para el filtro: ${filter.field}`)
```
Bueno (código estable y mensaje técnico en inglés; F1-T02 introduce las clases de error):
```ts
throw new ValidationError('FILTER_FIELD_NOT_ALLOWED', `Field not allowed in filter: ${filter.field}`);
```

---

## 2. Nombres (R13)

Nombres completos, que digan qué es la cosa sin leer su implementación. Sin abreviaturas, sin genéricos (`data`, `info`, `tmp`, `obj`, `item` sin contexto), sin mezclar idiomas.

| Malo (código actual) | Problema | Bueno |
|---|---|---|
| `leadmap` (`createLeadUseCase.ts`, `updateLeadUseCase.ts`) | Abreviatura y sin camelCase | `leadMapper` |
| `rolUser` (`leadStatusConfigControllers.ts`, `getLeadsUseCase.ts`) | Mezcla español e inglés, orden invertido | `userRole` |
| `existingRepo` (`deleteLeadUseCase.ts`) | No es un repositorio, es un lead | `existingLead` |
| `leadProperty` (`updateLeadUseCase.ts`) | No es una propiedad, es el lead guardado | `storedLead` |
| `leadRepo` | Abreviatura | `leadRepository` |
| `cfg` (`BasePrismaRepository.ts`) | Abreviatura | `fieldConfig` |
| `JwTokenService` (`JwtTokenService.ts`) | El nombre de la clase no coincide con el archivo | `JwtTokenService` |

Formas:

| Elemento | Forma | Ejemplo |
|---|---|---|
| Variables, funciones, métodos, propiedades | `camelCase` | `assignedToId`, `findByTenant` |
| Clases, interfaces, tipos, enums | `PascalCase` | `CreateLeadUseCase` |
| Puertos (interfaces de `application/ports`) | `I` + `PascalCase` | `ILeadRepository` |
| Constantes de módulo con valor fijo | `UPPER_SNAKE_CASE` | `MAX_PAGE_SIZE` |
| Miembros de enum | `UPPER_SNAKE_CASE` | `Role.SALES_REP` |
| Booleanos | Pregunta con `is`, `has`, `can`, `should` | `isDefault`, `canReassignLead` |
| Funciones | Verbo + objeto | `buildFilterWhere`, `assertLeadBelongsToUser` |
| Archivos | Igual que lo que exportan | `PrismaLeadStatusConfigRepository.ts` exporta `PrismaLeadStatusConfigRepository` |

---

## 3. Funciones cortas con un solo propósito (R13)

Una función hace una cosa y su nombre la dice. Si para describirla necesitas "y", son dos funciones.
Orientación: si pasa de unas 30 líneas o tiene más de dos niveles de anidación, probablemente se puede dividir.

Malo: `BasePrismaRepository.buildFilterWhere` valida campos, valida operadores, traduce cada operador con una cadena de `if/else`, construye la búsqueda global y combina condiciones, todo en una función.

Bueno: cada paso con nombre propio.
```ts
protected buildFilterWhere(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): PrismaWhere {
  const conditions = [
    this.tenantWhere(),
    ...this.buildFieldConditions(criteria.filters ?? [], config),
    ...this.buildSearchCondition(criteria.search, config),
  ];
  return { AND: conditions };
}
```

Las reglas de negocio con nombre propio se leen solas:
```ts
// Malo (deleteLeadUseCase.ts)
if (role === Role.SALES_REP && existingRepo.assignedToId !== userId) { ... }

// Bueno
if (!canManageLead(user, existingLead)) { ... }
```
(F1-T04 centraliza estas comprobaciones en `application/policies`.)

---

## 4. Sin números ni cadenas mágicas (R13)

Todo valor literal con significado de negocio o de seguridad va en una constante con nombre o en un enum.

Malo (`BasePrismaRepository.ts`, `app.ts`):
```ts
const limit = criteria.limit && criteria.limit > 0 && criteria.limit <= 100 ? criteria.limit : 20;
if (existingLead.deleted === 'DELETED') { ... }
windowMs: 15 * 60 * 1000,
```
Bueno:
```ts
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

if (existingLead.deleted === DeletedState.Inactive) { ... }
```

No hace falta constante para `0`, `1` o `-1` usados como índice o contador, ni para cadenas que solo son texto de un log.

---

## 5. Tipos: sin `any` (R13)

Prohibido `any`, explícito o como `as any`. Alternativas:

| Situación | Usa |
|---|---|
| No se conoce el tipo de algo que llega de fuera (`catch`, JSON) | `unknown` y estrechar con Zod o `instanceof` |
| Registro de Prisma | El tipo generado (`Prisma.LeadGetPayload<...>`, `Lead` de `@prisma/client`) |
| Objeto con claves libres | `Record<string, unknown>` |
| Varias formas posibles | Unión discriminada |

Malo (`validateBody.ts`, `PrismaUserRepository.ts`, `Lead.ts`):
```ts
} catch (error: any) {
private toDomain(record: any): User {
estimatedValue?: any;
```
Bueno:
```ts
} catch (error: unknown) {
  if (error instanceof ZodError) { ... }
private toDomain(record: PrismaUser): User {
estimatedValue?: Money;
```

---

## 6. Comentarios: el porqué, nunca el qué (R13, Q-001)

En español. Un comentario explica una regla de negocio, una decisión de seguridad o un caso límite. Si repite lo que el código ya dice, sobra: borra el comentario y, si hace falta, mejora el nombre.

Malo (`BasePrismaRepository.ts`):
```ts
//Inicializa el array de condiciones
let conditions: Array<Record<string, unknown>> = [];

//Añade el tenantId
conditions.push({ tenantId: this.tenantId });
```
Bueno:
```ts
// El tenant y el borrado suave van siempre primero: ningún filtro del cliente puede quitarlos (R5).
const conditions = [this.tenantWhere()];
```

Otro bueno (`PrismaUserRepository`):
```ts
// Sin filtro de tenant a propósito: el correo es único en toda la plataforma y el login aún no conoce el tenant.
async findByEmail(email: string): Promise<User | null> { ... }
```

**Prohibido dejar código comentado.** Si no se usa, se borra; Git lo recuerda.
Formato: un espacio después de `//` y frase con mayúscula inicial.
`TODO` solo con el ID de la tarea que lo resuelve: `// TODO(F1-T13): registrar el cambio en LeadStatusHistory.`

---

## 7. JSDoc (R12)

Obligatorio en puertos (`application/ports`), casos de uso y entidades. En español. Describe el contrato: qué hace, reglas que aplica, qué devuelve y qué errores lanza. No repite los tipos que TypeScript ya declara.

```ts
/**
 * Borra (borrado suave) un lead del tenant actual.
 *
 * Reglas:
 * - Un SALES_REP solo puede borrar los leads que tiene asignados.
 * - Un lead ya borrado se trata como inexistente.
 *
 * @throws NotFoundError si el lead no existe en el tenant o ya está borrado.
 * @throws ForbiddenError si el rol no permite borrarlo.
 */
export class DeleteLeadUseCase { ... }
```

Puerto:
```ts
/**
 * Acceso a los leads del tenant actual. Toda implementación filtra por `tenantId`
 * y excluye los registros borrados (R5).
 */
export interface ILeadRepository extends IFilterableRepository<Lead> {
  /** Devuelve el lead o `null` si no existe, es de otro tenant o está borrado. */
  findById(id: string): Promise<Lead | null>;
}
```

---

## 8. Capas e imports (R4)

| Capa | Puede importar |
|---|---|
| `domain/` | Nada de fuera de `domain/` (ni Express, ni Prisma, ni Zod). Solo se admiten módulos nativos de Node como `node:crypto` |
| `application/` | `domain/` y módulos nativos de Node |
| `infrastructure/` | `application/`, `domain/`, librerías externas |
| `presentation/` | `infrastructure/web`, `application/`, `domain/` |
| `cross-cutting/` | Todas (es la composición) |

Además, `infrastructure/` no importa `presentation/`, `presentation/` no importa `infrastructure/persistence/`, no hay ciclos de imports y `src/` no importa `devDependencies`.
Lo comprueba `pnpm arch:check` (`dependency-cruiser`, reglas en `.dependency-cruiser.cjs`).

Toda librería o servicio externo entra por un puerto en `application/ports` con su adaptador en `infrastructure/`.
Imports con el alias `@/` (`@/domain/entities/Lead.js`) en vez de rutas relativas largas (`../../../domain/...`). Terminan siempre en `.js` (ESM).

---

## 9. Seguridad en el código (R5, R8)

- Entrada validada con Zod en el borde (`presentation/schemas`). Nada llega al caso de uso sin validar.
- Salida siempre por DTO; nunca se devuelve una entidad ni un registro de Prisma.
- Dinero con decimales exactos (objeto de valor `Money`, F3-T01); nunca `number`.
- SQL crudo solo con `$queryRaw` y plantilla; nunca `$queryRawUnsafe` ni concatenación.
- Secretos solo por variables de entorno; nunca valores por defecto para secretos (H1).
- Toda consulta filtra por `tenantId` y `deleted`.
- Los errores no exponen trazas ni detalles internos al cliente.

---

## 10. Errores

Hasta F1-T02 los casos de uso lanzan `Error`. Desde F1-T02, solo las clases tipadas (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `UnauthorizedError`) con un código estable en inglés en `UPPER_SNAKE_CASE` (Q-003): `LEAD_NOT_FOUND`, `INSUFFICIENT_PERMISSIONS`.

---

## 11. Formato y lint

El formato lo fija Prettier (`.prettierrc.json`) y no se discute en revisión. `pnpm format` lo aplica.
`pnpm lint` ejecuta ESLint (`eslint.config.js`) y comprueba el formato. `pnpm lint:fix` corrige lo que se puede corregir solo.

Qué comprueba ESLint:

| Regla | Origen |
|---|---|
| Sin `any` (`@typescript-eslint/no-explicit-any`) | R13 |
| Sin números mágicos, salvo `-1`, `0` y `1` (`@typescript-eslint/no-magic-numbers`) | R13 |
| Convención de nombres de la sección 2 (`@typescript-eslint/naming-convention`) | R13 |
| Sin código comentado (regla local `local/no-commented-out-code`, en `eslint-rules/`) | R13 |
| Reglas de `eslint-plugin-security` como error | R8 |
| Sin `$queryRawUnsafe` ni `$executeRawUnsafe` | R8 |
| En tests: sin `.skip`, `.only`, `.todo` ni tests comentados, y sin comentarios `eslint-disable` | R2 |

La regla de código comentado da por código un comentario que se puede analizar como TypeScript y contiene algo más que palabras sueltas. Si alguna vez marca prosa, reescribe la frase; no la desactives.

**Violaciones heredadas.** Las que ya existían el 2026-11-16 están congeladas en `eslint-suppressions.json` (supresiones masivas de ESLint):
- ESLint falla si un archivo supera el número congelado de una regla. El código nuevo no puede añadir violaciones.
- Al corregir una, ejecuta `pnpm exec eslint . --prune-suppressions` y sube el archivo actualizado. El archivo solo puede encoger.
- Prohibido ejecutar `--suppress-all` o `--suppress-rule` para que pase un PR (equivale a debilitar un test, R2). Lo vigila `CODEOWNERS`.
- Se vacía en F1-T15 y F1-T18.

En `src/` un `// eslint-disable-next-line <regla> -- motivo` solo se admite con motivo y para un falso positivo demostrable (por ejemplo, `security/detect-object-injection` sobre una clave validada por lista blanca). En `tests/` no se admite ninguno.

---

## 12. Git (R9, R11, R15)

- Rama por tarea, en inglés: `feat/F<fase>-T<nn>-descripcion-corta`.
- Commits en español, pequeños, con prefijo de tipo (`feat/`, `fix/`, `doc/`, `test/`, `chore/`, `refactor/`) y un cuerpo que diga **por qué** y **para qué**:
  ```
  fix/ el login rechaza usuarios desactivados

  Por qué: H3, un usuario desactivado seguía pudiendo iniciar sesión.
  Para qué: que desactivar a un usuario le quite el acceso de inmediato.
  ```
- Hooks de git (`lefthook.yml`, se instalan con `pnpm install`): el **pre-commit** pasa ESLint y Prettier sobre los archivos preparados; el **pre-push** ejecuta `pnpm typecheck`, `pnpm arch:check` y `pnpm test:unit`.
- Nunca `--no-verify` (R2). Si un hook falla, se corrige la causa.
