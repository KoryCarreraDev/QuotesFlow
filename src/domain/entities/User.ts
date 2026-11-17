import crypto from 'crypto';
import { Role } from '../enums/Role.js';

/**
 * Usuario de una empresa, con su rol y si está activo. El correo es único en toda la plataforma.
 */
export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly role: Role,
    public readonly isActive: boolean,
    public readonly tenantId: string,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
    /** Fallos de login seguidos desde el último acierto (F2-T03). */
    public readonly failedLoginAttempts: number = 0,
    /** Hasta cuándo no puede iniciar sesión por fallos seguidos (F2-T03). */
    public readonly loginLockedUntil?: Date,
    /** Cuándo confirmó su correo (D-12, F2-T04). Sin él no puede iniciar sesión. */
    public readonly emailVerifiedAt?: Date,
  ) {}

  /** Indica si el usuario confirmó su correo (D-12). */
  get isEmailVerified(): boolean {
    return this.emailVerifiedAt !== undefined;
  }

  /** Indica si la cuenta está bloqueada por intentos fallidos en ese momento. */
  isLoginLockedAt(moment: Date): boolean {
    return this.loginLockedUntil !== undefined && this.loginLockedUntil.getTime() > moment.getTime();
  }

  static create(props: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: Role;
    tenantId: string;
    /** Con una invitación aceptada el correo ya está probado (F2-T05). */
    emailVerifiedAt?: Date;
  }): User {
    const id = crypto.randomUUID();
    return new User(
      id,
      props.email,
      props.passwordHash,
      props.firstName,
      props.lastName,
      props.role,
      true,
      props.tenantId,
      undefined,
      undefined,
      0,
      undefined,
      props.emailVerifiedAt,
    );
  }
}
