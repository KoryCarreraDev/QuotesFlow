import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// HS256 firma con HMAC-SHA256: un secreto de menos de 256 bits (32 bytes) debilita la firma (RFC 7518, 3.2).
const MINIMUM_JWT_SECRET_LENGTH = 32;
const DEFAULT_PORT = 4000;
const HIGHEST_TCP_PORT = 65_535;
// D-09 (F2-T02): token de acceso corto; la sesión se mantiene con el refresh token rotatorio.
const DEFAULT_JWT_EXPIRATION = '15m';
// Vida absoluta de una sesión: pasado este plazo hay que volver a iniciar sesión.
const DEFAULT_REFRESH_TOKEN_EXPIRATION = '7d';
const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;
// jsonwebtoken interpreta la duración con la librería `ms`. Se exige número + unidad porque un número
// sin unidad lo lee como milisegundos ("3600" caducaría en 3,6 segundos) y un texto que `ms` no entiende
// solo fallaría al firmar el primer token, no al arrancar.
const JWT_EXPIRATION_PATTERN = /^\d+(ms|s|m|h|d|w|y)$/;

const MISSING_VARIABLE_MESSAGE = 'is required';
const DURATION_FORMAT_MESSAGE = 'must be a number followed by a unit (ms, s, m, h, d, w, y), e.g. 15m';

const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
// Igual que la librería `ms` que usa jsonwebtoken: un año de 365,25 días.
const DAYS_PER_YEAR = 365.25;
const MILLISECONDS_PER_MINUTE = MILLISECONDS_PER_SECOND * SECONDS_PER_MINUTE;
const MILLISECONDS_PER_HOUR = MILLISECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const MILLISECONDS_PER_DAY = MILLISECONDS_PER_HOUR * HOURS_PER_DAY;

const MILLISECONDS_PER_UNIT: ReadonlyMap<string, number> = new Map([
  ['ms', 1],
  ['s', MILLISECONDS_PER_SECOND],
  ['m', MILLISECONDS_PER_MINUTE],
  ['h', MILLISECONDS_PER_HOUR],
  ['d', MILLISECONDS_PER_DAY],
  ['w', MILLISECONDS_PER_DAY * DAYS_PER_WEEK],
  ['y', MILLISECONDS_PER_DAY * DAYS_PER_YEAR],
]);
const DURATION_PARTS_PATTERN = /^(\d+)(ms|s|m|h|d|w|y)$/;

/**
 * Convierte una duración ya validada (`15m`, `7d`) a milisegundos. Sirve para que la caducidad de las
 * cookies coincida con la de los tokens (H23).
 *
 * @throws {Error} Si el texto no es una duración válida.
 */
export function durationToMilliseconds(duration: string): number {
  const parts = DURATION_PARTS_PATTERN.exec(duration);
  const unitMilliseconds = parts ? MILLISECONDS_PER_UNIT.get(parts[2]) : undefined;
  if (!parts || unitMilliseconds === undefined) throw new Error(`Invalid duration: ${duration}`);
  return Number(parts[1]) * unitMilliseconds;
}

// Un origen es esquema + host (+ puerto), sin ruta ni barra final: así lo envía el navegador en `Origin`.
const ORIGIN_PATTERN = /^https?:\/\/[^/\s]+$/;
const ORIGIN_LIST_SEPARATOR = ',';
const DEFAULT_TRUSTED_PROXY_HOPS = 0;
const DEFAULT_GLOBAL_RATE_LIMIT = 100;
// Cupo de login y registro por IP y ventana: frena la prueba masiva de contraseñas (H6). El bloqueo por
// cuenta llega en F2-T03.
const DEFAULT_AUTH_RATE_LIMIT = 10;

// F2-T01: `resend` envía de verdad; `log` (desarrollo) escribe el correo en el log; `memory` (tests) lo guarda
// en memoria. En producción solo vale `resend`: con otro, los correos de verificación no saldrían.
const EMAIL_PROVIDERS = ['resend', 'log', 'memory'] as const;
const DEFAULT_EMAIL_PROVIDER = 'log';
const DEFAULT_EMAIL_FROM = 'QuotesFlow <no-reply@localhost>';
// Las claves de Resend empiezan por `re_`; cualquier otra cosa es un error de configuración.
const RESEND_API_KEY_PATTERN = /^re_\w+$/;
// Remitente `Nombre <correo>` o solo el correo, como lo acepta Resend.
const EMAIL_FROM_PATTERN = /^([^<>]+<[^<>\s]+@[^<>\s]+>|[^<>\s]+@[^<>\s]+)$/;
// URL del frontend para los enlaces de los correos (verificar, recuperar, invitación). Sin barra final.
const DEFAULT_APP_BASE_URL = 'http://localhost:5173';
const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const TRAILING_SLASH = '/';
const SECURE_URL_PREFIX = 'https://';
// D-11 (F2-T03): `hibp` consulta Have I Been Pwned; `off` no consulta nada (tests, entornos sin internet).
const PASSWORD_BREACH_CHECKS = ['hibp', 'off'] as const;
// F3-T07 (Q-017): carpeta donde `LocalDiskFileStorage` guarda los logos mientras dure el desarrollo. Relativa a donde
// se arranca el proceso. En producción la reemplazará un almacenamiento de objetos compatible con S3.
const DEFAULT_FILE_STORAGE_DIRECTORY = 'storage';

