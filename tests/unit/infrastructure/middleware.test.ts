import { AuthenticateSessionUseCase } from '@/application/use-case/auth/AuthenticateSessionUseCase.js';
import { SessionRevocationReason, UserSession } from '@/domain/entities/UserSession.js';
import { InMemorySessionRepository } from '@tests/support/doubles/InMemorySessionRepository.js';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
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
    const [responseBody] = response.json.mock.calls[0] as [{ error: { details: Array<{ path: string[] }> } }];
    expect(responseBody.error.details.map((issue) => issue.path[0]).sort()).toEqual(['name', 'quantity']);
    expect(next).not.toHaveBeenCalled();
  });

  it('responde con el formato único de error: código VALIDATION_FAILED y detalle por campo', () => {
    const response = createResponseDouble();

    validateBody(schema)(asRequest({ body: { name: 'Vidrio templado' } }), asResponse(response), vi.fn());

    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request body is invalid',
        details: [{ path: ['quantity'], message: expect.any(String) }],
      },
    });
  });

  // Regresión de H24: `catch (error: any)` respondía 400 con `{ errors: undefined }` a cualquier error.
  it('un error que no es de validación pasa al manejador de errores en lugar de responder 400', () => {
    const unexpectedError = new Error('schema exploded');
    const explodingSchema = z.object({}).transform(() => {
      throw unexpectedError;
    });
    const response = createResponseDouble();
    const next = vi.fn();

    validateBody(explodingSchema)(asRequest({ body: {} }), asResponse(response), next);

    expect(next).toHaveBeenCalledWith(unexpectedError);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('responde 400 si la petición no trae cuerpo', () => {
    const response = createResponseDouble();
    const next = vi.fn();

    validateBody(schema)(asRequest({ body: undefined }), asResponse(response), next);

    expect(response.status).toHaveBeenCalledWith(HTTP_BAD_REQUEST);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('createAuthValidateCookie (F2-T02)', () => {
  const claims = {
    sub: '22222222-2222-4222-8222-222222222222',
    tenantId: '11111111-1111-4111-8111-111111111111',
    sid: '33333333-3333-4333-8333-333333333333',
  };
  const ONE_DAY_MS = 86_400_000;

  function setupAuthentication() {
    const tokenService = new FakeAuthTokenService();
    const sessionRepository = new InMemorySessionRepository();
    sessionRepository.seed(
      new UserSession(claims.sid, claims.tenantId, claims.sub, 'refresh-hash', new Date(Date.now() + ONE_DAY_MS)),
    );
    sessionRepository.setUserState(claims.sub, { role: Role.SALES_LEADER, isActive: true });
    const middleware = createAuthValidateCookie(new AuthenticateSessionUseCase(tokenService, sessionRepository));
    return { tokenService, sessionRepository, middleware };
  }

  it('con una sesión abierta identifica al usuario, su tenant, su sesión y su rol actual de la base', async () => {
    const { tokenService, middleware } = setupAuthentication();
    const request = asRequest({ cookies: { accessToken: tokenService.generateToken(claims) } });
    const next = vi.fn();

    await middleware(request, asResponse(createResponseDouble()), next);

    expect(request.user).toEqual({
      userId: claims.sub,
      tenantId: claims.tenantId,
      role: Role.SALES_LEADER,
      sessionId: claims.sid,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('sin cookie de sesión responde 401 y no continúa', async () => {
    const { middleware } = setupAuthentication();
    const request = asRequest({ cookies: {} });
    const response = createResponseDouble();
    const next = vi.fn();

    await middleware(request, asResponse(response), next);

    expect(response.status).toHaveBeenCalledWith(HTTP_UNAUTHORIZED);
    expect(next).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it('con un token inválido no identifica a nadie y entrega INVALID_SESSION al manejador de errores', async () => {
    const { middleware } = setupAuthentication();
    const request = asRequest({ cookies: { accessToken: 'forged-token' } });
    const next = vi.fn();

    await middleware(request, asResponse(createResponseDouble()), next);

    expect(request.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ code: ErrorCode.INVALID_SESSION });
  });

  it('con un token caducado entrega SESSION_EXPIRED: el frontend sabe que debe renovar', async () => {
    const { tokenService, middleware } = setupAuthentication();
    const request = asRequest({ cookies: { accessToken: tokenService.expiredToken() } });
    const next = vi.fn();

    await middleware(request, asResponse(createResponseDouble()), next);

    expect(next.mock.calls[0][0]).toMatchObject({ code: ErrorCode.SESSION_EXPIRED });
  });

  it('con la sesión revocada, el token aún vigente deja de valer (logout, H2)', async () => {
    const { tokenService, sessionRepository, middleware } = setupAuthentication();
    await sessionRepository.revoke(claims.sid, SessionRevocationReason.LOGOUT);
    const request = asRequest({ cookies: { accessToken: tokenService.generateToken(claims) } });
    const next = vi.fn();

    await middleware(request, asResponse(createResponseDouble()), next);

    expect(request.user).toBeUndefined();
    expect(next.mock.calls[0][0]).toMatchObject({ code: ErrorCode.INVALID_SESSION });
  });

  it('con el usuario desactivado, el token aún vigente deja de valer (H2)', async () => {
    const { tokenService, sessionRepository, middleware } = setupAuthentication();
    sessionRepository.setUserState(claims.sub, { role: Role.SALES_LEADER, isActive: false });
    const request = asRequest({ cookies: { accessToken: tokenService.generateToken(claims) } });
    const next = vi.fn();

    await middleware(request, asResponse(createResponseDouble()), next);

    expect(next.mock.calls[0][0]).toMatchObject({ code: ErrorCode.INVALID_SESSION });
  });
});
