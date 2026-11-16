import { LeadStatusType } from '../../domain/enums/LeadStatusType.js';

export interface UpdateLeadStatusConfigDTO {
  name?: string;
  color?: string;
  order?: number;
  isDefault?: boolean;
  type?: LeadStatusType;
}
