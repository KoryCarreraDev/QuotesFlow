import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { Action, type Actor, can, scopeFor } from '../../policies/authorizationPolicy.js';
import { DocumentType } from '../../../domain/enums/DocumentType.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';
import { normalizeDocumentNumber } from '../../../domain/value-objects/documentNumber.js';

// Reglas comunes de los clientes (contactos y empresas cliente), F1-T17: responsable (D-18) y documento (D-19).

async function ensureAssignableOwner(ownerId: string, userRepository: IUserRepository): Promise<void> {
  const owner = await userRepository.findById(ownerId);
  if (!owner?.isActive) {
    throw new ValidationError(ErrorCode.OWNER_NOT_FOUND, 'Owner must be an active user of the company');
  }
}

/**
 * Responsable de un cliente nuevo. Gestión puede elegirlo (por defecto, quien lo crea); un comercial
 * siempre queda como responsable y el `ownerId` que envíe se ignora, igual que en los leads.
 */
export async function resolveOwnerForNewClient(
  actor: Actor,
  requestedOwnerId: string | undefined,
  assignOwnerAction: Action,
  userRepository: IUserRepository,
): Promise<string> {
  if (!actor.userId) {
    throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
  }
  if (!can(actor, assignOwnerAction) || requestedOwnerId === undefined) return actor.userId;

  await ensureAssignableOwner(requestedOwnerId, userRepository);
  return requestedOwnerId;
}

/** Responsable tras una modificación: solo cambia si gestión pide otro distinto, y debe ser válido. */
export async function resolveOwnerForUpdatedClient(
  actor: Actor,
  requestedOwnerId: string | undefined,
  currentOwnerId: string | undefined,
  assignOwnerAction: Action,
  userRepository: IUserRepository,
): Promise<string | undefined> {
  const changesOwner = requestedOwnerId !== undefined && requestedOwnerId !== currentOwnerId;
  if (!changesOwner || !can(actor, assignOwnerAction)) return currentOwnerId;

  await ensureAssignableOwner(requestedOwnerId, userRepository);
  return requestedOwnerId;
}

/**
 * Documento normalizado de un contacto persona, o `undefined` si no tiene. Tipo y número van juntos.
 *
 * @throws {ValidationError} `DOCUMENT_TYPE_REQUIRED` o `INVALID_DOCUMENT_NUMBER`.
 */
export function normalizeClientDocument(
  documentType: DocumentType | undefined,
  documentNumber: string | undefined,
): string | undefined {
  if (documentNumber === undefined) return undefined;
  if (documentType === undefined) {
    throw new ValidationError(ErrorCode.DOCUMENT_TYPE_REQUIRED, 'documentType is required with documentNumber');
  }
  return normalizeDocumentNumber(documentType, documentNumber);
}

/** ¿Puede el actor ver un cliente con ese responsable? Sirve para no vincular a clientes que no ve. */
export function canSeeClient(actor: Actor, listAction: Action, ownerId: string | undefined): boolean {
  const scope = scopeFor(actor, listAction);
  if (scope.kind === 'all') return true;
  return scope.kind === 'own' && ownerId === scope.userId;
}
