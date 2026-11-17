import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, parseEnvironment } from '@/config/env.js';

// Regresión de H1: la API arrancaba con `JWT_SECRET = 'default-secret'` si faltaba la variable,
// y cualquiera que conociera ese valor podía firmar tokens válidos de cualquier tenant.

const MINIMUM_JWT_SECRET_LENGTH = 32;
const VALID_JWT_SECRET = 'v'.repeat(MINIMUM_JWT_SECRET_LENGTH);
const TOO_SHORT_JWT_SECRET = 's'.repeat(MINIMUM_JWT_SECRET_LENGTH - 1);
const DEFAULT_PORT = 4000;
const CUSTOM_PORT = 8080;
const PORT_ABOVE_RANGE = '70000';
const DEFAULT_GLOBAL_RATE_LIMIT = 100;
const DEFAULT_AUTH_RATE_LIMIT = 10;
const TWO_PROXY_HOPS = 2;
const CUSTOM_AUTH_RATE_LIMIT = 25;

const validVariables = {
  NODE_ENV: 'production',
  PORT: String(CUSTOM_PORT),
  DATABASE_URL: 'postgresql://quotesflow:password@db.internal:5432/quotesflow?schema=public',
  JWT_SECRET: VALID_JWT_SECRET,
  JWT_EXPIRATION: '15m',
  // F2-T01: en producción los correos solo salen por Resend, con clave, remitente y enlaces https.
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_example_key_for_tests',
  EMAIL_FROM: 'QuotesFlow <no-reply@quotesflow.example>',
  APP_BASE_URL: 'https://app.quotesflow.example',
};

function parseWith(overrides: Record<string, string | undefined>) {
  return () => parseEnvironment({ ...validVariables, ...overrides });
}

function invalidVariablesOf(overrides: Record<string, string | undefined>): string[] {
  try {
    parseWith(overrides)();
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) return error.invalidVariables;
    throw error;
  }
  throw new Error('parseEnvironment accepted an invalid environment');
}

