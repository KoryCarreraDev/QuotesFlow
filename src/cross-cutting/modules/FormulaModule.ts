import {
  CreateFormulaUseCase,
  DeleteFormulaUseCase,
  ListFormulasUseCase,
  UpdateFormulaUseCase,
} from '../../application/use-case/formulas/FormulaUseCases.js';
import { formulaFilterConfig } from '../../infrastructure/persistence/filters/formulaFilterConfig.js';
import { PrismaTransactionManager } from '../../infrastructure/persistence/prisma/PrismaTransactionManager.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { PrismaFormulaRepository } from '../../infrastructure/persistence/repositories/PrismaFormulaRepository.js';
import { MathjsFormulaEvaluator } from '../../infrastructure/services/MathjsFormulaEvaluator.js';
import { ModuleDependencies } from './ModuleDependencies.js';

// Una sola instancia del evaluador: crear la de mathjs es costoso y no guarda estado entre fórmulas.
const formulaEvaluator = new MathjsFormulaEvaluator();

/** Fórmulas de precio (F3-T04). */
export class FormulaModule {
  constructor(private readonly dependencies: ModuleDependencies) {}

  private createRepository(): PrismaFormulaRepository {
    return new PrismaFormulaRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private writeDependencies() {
    const { prisma, tenantContext } = this.dependencies;
    return [new PrismaTransactionManager(prisma), new PrismaAuditLogger(prisma, tenantContext)] as const;
  }

  getListFormulasUseCase(): ListFormulasUseCase {
    return new ListFormulasUseCase(this.createRepository(), formulaFilterConfig);
  }

  getCreateFormulaUseCase(): CreateFormulaUseCase {
    return new CreateFormulaUseCase(
      this.createRepository(),
      formulaEvaluator,
      this.dependencies.tenantContext,
      ...this.writeDependencies(),
    );
  }

  getUpdateFormulaUseCase(): UpdateFormulaUseCase {
    return new UpdateFormulaUseCase(this.createRepository(), formulaEvaluator, ...this.writeDependencies());
  }

  getDeleteFormulaUseCase(): DeleteFormulaUseCase {
    return new DeleteFormulaUseCase(this.createRepository(), ...this.writeDependencies());
  }
}
