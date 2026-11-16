import { z } from 'zod';
import { DocumentType } from '../../domain/enums/DocumentType.js';

const MAXIMUM_DOCUMENT_LENGTH = 30;

export const createContactSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  companyId: z.string().uuid().optional(),
  ownerId: z.uuid().optional(),
  documentType: z.enum(DocumentType).optional(),
  documentNumber: z.string().min(1).max(MAXIMUM_DOCUMENT_LENGTH).optional(),
});

export const updateContactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  companyId: z.string().uuid().optional(),
  ownerId: z.uuid().optional(),
  documentType: z.enum(DocumentType).optional(),
  documentNumber: z.string().min(1).max(MAXIMUM_DOCUMENT_LENGTH).optional(),
});
