import { LeadStatusType } from '../../domain/enums/LeadStatusType.js';

export interface LeadStatusConfigDTO {
  id: string;
  name: string;
  color: string | undefined;
  order: number;
  isDefault: boolean;
  type: LeadStatusType;
  deleted?: string;
}
