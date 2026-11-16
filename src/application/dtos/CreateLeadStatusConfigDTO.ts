import { LeadStatusType } from '../../domain/enums/LeadStatusType.js';

export interface CreateLeadStatusConfigDTO {
  name: string;
  color?: string | undefined;
  order: number;
  isDefault: boolean;
  /** Por defecto `OPEN`. */
  type?: LeadStatusType;
}
