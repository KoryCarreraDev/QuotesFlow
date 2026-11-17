import { AccountLinks } from '../../application/services/AccountLinks.js';
import {
  InviteUserUseCase,
  ListTenantUsersUseCase,
  ListUserInvitationsUseCase,
  RevokeUserInvitationUseCase,
  TenantUserDependencies,
  UpdateTenantUserUseCase,
} from '../../application/use-case/users/TenantUserUseCases.js';
import { env } from '../../config/env.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { PrismaSessionRepository } from '../../infrastructure/persistence/repositories/PrismaSessionRepository.js';
import { PrismaTenantRepository } from '../../infrastructure/persistence/repositories/PrismaTenantRepository.js';
import { PrismaUserInvitationRepository } from '../../infrastructure/persistence/repositories/PrismaUserInvitationRepository.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { EmailModule } from './EmailModule.js';
import { ModuleDependencies } from './ModuleDependencies.js';

const accountLinks = new AccountLinks(env.APP_BASE_URL);

/** Usuarios de la empresa (F2-T05): listar, invitar, revocar invitaciones, cambiar rol y desactivar. */
export class UserModule {
  private readonly emailModule: EmailModule;

  constructor(private readonly dependencies: ModuleDependencies) {
    this.emailModule = new EmailModule(dependencies);
  }

  private createUserRepository(): PrismaUserRepository {
    return new PrismaUserRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createInvitationRepository(): PrismaUserInvitationRepository {
    return new PrismaUserInvitationRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createDependencies(): TenantUserDependencies {
    const { prisma, tenantContext } = this.dependencies;
    return {
      userRepository: this.createUserRepository(),
      invitationRepository: this.createInvitationRepository(),
      sessionRepository: new PrismaSessionRepository(prisma, tenantContext),
      tenantRepository: new PrismaTenantRepository(prisma, tenantContext),
      transactionManager: new PrismaTransactionManager(prisma),
      auditLogger: new PrismaAuditLogger(prisma, tenantContext),
      emailSender: this.emailModule.getTransactionalEmailSender(),
      accountLinks,
    };
  }

  getListTenantUsersUseCase(): ListTenantUsersUseCase {
    return new ListTenantUsersUseCase(this.createUserRepository());
  }

  getListUserInvitationsUseCase(): ListUserInvitationsUseCase {
    return new ListUserInvitationsUseCase(this.createInvitationRepository());
  }

  getInviteUserUseCase(): InviteUserUseCase {
    return new InviteUserUseCase(this.createDependencies());
  }

  getRevokeUserInvitationUseCase(): RevokeUserInvitationUseCase {
    return new RevokeUserInvitationUseCase(this.createDependencies());
  }

  getUpdateTenantUserUseCase(): UpdateTenantUserUseCase {
    return new UpdateTenantUserUseCase(this.createDependencies());
  }
}
