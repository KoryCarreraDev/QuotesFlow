import { DocumentType } from '../enums/DocumentType.js';
import { ErrorCode } from '../errors/ErrorCode.js';
import { ValidationError } from '../errors/ValidationError.js';

const NON_DIGIT_PATTERN = /[^0-9]/g;
const NON_ALPHANUMERIC_PATTERN = /[^0-9A-Z]/g;
// En un NIT escrito como 900123456-7, lo que sigue al guion es el dígito de verificación.
const VERIFICATION_DIGIT_SUFFIX_PATTERN = /-[^-]*$/;
const MAXIMUM_NORMALIZED_LENGTH = 20;

/**
 * Normaliza un número de documento para compararlo y guardarlo (F1-T17, D-19): `1.020.304.050`,
 * `1020304050` y `1 020 304 050` son el mismo documento. Solo dígitos; el pasaporte admite letras,
 * en mayúsculas; en el NIT se descarta el dígito de verificación.
 *
 * @throws {ValidationError} `INVALID_DOCUMENT_NUMBER` si no queda nada válido o es demasiado largo.
 */
export function normalizeDocumentNumber(documentType: DocumentType, rawDocumentNumber: string): string {
  const withoutVerificationDigit =
    documentType === DocumentType.NIT
      ? rawDocumentNumber.replace(VERIFICATION_DIGIT_SUFFIX_PATTERN, '')
      : rawDocumentNumber;
  const normalized =
    documentType === DocumentType.PASSPORT
      ? withoutVerificationDigit.toUpperCase().replace(NON_ALPHANUMERIC_PATTERN, '')
      : withoutVerificationDigit.replace(NON_DIGIT_PATTERN, '');

  if (normalized === '' || normalized.length > MAXIMUM_NORMALIZED_LENGTH) {
    throw new ValidationError(ErrorCode.INVALID_DOCUMENT_NUMBER, 'Document number is not valid for its type');
  }
  return normalized;
}
