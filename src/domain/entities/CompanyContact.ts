import { DocumentType } from '../enums/DocumentType.js';
import { normalizeDocumentNumber } from '../value-objects/documentNumber.js';
import crypto from 'crypto';

export class CompanyContact {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly name: string,
    public readonly industry?: string,
    public readonly taxNumber?: string,
    public readonly phone?: string,
    public readonly email?: string,
    public readonly address?: string,
    public readonly city?: string,
    public readonly state?: string,
    public readonly zip?: string,
    public readonly country?: string,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
    /** Comercial responsable (D-18). Sin responsable solo la ve gestión. */
    public readonly ownerId?: string,
    /** NIT normalizado, derivado de `taxNumber` (`companyDocumentNumberFrom`). */
    public readonly documentNumber?: string,
  ) {}

  /** NIT normalizado de un `taxNumber` tal como lo escribe el usuario, o `undefined` si no hay. */
  static documentNumberFrom(taxNumber: string | undefined): string | undefined {
    return taxNumber ? normalizeDocumentNumber(DocumentType.NIT, taxNumber) : undefined;
  }

  static fromPrisma(prismaCompanyContact: {
    id: string;
    tenantId: string;
    name: string;
    industry?: string | null;
    taxNumber?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    ownerId?: string | null;
    documentNumber?: string | null;
  }): CompanyContact {
    return new CompanyContact(
      prismaCompanyContact.id,
      prismaCompanyContact.tenantId,
      prismaCompanyContact.name,
      prismaCompanyContact.industry ?? undefined,
      prismaCompanyContact.taxNumber ?? undefined,
      prismaCompanyContact.phone ?? undefined,
      prismaCompanyContact.email ?? undefined,
      prismaCompanyContact.address ?? undefined,
      prismaCompanyContact.city ?? undefined,
      prismaCompanyContact.state ?? undefined,
      prismaCompanyContact.zip ?? undefined,
      prismaCompanyContact.country ?? undefined,
      prismaCompanyContact.createdAt ?? undefined,
      prismaCompanyContact.updatedAt ?? undefined,
      prismaCompanyContact.ownerId ?? undefined,
      prismaCompanyContact.documentNumber ?? undefined,
    );
  }

  static create(props: {
    tenantId: string;
    name: string;
    industry?: string;
    taxNumber?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    ownerId?: string;
  }): CompanyContact {
    const id = crypto.randomUUID();
    const now = new Date();
    return new CompanyContact(
      id,
      props.tenantId,
      props.name,
      props.industry,
      props.taxNumber,
      props.phone,
      props.email,
      props.address,
      props.city,
      props.state,
      props.zip,
      props.country,
      now,
      now,
      props.ownerId,
      CompanyContact.documentNumberFrom(props.taxNumber),
    );
  }
}
