// Redacción de datos sensibles antes de escribir un log (F1-T07, H13).
// Se aplica a todo el contexto, aunque alguien pase por error un cuerpo de petición o un usuario completo.

export const REDACTED_VALUE = '[REDACTED]';

const MAXIMUM_DEPTH = 6;

// Comparación por subcadena en minúsculas: cubre `password`, `passwordHash`, `newPassword`,
// `accessToken`, `refreshToken`, `x-api-key`, `DATABASE_URL`, `jwtSecret`…
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'cookie',
  'authorization',
  'apikey',
  'api-key',
  'database_url',
  'databaseurl',
  'connectionstring',
];

// Una URL de conexión con usuario y contraseña (postgresql://user:pass@host) se redacta aunque no esté
// bajo una clave sensible, por ejemplo dentro del mensaje de un error de conexión.
const CREDENTIALS_IN_URL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi;

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment));
}

function redactString(value: string): string {
  return value.replace(CREDENTIALS_IN_URL_PATTERN, `$1${REDACTED_VALUE}@`);
}

/** Copia de `value` con los valores de claves sensibles sustituidos por `[REDACTED]`. No modifica el original. */
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAXIMUM_DEPTH) return '[TRUNCATED]';
  if (value instanceof Date) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) return value.map((item) => redactSensitiveData(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? REDACTED_VALUE : redactSensitiveData(nestedValue, depth + 1),
    ]),
  );
}
