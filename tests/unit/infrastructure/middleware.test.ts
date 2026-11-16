import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Role } from '@/domain/enums/Role.js';
import { createAuthValidateCookie } from '@/infrastructure/web/middleware/createAuthValidateCookie.js';
import { validateBody } from '@/infrastructure/web/middleware/validateBody.js';
import { FakeAuthTokenService } from '@tests/support/doubles/FakeAuthTokenService.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

function createResponseDouble() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
}

function asRequest(request: Partial<Request>): Request {
  return request as Request;
}

function asResponse(response: ReturnType<typeof createResponseDouble>): Response {
  return response as unknown as Response;
}

describe('validateBody', () => {
  const schema = z.object({ name: z.string().min(1), quantity: z.number() });

  it('deja pasar un cuerpo válido', () => {
    const request = asRequest({ body: { name: 'Vidrio templado', quantity: 2 } });
    const response = createResponseDouble();
    const next = vi.fn();

    validateBody(schema)(request, asResponse(response), next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('descarta los campos que el esquema no declara, para que no lleguen al caso de uso', () => {
    const request = asRequest({
      body: { name: 'Vidrio templado', quantity: 2, tenantId: 'another-tenant', deleted: 'DELETED' },
    });

    validateBody(schema)(request, asResponse(createResponseDouble()), vi.fn());

    expect(request.body).toEqual({ name: 'Vidrio templado', quantity: 2 });
  });

  it('responde 400 con el detalle de los errores y no continúa si el cuerpo es inválido', () => {
    const request = asRequest({ body: { name: '', quantity: 'two' } });
    const response = createResponseDouble();
    const next = vi.fn();

    validateBody(schema)(request, asResponse(response), next);

    expect(response.status).toHaveBeenCalledWith(HTTP_BAD_REQUEST);
    const [responseBody] = response.json.mock.calls[0] as [{ errors: Array<{ path: string[] }> }];
    expect(responseBody.errors.map((issue) => issue.path[0]).sort()).toEqual(['name', 'quantity']);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde 400 si la petición no trae cuerpo', () => {
    const response = createResponseDouble();
    const next = vi.fn();

    validateBody(schema)(asRequest({ body: undefined }), asResponse(response), next);

    expect(response.status).toHaveBeenCalledWith(HTTP_BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('createAuthValidateCookie', () => {
  const sessionPayload = {
    sub: '22222222-2222-4222-8222-222222222222',
    tenantId: '11111111-1111-4111-8111-111111111111',
    role: Role.SALES_REP,
  };

  it('con una cookie de sesión válida identifica al usuario, su tenant y su rol', () => {
    const tokenService = new FakeAuthTokenService();
    const request = asRequest({ cookies: { accessToken: tokenService.generateToken(sessionPayload) } });
    const next = vi.fn();

    createAuthValidateCookie(tokenService)(request, asResponse(createResponseDouble()), next);

    expect(request.user).toEqual({
      userId: sessionPayload.sub,
      tenantId: sessionPayload.tenantId,
      role: Role.SALES_REP,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('sin cookie de sesión responde 401 y no continúa', () => {
    const request = asRequest({ cookies: {} });
    const response = createResponseDouble();
    const next = vi.fn();

    createAuthValidateCookie(new FakeAuthTokenService())(request, asResponse(response), next);

    expect(response.status).toHaveBeenCalledWith(HTTP_UNAUTHORIZED);
    expect(next).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('con un token inválido no identifica a nadie y entrega el error al manejador de errores', () => {
    const request = asRequest({ cookies: { accessToken: 'forged-token' } });
    const next = vi.fn();

    createAuthValidateCookie(new FakeAuthTokenService())(request, asResponse(createResponseDouble()), next);

    expect(request.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
