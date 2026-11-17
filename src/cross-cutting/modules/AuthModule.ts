import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { LoginUseCase } from '../../application/use-case/auth/LoginUseCase.js';
import { RegisterCompanyAndOwnerUseCase } from '../../application/use-case/auth/RegisterCompanyAndOwnerUseCase.js';
import { RefreshSessionUseCase } from '../../application/use-case/auth/RefreshSessionUseCase.js';
import { LogoutUseCase } from '../../application/use-case/auth/LogoutUseCase.js';
import { LogoutAllSessionsUseCase } from '../../application/use-case/auth/LogoutAllSessionsUseCase.js';
import { AuthenticateSessionUseCase } from '../../application/use-case/auth/AuthenticateSessionUseCase.js';
import { SessionIssuer } from '../../application/services/SessionIssuer.js';
import { AccountLinks } from '../../application/services/AccountLinks.js';
import { AccountTokenIssuer } from '../../application/services/AccountTokenIssuer.js';
import { TransactionalEmailSender } from '../../application/services/TransactionalEmailSender.js';
import {
  ResendEmailVerificationUseCase,
  VerifyEmailUseCase,
} from '../../application/use-case/auth/EmailVerificationUseCases.js';
import {
  PasswordResetDependencies,
  RequestPasswordResetUseCase,
  ResetPasswordUseCase,
} from '../../application/use-case/auth/PasswordResetUseCases.js';
import { PrismaAccountTokenRepository } from '../../infrastructure/persistence/repositories/PrismaAccountTokenRepository.js';
import { EmailModule } from './EmailModule.js';
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
const accountLinks = new AccountLinks(env.APP_BASE_URL);
const passwordPolicy = new PasswordPolicy(
  env.PASSWORD_BREACH_CHECK === 'hibp' ? new PwnedPasswordsChecker(appLogger) : new DisabledBreachedPasswordChecker(),
);

/** Registro de empresas, inicio y cierre de sesión, renovación y autenticación de peticiones. */
export class AuthModule {
  private readonly hashService = new BcryptHashService();
  private readonly authTokenService = new JwtTokenService();

  private readonly emailModule: EmailModule;

  constructor(private readonly dependencies: ModuleDependencies) {
    this.emailModule = new EmailModule(dependencies);
  }

  private createUserRepository(): PrismaUserRepository {
    return new PrismaUserRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createAccountTokenRepository(): PrismaAccountTokenRepository {
    return new PrismaAccountTokenRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createEmailSender(): TransactionalEmailSender {
    return this.emailModule.getTransactionalEmailSender();
  }

  private createPasswordResetDependencies(): PasswordResetDependencies {
    const accountTokenRepository = this.createAccountTokenRepository();
    return {
      userRepository: this.createUserRepository(),
      accountTokenRepository,
      accountTokenIssuer: new AccountTokenIssuer(accountTokenRepository),
      emailSender: this.createEmailSender(),
      accountLinks,
      transactionManager: new PrismaTransactionManager(this.dependencies.prisma),
      auditLogger: this.createAuditLogger(),
    };
  }

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
      {
        accountTokenIssuer: new AccountTokenIssuer(this.createAccountTokenRepository()),
        emailSender: this.createEmailSender(),
        accountLinks,
      },
    );
  }

  getVerifyEmailUseCase(): VerifyEmailUseCase {
    return new VerifyEmailUseCase(
      new AccountTokenIssuer(this.createAccountTokenRepository()),
      this.createUserRepository(),
      new PrismaTransactionManager(this.dependencies.prisma),
      this.createAuditLogger(),
    );
  }

  getResendEmailVerificationUseCase(): ResendEmailVerificationUseCase {
    const accountTokenRepository = this.createAccountTokenRepository();
    return new ResendEmailVerificationUseCase(
      this.createUserRepository(),
      accountTokenRepository,
      new AccountTokenIssuer(accountTokenRepository),
      this.createEmailSender(),
      accountLinks,
    );
  }

  getRequestPasswordResetUseCase(): RequestPasswordResetUseCase {
    return new RequestPasswordResetUseCase(this.createPasswordResetDependencies());
  }

  getResetPasswordUseCase(): ResetPasswordUseCase {
    return new ResetPasswordUseCase(
      this.createPasswordResetDependencies(),
      this.createSessionRepository(),
      this.hashService,
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
