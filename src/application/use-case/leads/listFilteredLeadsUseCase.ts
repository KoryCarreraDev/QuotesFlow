import { GenericListFilteredUseCase } from "../filter/GenericListFilteredUseCase.js";
import { Lead } from "@/domain/entities/Lead.js";
import { LeadDTO } from "@/application/dtos/LeadDTO.js";

export type ListFilteredLeadsUseCase = GenericListFilteredUseCase<Lead, LeadDTO>;