import { DocumentType } from '../../domain/enums/DocumentType.js';

export interface CreateContactDTO {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyId?: string;
  /** Solo gestión puede indicar otro responsable; un comercial siempre queda como responsable de lo que crea. */
  ownerId?: string;
  documentType?: DocumentType;
  /** Tal como lo escribe el usuario; se normaliza antes de guardarlo. */
  documentNumber?: string;
}
