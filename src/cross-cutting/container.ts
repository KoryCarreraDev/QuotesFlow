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
import { LeadMapper } from "@/application/mappers/LeadMapper.js";
import { GetLeadsUseCase } from "@/application/use-case/leads/getLeadsUseCase.js";
import { PrismaLeadRepository } from "@/infrastructure/persistence/repositories/PrismaLeadRepository.js";
import { CreateLeadUseCase } from "@/application/use-case/leads/createLeadUseCase.js";
import { UpdateLeadUseCase } from "@/application/use-case/leads/updateLeadUseCase.js";
import { GenericListFilteredUseCase } from "@/application/use-case/filter/GenericListFilteredUseCase.js";
import { leadFilterConfig } from "@/infrastructure/persistence/filters/leadFilterConfig.js";
import { ListFilteredLeadsUseCase } from '@/application/use-case/leads/listFilteredLeadsUseCase.js';
import { ContactMapper } from "@/application/mappers/ContactMapper.js";
import { GetContactsUseCase } from "@/application/use-case/contacts/getContactsUseCase.js";
import { PrismaContactRepository } from "@/infrastructure/persistence/repositories/PrismaContactRepository.js";
import { CreateContactUseCase } from "@/application/use-case/contacts/createContactUseCase.js";
import { UpdateContactUseCase } from "@/application/use-case/contacts/updateContactUseCase.js";
import { contactFilterConfig } from "@/infrastructure/persistence/filters/contactFilterConfig.js";
import { ListFilteredContactsUseCase } from '@/application/use-case/contacts/listFilteredContactsUseCase.js';
import { CompanyContactMapper } from "@/application/mappers/CompanyContactMapper.js";
import { GetCompanyContactsUseCase } from "@/application/use-case/companyContacts/getCompanyContactsUseCase.js";
import { PrismaCompanyContactRepository } from "@/infrastructure/persistence/repositories/PrismaCompanyContactRepository.js";
import { CreateCompanyContactUseCase } from "@/application/use-case/companyContacts/createCompanyContactUseCase.js";
import { UpdateCompanyContactUseCase } from "@/application/use-case/companyContacts/updateCompanyContactUseCase.js";
import { companyContactFilterConfig } from "@/infrastructure/persistence/filters/companyContactFilterConfig.js";
import { ListFilteredCompanyContactsUseCase } from '@/application/use-case/companyContacts/listFilteredCompanyContactsUseCase.js';

export class ScopedContainer {
    private prisma: PrismaClient;
    private tenantContext: ITenantContext;
    private hashService = new BcryptHashService();
    private authTokenService = new JwTokenService();

    constructor(tenantId?: string) {
        this.prisma = PrismaService.getInstance().client;
        if (tenantId) {
            this.tenantContext = new TenantContext();
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

    getGetLeadsUseCase(): GetLeadsUseCase{
        const leadRepo = new PrismaLeadRepository(this.prisma, this.tenantContext);
        const leadMapper = new LeadMapper();
        return new GetLeadsUseCase(leadRepo, leadMapper);
    }
    getCreateLeadUseCase(): CreateLeadUseCase{
        const leadRepo = new PrismaLeadRepository(this.prisma, this.tenantContext);
        const leadMapper = new LeadMapper();
        return new CreateLeadUseCase(leadRepo, leadMapper, this.tenantContext);
    }
    getUpdateLeadUseCase(): UpdateLeadUseCase {
        const leadRepo = new PrismaLeadRepository(this.prisma, this.tenantContext);
        const leadMapper = new LeadMapper();
        return new UpdateLeadUseCase(leadRepo, leadMapper, this.tenantContext);
    }
    getListFilteredLeadsUseCase(): ListFilteredLeadsUseCase {
        const leadRepo = new PrismaLeadRepository(this.prisma, this.tenantContext);
        const leadMapper = new LeadMapper();
        return new GenericListFilteredUseCase(leadRepo, leadMapper, leadFilterConfig);
    }
    getGetContactsUseCase(): GetContactsUseCase {
        const contactRepo = new PrismaContactRepository(this.prisma, this.tenantContext);
        const contactMapper = new ContactMapper();
        return new GetContactsUseCase(contactRepo, contactMapper);
    }
    getCreateContactUseCase(): CreateContactUseCase {
        const contactRepo = new PrismaContactRepository(this.prisma, this.tenantContext);
        const contactMapper = new ContactMapper();
        return new CreateContactUseCase(contactRepo, contactMapper, this.tenantContext);
    }
    getUpdateContactUseCase(): UpdateContactUseCase {
        const contactRepo = new PrismaContactRepository(this.prisma, this.tenantContext);
        const contactMapper = new ContactMapper();
        return new UpdateContactUseCase(contactRepo, contactMapper, this.tenantContext);
    }
    getListFilteredContactsUseCase(): ListFilteredContactsUseCase {
        const contactRepo = new PrismaContactRepository(this.prisma, this.tenantContext);
        const contactMapper = new ContactMapper();
        return new GenericListFilteredUseCase(contactRepo, contactMapper, contactFilterConfig);
    }
    getGetCompanyContactsUseCase(): GetCompanyContactsUseCase {
        const companyContactRepo = new PrismaCompanyContactRepository(this.prisma, this.tenantContext);
        const companyContactMapper = new CompanyContactMapper();
        return new GetCompanyContactsUseCase(companyContactRepo, companyContactMapper);
    }
    getCreateCompanyContactUseCase(): CreateCompanyContactUseCase {
        const companyContactRepo = new PrismaCompanyContactRepository(this.prisma, this.tenantContext);
        const companyContactMapper = new CompanyContactMapper();
        return new CreateCompanyContactUseCase(companyContactRepo, companyContactMapper, this.tenantContext);
    }
    getUpdateCompanyContactUseCase(): UpdateCompanyContactUseCase {
        const companyContactRepo = new PrismaCompanyContactRepository(this.prisma, this.tenantContext);
        const companyContactMapper = new CompanyContactMapper();
        return new UpdateCompanyContactUseCase(companyContactRepo, companyContactMapper, this.tenantContext);
    }
    getListFilteredCompanyContactsUseCase(): ListFilteredCompanyContactsUseCase {
        const companyContactRepo = new PrismaCompanyContactRepository(this.prisma, this.tenantContext);
        const companyContactMapper = new CompanyContactMapper();
        return new GenericListFilteredUseCase(companyContactRepo, companyContactMapper, companyContactFilterConfig);
    }
}