function splitOriginList(value: unknown): unknown {
  if (value === undefined) return [];
  if (typeof value !== 'string') return value;
  return value
    .split(ORIGIN_LIST_SEPARATOR)
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
}

function nonNegativeInteger(defaultValue: number) {
  return z.preprocess(
    treatEmptyAsMissing,
    z.coerce
      .number({ error: 'must be a whole number' })
      .int({ error: 'must be a whole number' })
      .min(0, { error: 'must be a whole number' })
      .default(defaultValue),
  );
}

function positiveInteger(defaultValue: number) {
  return z.preprocess(
    treatEmptyAsMissing,
    z.coerce
      .number({ error: 'must be a positive whole number' })
      .int({ error: 'must be a positive whole number' })
      .min(1, { error: 'must be a positive whole number' })
      .default(defaultValue),
  );
}

/** URL http(s) sin barra final, query ni fragmento: se le concatenan rutas como `/verify-email?token=…`. */
function isBaseUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return WEB_PROTOCOLS.has(url.protocol) && !value.endsWith(TRAILING_SLASH) && url.search === '' && url.hash === '';
}

/** Una variable definida pero vacía (`JWT_SECRET=`) cuenta como ausente. */
function treatEmptyAsMissing(value: unknown): unknown {
  return value === '' ? undefined : value;
}

/**
 * Texto obligatorio. El mensaje de error nunca incluye el valor recibido: puede ser un secreto
 * o una URL con contraseña, y este error se escribe en los registros del arranque.
 */
function requiredText() {
  return z.string({
    error: (issue) => (issue.input === undefined ? MISSING_VARIABLE_MESSAGE : 'must be text'),
  });
}

const baseEnvironmentSchema = z.object({
  // Obligatoria: sin ella la API se comportaría como en desarrollo (cookie sin `secure`, consultas en el log).
  NODE_ENV: z.preprocess(
    treatEmptyAsMissing,
    z.enum(['development', 'test', 'production'], {
      error: (issue) =>
        issue.input === undefined ? MISSING_VARIABLE_MESSAGE : 'must be one of: development, test, production',
    }),
  ),
  PORT: z.preprocess(
    treatEmptyAsMissing,
    z.coerce
      .number({ error: 'must be an integer' })
      .int({ error: 'must be an integer' })
      .min(1, { error: `must be between 1 and ${HIGHEST_TCP_PORT}` })
      .max(HIGHEST_TCP_PORT, { error: `must be between 1 and ${HIGHEST_TCP_PORT}` })
      .default(DEFAULT_PORT),
  ),
  DATABASE_URL: z.preprocess(
    treatEmptyAsMissing,
    requiredText().regex(POSTGRES_URL_PATTERN, { error: 'must be a PostgreSQL connection URL' }),
  ),
  // Sin valor por defecto (H1): con un secreto conocido cualquiera podría firmar tokens de cualquier tenant.
  JWT_SECRET: z.preprocess(
    treatEmptyAsMissing,
    requiredText().min(MINIMUM_JWT_SECRET_LENGTH, {
      error: `must have at least ${MINIMUM_JWT_SECRET_LENGTH} characters`,
    }),
  ),
  JWT_EXPIRATION: z.preprocess(
    treatEmptyAsMissing,
    requiredText().regex(JWT_EXPIRATION_PATTERN, { error: DURATION_FORMAT_MESSAGE }).default(DEFAULT_JWT_EXPIRATION),
  ),
  REFRESH_TOKEN_EXPIRATION: z.preprocess(
    treatEmptyAsMissing,
    requiredText()
      .regex(JWT_EXPIRATION_PATTERN, { error: DURATION_FORMAT_MESSAGE })
      .default(DEFAULT_REFRESH_TOKEN_EXPIRATION),
  ),
  // Lista blanca de CORS (H4). Vacía: ningún navegador de otro origen puede llamar a la API.
  // Nunca `*`: la API usa cookie de sesión y CORS con credenciales exige orígenes exactos.
  CORS_ALLOWED_ORIGINS: z.preprocess(
    (value) => splitOriginList(treatEmptyAsMissing(value)),
    z.array(
      z.string().regex(ORIGIN_PATTERN, {
        error: 'must be a comma-separated list of exact origins, e.g. https://app.example.com',
      }),
    ),
  ),
  // Proxies (balanceador, CDN) entre el cliente y la API. Con 0, X-Forwarded-For se ignora y nadie puede
  // falsificar su IP para esquivar los límites de tasa; detrás de un proxy hay que fijarlo o todos los
  // clientes compartirían la IP del proxy (H6).
  TRUST_PROXY: nonNegativeInteger(DEFAULT_TRUSTED_PROXY_HOPS),
  RATE_LIMIT_GLOBAL_MAX_REQUESTS: positiveInteger(DEFAULT_GLOBAL_RATE_LIMIT),
  RATE_LIMIT_AUTH_MAX_REQUESTS: positiveInteger(DEFAULT_AUTH_RATE_LIMIT),
  // `silent` solo tiene sentido en los tests: en producción un error sin registrar no se puede investigar.
  LOG_LEVEL: z.preprocess(
    treatEmptyAsMissing,
    z
      .enum(['debug', 'info', 'warn', 'error', 'silent'], {
        error: 'must be one of: debug, info, warn, error, silent',
      })
      .default('info'),
  ),
  EMAIL_PROVIDER: z.preprocess(
    treatEmptyAsMissing,
    z.enum(EMAIL_PROVIDERS, { error: 'must be one of: resend, log, memory' }).default(DEFAULT_EMAIL_PROVIDER),
  ),
  // Secreto: sin valor por defecto. Obligatorio con EMAIL_PROVIDER=resend (comprobado abajo).
  RESEND_API_KEY: z.preprocess(
    treatEmptyAsMissing,
    z.string().regex(RESEND_API_KEY_PATTERN, { error: 'must be a Resend API key (re_...)' }).optional(),
  ),
  EMAIL_FROM: z.preprocess(
    treatEmptyAsMissing,
    z
      .string()
      .regex(EMAIL_FROM_PATTERN, { error: 'must be an address, e.g. QuotesFlow <no-reply@example.com>' })
      .optional(),
  ),
  PASSWORD_BREACH_CHECK: z.preprocess(
    treatEmptyAsMissing,
    z.enum(PASSWORD_BREACH_CHECKS, { error: 'must be one of: hibp, off' }).default('hibp'),
  ),
  FILE_STORAGE_DIRECTORY: z.preprocess(treatEmptyAsMissing, z.string().min(1).default(DEFAULT_FILE_STORAGE_DIRECTORY)),
  APP_BASE_URL: z.preprocess(
    treatEmptyAsMissing,
    z
      .string()
      .refine(isBaseUrl, { error: 'must be an http(s) URL without trailing slash' })
      .default(DEFAULT_APP_BASE_URL),
  ),
});

