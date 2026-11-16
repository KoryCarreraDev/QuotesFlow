import { FilterCriteriaDTO } from '@/application/dtos/FilterCriteriaDTO.js';
import { ILeadRepository } from '@/application/ports/repositories/ILeadRepository.js';
import { IFilterFieldConfig } from '@/application/ports/services/IFilterFieldConfig.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { Lead } from '@/domain/entities/Lead.js';
import { DeletedState } from '@/domain/enums/DeletedState.js';
import { paginateInMemory } from './inMemoryPagination.js';

/**
 * Doble en memoria de `ILeadRepository`.
 * Respeta las mismas reglas que `PrismaLeadRepository`: solo ve registros del tenant actual y no borrados.
 * `findFiltered` no interpreta los filtros (eso se prueba contra PostgreSQL); solo pagina y guarda el criterio recibido.
 */
export class InMemoryLeadRepository implements ILeadRepository {
  private readonly leadsById = new Map<string, Lead>();

  /** Último criterio recibido por `findFiltered` o `countFiltered`. */
  lastFilterCriteria: FilterCriteriaDTO | undefined;
  /** Última configuración de filtros recibida por `findFiltered` o `countFiltered`. */
  lastFilterConfig: IFilterFieldConfig | undefined;

  constructor(private readonly tenantContext: ITenantContext) {}

  /** Carga datos iniciales sin pasar por ningún caso de uso. */
  seed(...leads: Lead[]): void {
    for (const lead of leads) {
      this.leadsById.set(lead.id, lead);
    }
  }

  /** Devuelve el registro tal como está guardado, sin filtrar por tenant ni por borrado. */
  findStoredById(id: string): Lead | undefined {
    return this.leadsById.get(id);
  }

  /** Todos los registros guardados, de cualquier tenant y estado. */
  listStored(): Lead[] {
    return [...this.leadsById.values()];
  }

  async findByTenant(assignedTo?: string): Promise<Lead[]> {
    const visibleLeads = this.listVisibleLeads();
    if (!assignedTo) {
      return visibleLeads;
    }
    return visibleLeads.filter((lead) => lead.assignedToId === assignedTo);
  }

  async create(lead: Lead): Promise<void> {
    this.leadsById.set(lead.id, lead);
  }

  async findById(id: string): Promise<Lead | null> {
    const lead = this.leadsById.get(id);
    return lead && this.isVisible(lead) ? lead : null;
  }

  async updateStatus(leadId: string, statusId: string): Promise<void> {
    const storedLead = this.leadsById.get(leadId);
    if (!storedLead || storedLead.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to update not found');
    }
    this.leadsById.set(leadId, Object.assign(Object.create(Lead.prototype), storedLead, { statusId }));
  }

  async update(leadId: string, data: Lead): Promise<void> {
    const storedLead = this.leadsById.get(leadId);
    if (!storedLead || storedLead.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to update not found');
    }

    // Igual que el repositorio real: no cambia estado ni borrado, y un campo `undefined` se deja como estaba.
    this.leadsById.set(
      leadId,
      new Lead(
        storedLead.id,
        storedLead.tenantId,
        data.companyName ?? storedLead.companyName,
        data.contactName ?? storedLead.contactName,
        data.email ?? storedLead.email,
        data.phone ?? storedLead.phone,
        storedLead.statusId,
        data.source ?? storedLead.source,
        data.assignedToId ?? storedLead.assignedToId,
        data.estimatedValue ?? storedLead.estimatedValue,
        data.expectedCloseDate ?? storedLead.expectedCloseDate,
        data.notes ?? storedLead.notes,
        storedLead.createdAt,
        new Date(),
        storedLead.deleted,
      ),
    );
  }

  async delete(id: string): Promise<void> {
    const storedLead = this.leadsById.get(id);
    if (!storedLead || storedLead.tenantId !== this.tenantContext.getTenantId()) {
      throw new Error('Record to update not found');
    }

    this.leadsById.set(
      id,
      new Lead(
        storedLead.id,
        storedLead.tenantId,
        storedLead.companyName,
        storedLead.contactName,
        storedLead.email,
        storedLead.phone,
        storedLead.statusId,
        storedLead.source,
        storedLead.assignedToId,
        storedLead.estimatedValue,
        storedLead.expectedCloseDate,
        storedLead.notes,
        storedLead.createdAt,
        new Date(),
        DeletedState.Inactive,
      ),
    );
  }

  async findFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<Lead[]> {
    this.lastFilterCriteria = criteria;
    this.lastFilterConfig = config;
    return paginateInMemory(this.listVisibleLeads(), criteria);
  }

  async countFiltered(criteria: FilterCriteriaDTO, config: IFilterFieldConfig): Promise<number> {
    this.lastFilterCriteria = criteria;
    this.lastFilterConfig = config;
    return this.listVisibleLeads().length;
  }

  private listVisibleLeads(): Lead[] {
    return this.listStored().filter((lead) => this.isVisible(lead));
  }

  private isVisible(lead: Lead): boolean {
    return lead.tenantId === this.tenantContext.getTenantId() && lead.deleted !== DeletedState.Inactive;
  }
}
