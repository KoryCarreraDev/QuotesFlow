import { ITenantRepository } from "../../ports/repositories/ITenantRepository.js";
import { IUserRepository } from "../../ports/repositories/IUserRepository.js";
import { IHashService } from "../../ports/services/IHashService.js";
import { ILeadStatusConfigRepository } from "@/application/ports/repositories/ILeadStatusConfigRepository.js";
import { RegisterCompanyDTO } from "../../dtos/RegisterCompanyDTO.js";
import { Tenant } from "../../../domain/entities/Tenant.js";
import { User } from "../../../domain/entities/User.js";
import { Role } from "../../../domain/enums/Role.js";
import { defaultLeadStatuses } from "@/application/constants/defaultLeadStatuses.js";
import { LeadStatusConfig } from "@/domain/entities/LeadStatusConfig.js";

export class RegisterCompanyAndOwnerUseCase {
    constructor(
        private tenantRepo: ITenantRepository,
        private userRepo: IUserRepository,
        private hashService: IHashService,
        private statusRepo: ILeadStatusConfigRepository
    ) { }

    async execute(dto: RegisterCompanyDTO) {
        const existingUser = await this.userRepo.findByEmail(dto.ownerEmail);
        if (existingUser) {
            throw new Error('Email already in use');
        }

        const tenant = Tenant.create({ name: dto.companyName });
        const passwordHash = await this.hashService.hash(dto.password);

        const owner = User.create({
            email: dto.ownerEmail,
            passwordHash,
            firstName: dto.ownerFirstName,
            lastName: dto.ownerLastName,
            role: Role.OWNER,
            tenantId: tenant.id,
        });

        await this.tenantRepo.create(tenant);
        await this.userRepo.create(owner);

        for (const statusData of defaultLeadStatuses) {
            const status = LeadStatusConfig.create({
                name: statusData.name,
                order: statusData.order,
                isDefault: statusData.isDefault,
                tenantId: tenant.id,
                color: statusData.color,
                deleted: 'INUSE'
            });
            await this.statusRepo.create(status);
        }

        return { tenantId: tenant.id, ownerId: owner.id };
    }
}