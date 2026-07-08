import { PrismaClient } from "@prisma/client";
import prisma from '../../../config/database.js';

export class PrismaService {
    private static instance: PrismaService;
    readonly client: PrismaClient;

    private constructor() {
        this.client = prisma;
    }

    static getInstance(): PrismaService {
        if (!PrismaService.instance) {
            PrismaService.instance = new PrismaService();
        }
        return PrismaService.instance
    }
}