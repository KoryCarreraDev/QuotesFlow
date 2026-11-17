import { ErrorCode } from '../../domain/errors/ErrorCode.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';
import { IBreachedPasswordChecker } from '../ports/services/IBreachedPasswordChecker.js';

/** D-11: al menos 12 caracteres. */
export const MINIMUM_PASSWORD_LENGTH = 12;
// bcrypt solo usa los primeros 72 bytes: una contraseña más larga se truncaría sin avisar y dos contraseñas
// distintas con el mismo comienzo valdrían igual.
export const MAXIMUM_PASSWORD_BYTES = 72;

/** Datos de la cuenta que la contraseña no puede repetir. */
export interface PasswordOwner {
  email: string;
}

/**
 * Política de contraseñas (D-11, H7, F2-T03): longitud de 12 caracteres a 72 bytes, distinta del correo y
 * fuera de las filtraciones públicas. La aplican el registro, el cambio de contraseña y aceptar una invitación.
 * Zod ya comprueba la longitud en el borde; aquí se repite para que ningún caso de uso dependa de ello.
 */
export class PasswordPolicy {
  constructor(private readonly breachedPasswordChecker: IBreachedPasswordChecker) {}

  /**
   * @throws {ValidationError} `PASSWORD_TOO_WEAK` (longitud o igual al correo) o `PASSWORD_BREACHED`.
   */
  async assertAcceptable(password: string, owner: PasswordOwner): Promise<void> {
    if ([...password].length < MINIMUM_PASSWORD_LENGTH) {
      throw weakPasswordError(`Password must have at least ${MINIMUM_PASSWORD_LENGTH} characters`);
    }
    if (Buffer.byteLength(password, 'utf8') > MAXIMUM_PASSWORD_BYTES) {
      throw weakPasswordError(`Password must have at most ${MAXIMUM_PASSWORD_BYTES} bytes`);
    }
    if (password.trim().toLowerCase() === owner.email.trim().toLowerCase()) {
      throw weakPasswordError('Password must not be the email address');
    }
    if (await this.breachedPasswordChecker.isBreached(password)) {
      throw new ValidationError(ErrorCode.PASSWORD_BREACHED, 'Password appears in a public data breach', [
        { path: ['password'], message: 'breached' },
      ]);
    }
  }
}

function weakPasswordError(message: string): ValidationError {
  return new ValidationError(ErrorCode.PASSWORD_TOO_WEAK, message, [{ path: ['password'], message }]);
}
