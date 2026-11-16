// Se ejecuta antes de cada archivo de test de todos los proyectos.
// Fija el entorno ANTES de que se importe cualquier módulo de `src/`:
// `src/config/env.ts` carga `.env` con dotenv, que nunca pisa una variable ya definida,
// así los tests no dependen del `.env` local ni usan sus secretos.
//
// Este archivo no puede importar nada de `src/` (los imports se evalúan antes que estas líneas).

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-never-use-outside-tests';
process.env.JWT_EXPIRATION = '1h';
process.env.DOTENV_CONFIG_QUIET = 'true';
