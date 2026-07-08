import { PrismaClient } from "@prisma/client";
import { ITenantContext } from "../application/ports/services/ITenantContext.js";
import { TenantContext } from "./tenantContext.js";
import { PrismaService } from "../infrastructure/persistence/prisma/PrismaService.js";
import { BasePrismaRepository } from "../infrastructure/persistence/repositories/BasePrismaRepository.js";

export class ScopedContainer {
    private prisma: PrismaClient;
    private tenantContext: ITenantContext;

    constructor(tenantId: string) {
        this.tenantContext = new TenantContext();
        //Establecemos el tenantId en el ALS para que el contexto lo devuelva
        TenantContext.run(tenantId, () => {});
        this.prisma = PrismaService.getInstance().client;
    }
}