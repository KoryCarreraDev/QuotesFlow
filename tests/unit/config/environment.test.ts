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

const validVariables = {
  NODE_ENV: 'production',
  PORT: String(CUSTOM_PORT),
  DATABASE_URL: 'postgresql://quotesflow:password@db.internal:5432/quotesflow?schema=public',
  JWT_SECRET: VALID_JWT_SECRET,
  JWT_EXPIRATION: '15m',
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

  it('informa de todas las variables inválidas a la vez', () => {
    const invalidVariables = invalidVariablesOf({ JWT_SECRET: undefined, DATABASE_URL: undefined, NODE_ENV: 'qa' });

    expect(invalidVariables.sort()).toEqual(['DATABASE_URL', 'JWT_SECRET', 'NODE_ENV']);
  });
});
