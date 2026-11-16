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
const DEFAULT_JWT_EXPIRATION = '7d';
const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\//;
// jsonwebtoken interpreta la duración con la librería `ms`. Se exige número + unidad porque un número
// sin unidad lo lee como milisegundos ("3600" caducaría en 3,6 segundos) y un texto que `ms` no entiende
// solo fallaría al firmar el primer token, no al arrancar.
const JWT_EXPIRATION_PATTERN = /^\d+(ms|s|m|h|d|w|y)$/;

const MISSING_VARIABLE_MESSAGE = 'is required';

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

const environmentSchema = z.object({
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
    requiredText()
      .regex(JWT_EXPIRATION_PATTERN, { error: 'must be a number followed by a unit (ms, s, m, h, d, w, y), e.g. 15m' })
      .default(DEFAULT_JWT_EXPIRATION),
  ),
});

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
