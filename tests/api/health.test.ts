import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '@/app.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;

describe('GET /health', () => {
  it('responde 200 con estado ok y la hora del servidor, sin exigir sesión', async () => {
    const response = await request(app).get(apiPaths.health);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });
});
