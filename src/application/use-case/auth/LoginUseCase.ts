import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { UnauthorizedError } from '@/domain/errors/UnauthorizedError.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { IHashService } from '../../ports/services/IHashService.js';
import { IAuthTokenService } from '../../ports/services/IAuthTokenService.js';
import { LoginDTO } from '../../dtos/LoginDTO.js';

/**
 * Inicio de sesión. Solo cuentas activas de empresas activas (H3); cualquier fallo responde igual, `INVALID_CREDENTIALS`, para no revelar qué cuentas existen. Audita el éxito y la contraseña incorrecta.
 *
 * @throws {UnauthorizedError} `INVALID_CREDENTIALS`.
 */
export class LoginUseCase {
  constructor(
    private userRepository: IUserRepository,
    private hashService: IHashService,
    private authTokenService: IAuthTokenService,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(dto: LoginDTO): Promise<{ token: string }> {
    // Una cuenta desactivada, borrada o de una empresa borrada responde igual que unas credenciales
    // incorrectas (H3): no se revela que la cuenta existe.
    const user = await this.userRepository.findActiveByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, 'Invalid Credentials');
    }

    const isPasswordValid = await this.hashService.compare(dto.password, user.passwordHash);

    const publicActor = { userId: user.id, tenantId: user.tenantId };
    if (!isPasswordValid) {
      // Un correo que no existe no se audita: no hay usuario ni empresa a la que asociarlo.
      await this.auditLogger.record({
        action: AuditAction.LOGIN_FAILED,
        entity: AuditEntity.USER,
        entityId: user.id,
        publicActor,
      });
      throw new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, 'Invalid Credentials');
    }

    const token = this.authTokenService.generateToken({
      sub: user.id.toString(),
      tenantId: user.tenantId.toString(),
      role: user.role,
    });

    await this.auditLogger.record({
      action: AuditAction.LOGIN_SUCCEEDED,
      entity: AuditEntity.USER,
      entityId: user.id,
      publicActor,
    });

    return { token };
  }
}