describe('parseEnvironment', () => {
  it('devuelve la configuración tipada cuando todas las variables son válidas', () => {
    const environment = parseEnvironment(validVariables);

    expect(environment).toEqual({
      NODE_ENV: 'production',
      PORT: CUSTOM_PORT,
      DATABASE_URL: validVariables.DATABASE_URL,
      JWT_SECRET: VALID_JWT_SECRET,
      JWT_EXPIRATION: '15m',
      CORS_ALLOWED_ORIGINS: [],
      TRUST_PROXY: 0,
      RATE_LIMIT_GLOBAL_MAX_REQUESTS: DEFAULT_GLOBAL_RATE_LIMIT,
      RATE_LIMIT_AUTH_MAX_REQUESTS: DEFAULT_AUTH_RATE_LIMIT,
      LOG_LEVEL: 'info',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: validVariables.RESEND_API_KEY,
      EMAIL_FROM: validVariables.EMAIL_FROM,
      APP_BASE_URL: validVariables.APP_BASE_URL,
    });
  });

  it('acepta también el esquema postgres:// en DATABASE_URL', () => {
    const environment = parseEnvironment({ ...validVariables, DATABASE_URL: 'postgres://user:pass@localhost/db' });

    expect(environment.DATABASE_URL).toBe('postgres://user:pass@localhost/db');
  });

  describe('JWT_SECRET (H1)', () => {
    it('rechaza arrancar sin JWT_SECRET en lugar de usar un secreto por defecto', () => {
      expect(parseWith({ JWT_SECRET: undefined })).toThrow(InvalidEnvironmentError);
      expect(invalidVariablesOf({ JWT_SECRET: undefined })).toEqual(['JWT_SECRET']);
    });

    it('trata un JWT_SECRET vacío como ausente', () => {
      expect(invalidVariablesOf({ JWT_SECRET: '' })).toEqual(['JWT_SECRET']);
    });

    it('rechaza un JWT_SECRET de menos de 32 caracteres', () => {
      expect(invalidVariablesOf({ JWT_SECRET: TOO_SHORT_JWT_SECRET })).toEqual(['JWT_SECRET']);
    });

    it('el mensaje de error nombra la variable pero nunca incluye su valor', () => {
      expect(parseWith({ JWT_SECRET: TOO_SHORT_JWT_SECRET })).toThrow(/JWT_SECRET/);
      expect(parseWith({ JWT_SECRET: TOO_SHORT_JWT_SECRET })).not.toThrow(TOO_SHORT_JWT_SECRET);
    });
  });

  describe('DATABASE_URL', () => {
    it('es obligatoria', () => {
      expect(invalidVariablesOf({ DATABASE_URL: undefined })).toEqual(['DATABASE_URL']);
    });

    it('rechaza una URL que no es de PostgreSQL', () => {
      expect(invalidVariablesOf({ DATABASE_URL: 'mysql://user:pass@localhost/db' })).toEqual(['DATABASE_URL']);
    });

    it('el mensaje de error no incluye la URL, que lleva la contraseña de la base de datos', () => {
      const urlWithPassword = 'mysql://user:database-password@localhost/db';

      expect(parseWith({ DATABASE_URL: urlWithPassword })).not.toThrow('database-password');
    });
  });

  describe('NODE_ENV', () => {
    it('es obligatoria: sin ella la API no adivina si está en producción', () => {
      expect(invalidVariablesOf({ NODE_ENV: undefined })).toEqual(['NODE_ENV']);
    });

    it('solo acepta development, test o production', () => {
      expect(invalidVariablesOf({ NODE_ENV: 'staging' })).toEqual(['NODE_ENV']);
    });
  });

  describe('PORT', () => {
    it('usa 4000 si no se define', () => {
      expect(parseEnvironment({ ...validVariables, PORT: undefined }).PORT).toBe(DEFAULT_PORT);
    });

    it('rechaza un valor que no es un número entero', () => {
      expect(invalidVariablesOf({ PORT: 'http' })).toEqual(['PORT']);
    });

    it('rechaza un puerto fuera del rango 1-65535', () => {
      expect(invalidVariablesOf({ PORT: PORT_ABOVE_RANGE })).toEqual(['PORT']);
    });
  });

  describe('JWT_EXPIRATION', () => {
    it('usa 7d si no se define', () => {
      expect(parseEnvironment({ ...validVariables, JWT_EXPIRATION: undefined }).JWT_EXPIRATION).toBe('7d');
    });

    it('rechaza un texto que jsonwebtoken no entiende como duración', () => {
      expect(invalidVariablesOf({ JWT_EXPIRATION: 'forever' })).toEqual(['JWT_EXPIRATION']);
    });

    it('rechaza un número sin unidad, que jsonwebtoken leería como milisegundos', () => {
      expect(invalidVariablesOf({ JWT_EXPIRATION: '3600' })).toEqual(['JWT_EXPIRATION']);
    });
  });

  describe('CORS_ALLOWED_ORIGINS (H4)', () => {
    it('sin definir no autoriza ningún origen', () => {
      expect(parseEnvironment(validVariables).CORS_ALLOWED_ORIGINS).toEqual([]);
    });

    it('acepta una lista de orígenes separados por comas, ignorando espacios', () => {
      const environment = parseEnvironment({
        ...validVariables,
        CORS_ALLOWED_ORIGINS: 'https://app.quotesflow.co, http://localhost:5173',
      });

      expect(environment.CORS_ALLOWED_ORIGINS).toEqual(['https://app.quotesflow.co', 'http://localhost:5173']);
    });

    it.each(['*', 'https://app.quotesflow.co/', 'https://app.quotesflow.co/login', 'app.quotesflow.co'])(
      'rechaza %s: solo se admiten orígenes exactos (esquema y host, sin ruta)',
      (invalidOrigin) => {
        expect(invalidVariablesOf({ CORS_ALLOWED_ORIGINS: invalidOrigin })).toEqual(['CORS_ALLOWED_ORIGINS']);
      },
    );
  });

  describe('TRUST_PROXY (H6)', () => {
    it('por defecto no confía en ningún proxy, para que X-Forwarded-For no cambie la IP del cliente', () => {
      expect(parseEnvironment(validVariables).TRUST_PROXY).toBe(0);
    });

    it('acepta el número de proxies de confianza delante de la API', () => {
      expect(parseEnvironment({ ...validVariables, TRUST_PROXY: String(TWO_PROXY_HOPS) }).TRUST_PROXY).toBe(
        TWO_PROXY_HOPS,
      );
    });

    it.each(['true', '-1', '1.5'])('rechaza %s: tiene que ser un número entero de saltos', (invalidValue) => {
      expect(invalidVariablesOf({ TRUST_PROXY: invalidValue })).toEqual(['TRUST_PROXY']);
    });
  });

  describe('límites de tasa (H6)', () => {
    it('por defecto: 100 peticiones globales y 10 de autenticación por ventana', () => {
      const environment = parseEnvironment(validVariables);

      expect(environment.RATE_LIMIT_GLOBAL_MAX_REQUESTS).toBe(DEFAULT_GLOBAL_RATE_LIMIT);
      expect(environment.RATE_LIMIT_AUTH_MAX_REQUESTS).toBe(DEFAULT_AUTH_RATE_LIMIT);
    });

    it('acepta otro valor', () => {
      expect(
        parseEnvironment({ ...validVariables, RATE_LIMIT_AUTH_MAX_REQUESTS: String(CUSTOM_AUTH_RATE_LIMIT) })
          .RATE_LIMIT_AUTH_MAX_REQUESTS,
      ).toBe(CUSTOM_AUTH_RATE_LIMIT);
    });

    it.each(['0', 'unlimited'])('rechaza %s: un límite tiene que ser un entero positivo', (invalidValue) => {
      expect(invalidVariablesOf({ RATE_LIMIT_AUTH_MAX_REQUESTS: invalidValue })).toEqual([
        'RATE_LIMIT_AUTH_MAX_REQUESTS',
      ]);
    });
  });

  describe('LOG_LEVEL', () => {
    it('por defecto es info', () => {
      expect(parseEnvironment(validVariables).LOG_LEVEL).toBe('info');
    });

    it('rechaza un nivel desconocido', () => {
      expect(invalidVariablesOf({ LOG_LEVEL: 'verbose' })).toEqual(['LOG_LEVEL']);
    });
  });

  it('informa de todas las variables inválidas a la vez', () => {
    const invalidVariables = invalidVariablesOf({ JWT_SECRET: undefined, DATABASE_URL: undefined, NODE_ENV: 'qa' });

    expect(invalidVariables.sort()).toEqual(['DATABASE_URL', 'JWT_SECRET', 'NODE_ENV']);
  });

  describe('correo (F2-T01)', () => {
    const developmentVariables = {
      ...validVariables,
      NODE_ENV: 'development',
      EMAIL_PROVIDER: undefined,
      RESEND_API_KEY: undefined,
      EMAIL_FROM: undefined,
      APP_BASE_URL: undefined,
    };

    it('fuera de producción, sin configurar, escribe los correos en el log y enlaza al frontend local', () => {
      const environment = parseEnvironment(developmentVariables);

      expect(environment).toMatchObject({
        EMAIL_PROVIDER: 'log',
        EMAIL_FROM: 'QuotesFlow <no-reply@localhost>',
        APP_BASE_URL: 'http://localhost:5173',
      });
      expect(environment.RESEND_API_KEY).toBeUndefined();
    });

    it.each(['log', 'memory'])('en producción rechaza EMAIL_PROVIDER=%s: los correos no saldrían', (provider) => {
      expect(invalidVariablesOf({ EMAIL_PROVIDER: provider })).toEqual(['EMAIL_PROVIDER']);
    });

    it('con Resend exige la clave de la API, sin valor por defecto', () => {
      expect(invalidVariablesOf({ RESEND_API_KEY: undefined })).toEqual(['RESEND_API_KEY']);
    });

    it('con Resend exige el remitente', () => {
      expect(invalidVariablesOf({ EMAIL_FROM: undefined })).toEqual(['EMAIL_FROM']);
    });

    it('rechaza una clave que no tiene el formato de Resend', () => {
      expect(invalidVariablesOf({ RESEND_API_KEY: 'sk_live_not_resend' })).toEqual(['RESEND_API_KEY']);
    });

    it('rechaza un remitente que no es una dirección', () => {
      expect(invalidVariablesOf({ EMAIL_FROM: 'QuotesFlow' })).toEqual(['EMAIL_FROM']);
    });

    it('en producción exige https en APP_BASE_URL: los enlaces llevan tokens', () => {
      expect(invalidVariablesOf({ APP_BASE_URL: 'http://app.quotesflow.example' })).toEqual(['APP_BASE_URL']);
    });

    it('rechaza una APP_BASE_URL con barra final', () => {
      expect(invalidVariablesOf({ APP_BASE_URL: 'https://app.quotesflow.example/' })).toEqual(['APP_BASE_URL']);
    });

    it('el mensaje de error nunca incluye la clave recibida', () => {
      const leakedKey = 'not-a-resend-key-but-secret';

      expect(parseWith({ RESEND_API_KEY: leakedKey })).toThrow(InvalidEnvironmentError);
      expect(parseWith({ RESEND_API_KEY: leakedKey })).not.toThrow(leakedKey);
    });
  });
});
