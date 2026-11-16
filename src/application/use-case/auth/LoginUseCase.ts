import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { UnauthorizedError } from '@/domain/errors/UnauthorizedError.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { IHashService } from '../../ports/services/IHashService.js';
import { IAuthTokenService } from '../../ports/services/IAuthTokenService.js';
import { LoginDTO } from '../../dtos/LoginDTO.js';

export class LoginUseCase {
  constructor(
    private userRepo: IUserRepository,
    private hashService: IHashService,
    private authTokenService: IAuthTokenService,
  ) {}

  async execute(dto: LoginDTO): Promise<{ token: string }> {
    // Una cuenta desactivada, borrada o de una empresa borrada responde igual que unas credenciales
    // incorrectas (H3): no se revela que la cuenta existe.
    const user = await this.userRepo.findActiveByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, 'Invalid Credentials');
    }

    const isPasswordValid = await this.hashService.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError(ErrorCode.INVALID_CREDENTIALS, 'Invalid Credentials');
    }

    const token = this.authTokenService.generateToken({
      sub: user.id.toString(),
      tenantId: user.tenantId.toString(),
      role: user.role,
    });

    return { token };
  }
}
