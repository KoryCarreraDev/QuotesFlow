import { Prisma } from '@prisma/client';

// Código de Prisma para una restricción única violada.
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** Indica si el error de Prisma es una restricción única violada (correo, documento...). */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
}
