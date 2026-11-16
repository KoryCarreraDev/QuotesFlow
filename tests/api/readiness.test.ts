import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F1-T08: /health dice si el proceso vive; /ready, si puede atender peticiones (base de datos accesible).
// El orquestador saca la instancia del balanceo cuando /ready falla, sin reiniciarla.

const HTTP_OK = 200;
const HTTP_SERVICE_UNAVAILABLE = 503;

describe('GET /ready', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('responde 200 cuando la base de datos responde, sin exigir sesión', async () => {
    const response = await request(app).get(apiPaths.ready);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('responde 503 SERVICE_UNAVAILABLE si la base de datos no responde, sin detalles internos', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await request(app).get(apiPaths.ready);

    expect(response.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(response.body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(response.text).not.toContain('ECONNREFUSED');
  });

  it('/health sigue respondiendo 200 aunque la base de datos no responda: el proceso está vivo', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('database down'));

    const response = await request(app).get(apiPaths.health);

    expect(response.status).toBe(HTTP_OK);
  });
});
