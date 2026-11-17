import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DisabledBreachedPasswordChecker,
  PWNED_PASSWORDS_BASE_URL,
  PwnedPasswordsChecker,
} from '@/infrastructure/services/PwnedPasswordsChecker.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';

// F2-T03 (D-11): contraseñas filtradas por rango (k-anonimato) contra un servidor local que imita a HIBP.

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HASH_PREFIX_LENGTH = 5;
const BREACHED_PASSWORD = 'password1234';
const SAFE_PASSWORD = 'Correct-Horse-Battery-9';
const UNREACHABLE_BASE_URL = 'http://127.0.0.1:1';

function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex').toUpperCase();
}

describe('PwnedPasswordsChecker', () => {
  const receivedPaths: string[] = [];
  const receivedPaddingHeaders: Array<string | undefined> = [];
  let respondWithStatus = HTTP_OK;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const fakePwnedPasswords = express();
    fakePwnedPasswords.get('/range/:prefix', (request, response) => {
      receivedPaths.push(request.path);
      receivedPaddingHeaders.push(request.get('add-padding'));
      const breachedSuffix = sha1(BREACHED_PASSWORD).slice(HASH_PREFIX_LENGTH);
      const paddingSuffix = sha1(SAFE_PASSWORD).slice(HASH_PREFIX_LENGTH);
      response
        .status(respondWithStatus)
        .type('text/plain')
        .send(`0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${breachedSuffix}:42\r\n${paddingSuffix}:0`);
    });
    await new Promise<void>((resolve) => {
      server = fakePwnedPasswords.listen(0, '127.0.0.1', () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    receivedPaths.length = 0;
    receivedPaddingHeaders.length = 0;
    respondWithStatus = HTTP_OK;
  });

  it('detecta una contraseña que aparece en el rango', async () => {
    await expect(
      new PwnedPasswordsChecker(new RecordingLogger(), { baseUrl }).isBreached(BREACHED_PASSWORD),
    ).resolves.toBe(true);
  });

  it('una línea de relleno (0 veces) no cuenta como filtrada', async () => {
    await expect(new PwnedPasswordsChecker(new RecordingLogger(), { baseUrl }).isBreached(SAFE_PASSWORD)).resolves.toBe(
      false,
    );
  });

  it('solo envía los 5 primeros caracteres del SHA-1 y pide relleno', async () => {
    await new PwnedPasswordsChecker(new RecordingLogger(), { baseUrl }).isBreached(BREACHED_PASSWORD);

    expect(receivedPaths).toEqual([`/range/${sha1(BREACHED_PASSWORD).slice(0, HASH_PREFIX_LENGTH)}`]);
    expect(receivedPaddingHeaders).toEqual(['true']);
  });

  it('si el servicio falla acepta la contraseña y deja un aviso técnico sin la contraseña (Q-013)', async () => {
    respondWithStatus = HTTP_SERVICE_UNAVAILABLE;
    const logger = new RecordingLogger();

    await expect(new PwnedPasswordsChecker(logger, { baseUrl }).isBreached(BREACHED_PASSWORD)).resolves.toBe(false);
    expect(logger.entries.map((entry) => entry.level)).toEqual(['warn']);
    expect(JSON.stringify(logger.entries)).not.toContain(BREACHED_PASSWORD);
  });

  it('si el servicio no responde acepta la contraseña', async () => {
    const checker = new PwnedPasswordsChecker(new RecordingLogger(), { baseUrl: UNREACHABLE_BASE_URL });

    await expect(checker.isBreached(BREACHED_PASSWORD)).resolves.toBe(false);
  });

  it('por defecto apunta a la URL fija de Have I Been Pwned', () => {
    expect(PWNED_PASSWORDS_BASE_URL).toBe('https://api.pwnedpasswords.com');
  });

  it('con la comprobación desactivada, ninguna contraseña cuenta como filtrada', async () => {
    await expect(new DisabledBreachedPasswordChecker().isBreached()).resolves.toBe(false);
  });
});
