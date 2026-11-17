/** Para qué sirve un token de cuenta. */
export enum AccountTokenPurpose {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

/**
 * Token de un solo uso enviado por correo (F2-T04): verificar el correo (D-12) o recuperar la contraseña. El
 * enlace lleva `<id>.<secreto>`; aquí solo se guarda el hash SHA-256 del secreto.
 */
export class AccountToken {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly purpose: AccountTokenPurpose,
    public readonly tokenHash: string,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
    public readonly usedAt?: Date,
  ) {}

  /** Sirve si no se usó, no caducó y es para lo que se pide. */
  isUsableAt(moment: Date, purpose: AccountTokenPurpose): boolean {
    return this.purpose === purpose && this.usedAt === undefined && this.expiresAt.getTime() > moment.getTime();
  }
}
