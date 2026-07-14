import { IUserRepository } from "../../ports/repositories/IUserRepository.js";
import { IHashService } from "../../ports/services/IHashService.js";
import { IAuthTokenService } from "../../ports/services/IAuthTokenService.js";
import { LoginDTO } from "../../dtos/LoginDTO.js";

export class LoginUseCase {

    constructor(
        private userRepo: IUserRepository,
        private hashService: IHashService,
        private authTokenService: IAuthTokenService,
    ){}

    async execute(dto: LoginDTO): Promise<{ token: string }> {
        const user = await this.userRepo.findByEmail(dto.email);

        if (!user) {
            throw new Error ("Invalid Credentials");
        }

        const isPasswordValid = await this.hashService.compare(dto.password, user.passwordHash);

        if (!isPasswordValid) {
            throw new Error ("Invalid Credentials");
        }

        const token = this.authTokenService.generateToken({ sub: user.id.toString(), tenantId: user.tenantId.toString(), role: user.role });

        return { token };
    }
}