type ParsedVariables = z.output<typeof baseEnvironmentSchema>;

/** Reglas que dependen de varias variables a la vez. */
function checkCrossVariableRules(variables: ParsedVariables, context: z.RefinementCtx): void {
  const isProduction = variables.NODE_ENV === 'production';
  if (isProduction && variables.EMAIL_PROVIDER !== 'resend') {
    context.addIssue({ code: 'custom', path: ['EMAIL_PROVIDER'], message: 'must be resend in production' });
  }
  if (variables.EMAIL_PROVIDER === 'resend' && variables.RESEND_API_KEY === undefined) {
    context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'is required with EMAIL_PROVIDER=resend' });
  }
  if (variables.EMAIL_PROVIDER === 'resend' && variables.EMAIL_FROM === undefined) {
    context.addIssue({ code: 'custom', path: ['EMAIL_FROM'], message: 'is required with EMAIL_PROVIDER=resend' });
  }
  // Los enlaces de los correos llevan tokens: en producción nunca viajan sin cifrar.
  if (isProduction && !variables.APP_BASE_URL.startsWith(SECURE_URL_PREFIX)) {
    context.addIssue({ code: 'custom', path: ['APP_BASE_URL'], message: 'must use https in production' });
  }
}

const environmentSchema = baseEnvironmentSchema
  .superRefine(checkCrossVariableRules)
  .transform((variables) => ({ ...variables, EMAIL_FROM: variables.EMAIL_FROM ?? DEFAULT_EMAIL_FROM }));

/** Configuración del proceso ya validada. */
export type Environment = z.output<typeof environmentSchema>;

/** La configuración de entorno no permite arrancar. Lista las variables inválidas, nunca sus valores. */
export class InvalidEnvironmentError extends Error {
  constructor(
    readonly invalidVariables: string[],
    problems: string[],
  ) {
    super(`Invalid environment configuration:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/**
 * Valida las variables de entorno y devuelve la configuración tipada.
 *
 * @param variables Variables del proceso (normalmente `process.env`).
 * @throws {InvalidEnvironmentError} Si falta una variable obligatoria o alguna tiene un formato inválido.
 */
export function parseEnvironment(variables: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(variables);
  if (result.success) return result.data;

  const invalidVariables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  const problems = result.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`);
  throw new InvalidEnvironmentError(invalidVariables, problems);
}

// Se valida al importar: la API no llega a arrancar con una configuración insegura o incompleta.
export const env: Environment = parseEnvironment(process.env);
