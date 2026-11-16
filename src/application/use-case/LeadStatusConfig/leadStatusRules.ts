import { LeadStatusType } from '../../../domain/enums/LeadStatusType.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ValidationError } from '../../../domain/errors/ValidationError.js';

/**
 * El estado predeterminado es el que reciben los leads nuevos: tiene que ser abierto. Un lead no puede
 * nacer ganado ni perdido (D-51, F1-T14).
 */
export function ensureDefaultStatusIsOpen(isDefault: boolean | undefined, type: LeadStatusType): void {
  if (isDefault && type !== LeadStatusType.OPEN) {
    throw new ValidationError(
      ErrorCode.DEFAULT_LEAD_STATUS_MUST_BE_OPEN,
      'The default lead status must be of type OPEN',
    );
  }
}
