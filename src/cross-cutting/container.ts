import { PrismaClient } from "@prisma/client";
import { ITenantContext } from "../application/ports/services/ITenantContext.js";
import { TenantContext } from "./tenantContext.js";
import { PrismaService } from "../infrastructure/persistence/prisma/PrismaService.js";
import { PrismaTenantRepository } from "../infrastructure/persistence/repositories/PrismaTenantRepository.js";
import { PrismaUserRepository } from "../infrastructure/persistence/repositories/PrismaUserRepository.js";
import { BcryptHashService } from "../infrastructure/services/BcryptHashService.js";
import { RegisterCompanyAndOwnerUseCase } from "../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js";
import { LoginUseCase } from "@/application/use-case/auth/LoginUseCase.js";
import { JwTokenService } from "../infrastructure/services/JwtTokenService.js";

export class ScopedContainer {
    private prisma: PrismaClient;
    private tenantContext: ITenantContext;
    private hashService = new BcryptHashService();
    private authTokenService = new JwTokenService();

    constructor(tenantId?: string) {
        this.prisma = PrismaService.getInstance().client;
        if (tenantId) {
            this.tenantContext = new TenantContext();
            TenantContext.run(tenantId, () => { });
        } else {
            this.tenantContext = {
                getTenantId: () => { throw new Error('Tenant context not available in this scope'); }
            };
        }
    }

    getRegisterCompanyUseCase() {
        return new RegisterCompanyAndOwnerUseCase(
            new PrismaTenantRepository(this.prisma, this.tenantContext),
            new PrismaUserRepository(this.prisma, this.tenantContext),
            this.hashService
        );
    }

    getLoginUseCase() {
        return new LoginUseCase(
            new PrismaUserRepository(this.prisma, this.tenantContext),
            this.hashService,
            this.authTokenService,
        )
    }
}