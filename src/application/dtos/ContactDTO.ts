import { DocumentType } from '../../domain/enums/DocumentType.js';

export interface ContactDTO {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyId?: string;
  ownerId?: string;
  documentType?: DocumentType;
  documentNumber?: string;
}
