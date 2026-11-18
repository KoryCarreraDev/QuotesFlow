import { AcceptQuoteUseCase, CreateQuoteFromLeadUseCase } from '../../application/use-case/quotes/QuoteUseCases.js';
import { GenerateQuotePdfUseCase } from '../../application/use-case/quotes/QuotePdfUseCase.js';
import { QuoteContentResolver } from '../../application/use-case/quotes/QuoteContentResolver.js';
import {
  CreateQuoteUseCase,
  DeleteQuoteUseCase,
  GetQuoteUseCase,
  ListQuotesUseCase,
  RejectQuoteUseCase,
  ReviseQuoteUseCase,
  SendQuoteUseCase,
  UpdateQuoteUseCase,
} from '../../application/use-case/quotes/QuoteUseCases.js';
import { quoteFilterConfig } from '../../infrastructure/persistence/filters/quoteFilterConfig.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { PrismaCompanyContactRepository } from '../../infrastructure/persistence/repositories/PrismaCompanyContactRepository.js';
import { PrismaContactRepository } from '../../infrastructure/persistence/repositories/PrismaContactRepository.js';
import { PrismaFormulaRepository } from '../../infrastructure/persistence/repositories/PrismaFormulaRepository.js';
import { PrismaLeadRepository } from '../../infrastructure/persistence/repositories/PrismaLeadRepository.js';
import { PrismaProductRepository } from '../../infrastructure/persistence/repositories/PrismaProductRepository.js';
import { PrismaQuoteRepository } from '../../infrastructure/persistence/repositories/PrismaQuoteRepository.js';
import { PrismaTenantProfileRepository } from '../../infrastructure/persistence/repositories/PrismaTenantProfileRepository.js';
import { appLogger } from '../../infrastructure/logging/appLogger.js';
import { MathjsFormulaEvaluator } from '../../infrastructure/services/MathjsFormulaEvaluator.js';
import { fileStorage, pdfGenerator } from '../sharedServices.js';
import { PrismaLeadStatusConfigRepository } from '../../infrastructure/persistence/repositories/PrismaLeadStatusConfigRepository.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { EmailModule } from './EmailModule.js';
import { LeadModule } from './LeadModule.js';
import { ModuleDependencies } from './ModuleDependencies.js';

const formulaEvaluator = new MathjsFormulaEvaluator();

/** Cotizaciones (F3-T05). */
export class QuoteModule {
  constructor(private readonly dependencies: ModuleDependencies) {}

  private createRepository(): PrismaQuoteRepository {
    return new PrismaQuoteRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createProfileRepository(): PrismaTenantProfileRepository {
    return new PrismaTenantProfileRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createContentResolver(): QuoteContentResolver {
    const { prisma, tenantContext } = this.dependencies;
    return new QuoteContentResolver(
      new PrismaProductRepository(prisma, tenantContext),
      new PrismaFormulaRepository(prisma, tenantContext),
      formulaEvaluator,
      new PrismaLeadRepository(prisma, tenantContext),
      new PrismaContactRepository(prisma, tenantContext),
      new PrismaCompanyContactRepository(prisma, tenantContext),
    );
  }

  private writeDependencies() {
    const { prisma, tenantContext } = this.dependencies;
    return [new PrismaTransactionManager(prisma), new PrismaAuditLogger(prisma, tenantContext)] as const;
  }

  getListQuotesUseCase(): ListQuotesUseCase {
    return new ListQuotesUseCase(this.createRepository(), this.createProfileRepository(), quoteFilterConfig);
  }

  getGetQuoteUseCase(): GetQuoteUseCase {
    return new GetQuoteUseCase(this.createRepository(), this.createProfileRepository());
  }

  getCreateQuoteUseCase(): CreateQuoteUseCase {
    return new CreateQuoteUseCase(
      this.createRepository(),
      this.createContentResolver(),
      this.createProfileRepository(),
      this.dependencies.tenantContext,
      ...this.writeDependencies(),
    );
  }

  getUpdateQuoteUseCase(): UpdateQuoteUseCase {
    return new UpdateQuoteUseCase(
      this.createRepository(),
      this.createContentResolver(),
      this.createProfileRepository(),
      ...this.writeDependencies(),
    );
  }

  getDeleteQuoteUseCase(): DeleteQuoteUseCase {
    return new DeleteQuoteUseCase(this.createRepository(), ...this.writeDependencies());
  }

  getSendQuoteUseCase(): SendQuoteUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new SendQuoteUseCase(
      this.createRepository(),
      this.createProfileRepository(),
      ...this.writeDependencies(),
      new EmailModule(this.dependencies).getTransactionalEmailSender(),
      this.getGenerateQuotePdfUseCase(),
      new PrismaUserRepository(prisma, tenantContext),
      new PrismaLeadRepository(prisma, tenantContext),
      new PrismaContactRepository(prisma, tenantContext),
      new PrismaCompanyContactRepository(prisma, tenantContext),
    );
  }

  getAcceptQuoteUseCase(): AcceptQuoteUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new AcceptQuoteUseCase(
      this.createRepository(),
      this.createProfileRepository(),
      ...this.writeDependencies(),
      new PrismaLeadRepository(prisma, tenantContext),
      new PrismaLeadStatusConfigRepository(prisma, tenantContext),
      new LeadModule(this.dependencies).getChangeLeadStatusUseCase(),
      tenantContext,
    );
  }

  getCreateQuoteFromLeadUseCase(): CreateQuoteFromLeadUseCase {
    return new CreateQuoteFromLeadUseCase(
      new PrismaLeadRepository(this.dependencies.prisma, this.dependencies.tenantContext),
      this.getCreateQuoteUseCase(),
    );
  }

  getRejectQuoteUseCase(): RejectQuoteUseCase {
    return new RejectQuoteUseCase(this.createRepository(), this.createProfileRepository(), ...this.writeDependencies());
  }

  getReviseQuoteUseCase(): ReviseQuoteUseCase {
    return new ReviseQuoteUseCase(this.createRepository(), this.createProfileRepository(), ...this.writeDependencies());
  }

  getGenerateQuotePdfUseCase(): GenerateQuotePdfUseCase {
    const { prisma, tenantContext } = this.dependencies;
    return new GenerateQuotePdfUseCase(
      this.createRepository(),
      this.createProfileRepository(),
      new PrismaLeadRepository(prisma, tenantContext),
      new PrismaContactRepository(prisma, tenantContext),
      new PrismaCompanyContactRepository(prisma, tenantContext),
      fileStorage,
      pdfGenerator,
      appLogger,
      new PrismaAuditLogger(prisma, tenantContext),
    );
  }
}
