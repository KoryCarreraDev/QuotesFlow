import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { LoginUseCase } from '../../application/use-case/auth/LoginUseCase.js';
import { RegisterCompanyAndOwnerUseCase } from '../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { RefreshSessionUseCase } from '../../application/use-case/auth/RefreshSessionUseCase.js';
import { LogoutUseCase } from '../../application/use-case/auth/LogoutUseCase.js';
import { LogoutAllSessionsUseCase } from '../../application/use-case/auth/LogoutAllSessionsUseCase.js';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { SessionIssuer } from '../../application/services/SessionIssuer.js';
import { durationToMilliseconds, env } from '../../config/env.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaLeadStatusConfigRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusConfigRepository.js';
import { PrismaSessionRepository } from '../../infrastructure/persistence/repositories/PrismaSessionRepository.js';
import { PrismaTenantRepository } from '../../infrastructure/persistence/repositories/PrismaTenantRepository.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { BcryptHashService } from '../../infrastructure/services/BcryptHashService.js';
import { JwtTokenService } from '../../infrastructure/services/JwtTokenService.js';
import {
  DisabledBreachedPasswordChecker,
  PwnedPasswordsChecker,
} from '../../infrastructure/services/PwnedPasswordsChecker.js';
import { appLogger } from '../../infrastructure/logging/appLogger.js';
import { PasswordPolicy } from '../../application/services/PasswordPolicy.js';
import { ModuleDependencies } from './ModuleDependencies.js';

const sessionPolicy = { refreshTokenLifetimeMs: durationToMilliseconds(env.REFRESH_TOKEN_EXPIRATION) };
const passwordPolicy = new PasswordPolicy(
  env.PASSWORD_BREACH_CHECK === 'hibp' ? new PwnedPasswordsChecker(appLogger) : new DisabledBreachedPasswordChecker(),
);

/** Registro de empresas, inicio y cierre de sesión, renovación y autenticación de peticiones. */
export class AuthModule {
  private readonly hashService = new BcryptHashService();
  private readonly authTokenService = new JwtTokenService();

  constructor(private readonly dependencies: ModuleDependencies) {}

  private createAuditLogger(): PrismaAuditLogger {
    return new PrismaAuditLogger(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createSessionRepository(): PrismaSessionRepository {
    return new PrismaSessionRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createSessionIssuer(): SessionIssuer {
    return new SessionIssuer(this.createSessionRepository(), this.authTokenService, sessionPolicy);
  }

  getRegisterCompanyUseCase(): RegisterCompanyAndOwnerUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new RegisterCompanyAndOwnerUseCase(
      new PrismaTenantRepository(prisma, tenantContext),
      new PrismaUserRepository(prisma, tenantContext),
      this.hashService,
      new PrismaLeadStatusConfigRepository(prisma, tenantContext),
      new PrismaTransactionManager(prisma),
      this.createAuditLogger(),
      passwordPolicy,
    );
  }

  /** La política de contraseñas compartida (registro, recuperación, invitaciones). */
  getPasswordPolicy(): PasswordPolicy {
    return passwordPolicy;
  }

  getLoginUseCase(): LoginUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new LoginUseCase(
      new PrismaUserRepository(prisma, tenantContext),
      this.hashService,
      this.createSessionIssuer(),
      new PrismaTransactionManager(prisma),
      this.createAuditLogger(),
    );
  }

  getRefreshSessionUseCase(): RefreshSessionUseCase {
    return new RefreshSessionUseCase(
      this.createSessionRepository(),
      this.createSessionIssuer(),
      new PrismaTransactionManager(this.dependencies.prisma),
      this.createAuditLogger(),
    );
  }

  getLogoutUseCase(): LogoutUseCase {
    return new LogoutUseCase(
      this.createSessionRepository(),
      new PrismaTransactionManager(this.dependencies.prisma),
      this.createAuditLogger(),
    );
  }

  getLogoutAllSessionsUseCase(): LogoutAllSessionsUseCase {
    return new LogoutAllSessionsUseCase(
      this.createSessionRepository(),
      new PrismaTransactionManager(this.dependencies.prisma),
      this.createAuditLogger(),
    );
  }

  getAuthenticateSessionUseCase(): AuthenticateSessionUseCase {
    return new AuthenticateSessionUseCase(this.authTokenService, this.createSessionRepository());
  }
}
