// Se ejecuta antes de cada archivo de test de todos los proyectos.
// Fija el entorno ANTES de que se importe cualquier módulo de `src/`:
// `src/config/env.ts` carga `.env` con dotenv, que nunca pisa una variable ya definida,
// así los tests no dependen del `.env` local ni usan sus secretos.
//
// Este archivo no puede importar nada de `src/` (los imports se evalúan antes que estas líneas).
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-never-use-outside-tests';
process.env.JWT_EXPIRATION = '1h';
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.quotesflow.test';
// El cupo real de autenticación (10) no deja ejecutar los tests de login y registro de un mismo archivo.
// Sigue por debajo del global (100), y el limitador se prueba aparte con cupos pequeños.
process.env.RATE_LIMIT_AUTH_MAX_REQUESTS = '50';
// F3-A15: el cupo de documentos (PDF y envío) por defecto es 20; así ninguna suite de rutas lo agota por accidente y
// la suite de `documentRateLimit.test.ts` lo agota con pocas peticiones.
process.env.RATE_LIMIT_DOCUMENT_MAX_REQUESTS = '30';
// Sin ruido en la salida de los tests; los logs se prueban con transportes en memoria.
process.env.LOG_LEVEL = 'silent';
// Los correos se guardan en memoria (`memoryEmailOutbox`): ningún test envía correos de verdad.
process.env.EMAIL_PROVIDER = 'memory';
// Ningún test consulta Have I Been Pwned; el adaptador se prueba contra un servidor local.
process.env.PASSWORD_BREACH_CHECK = 'off';
// Los logos de los tests van a una carpeta temporal propia de cada proceso, nunca a `./storage`.
process.env.FILE_STORAGE_DIRECTORY = path.join(os.tmpdir(), `quotesflow-test-storage-${process.pid}`);
