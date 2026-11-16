import { describe, expect, it } from 'vitest';
import { ApplicationError } from '@/domain/errors/ApplicationError.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { UnauthorizedError } from '@/domain/errors/UnauthorizedError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';

describe('jerarquía de errores', () => {
  it.each([
    ['NotFoundError', new NotFoundError(ErrorCode.LEAD_NOT_FOUND, 'Lead not found')],
    ['ForbiddenError', new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions')],
    ['ConflictError', new ConflictError(ErrorCode.EMAIL_ALREADY_IN_USE, 'Email already in use')],
    ['UnauthorizedError', new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, 'Invalid Credentials')],
    ['ValidationError', new ValidationError(ErrorCode.VALIDATION_FAILED, 'Request body is invalid')],
  ])('%s es un ApplicationError con código, mensaje y nombre propios', (expectedName, error) => {
    expect(error).toBeInstanceOf(ApplicationError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(expectedName);
    expect(error.code).toBeTypeOf('string');
    expect(error.message).not.toBe('');
  });

  it('ValidationError sin detalle devuelve una lista vacía', () => {
    expect(new ValidationError(ErrorCode.MISSING_REQUIRED_DATA, 'All information is required').details).toEqual([]);
  });

  it('ValidationError conserva el detalle de los campos inválidos', () => {
    const details = [{ path: ['email'], message: 'Invalid email address' }];

    expect(new ValidationError(ErrorCode.VALIDATION_FAILED, 'Request body is invalid', details).details).toEqual(
      details,
    );
  });

  it('cada código de error es igual a su nombre, para que el contrato con el frontend no cambie por accidente', () => {
    for (const [codeName, codeValue] of Object.entries(ErrorCode)) {
      expect(codeValue).toBe(codeName);
    }
  });
});
