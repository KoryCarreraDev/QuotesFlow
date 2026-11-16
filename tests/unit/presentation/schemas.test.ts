import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '@/presentation/schemas/authSchema.js';
import {
  createCompanyContactSchema,
  updateCompanyContactSchema,
} from '@/presentation/schemas/companyContactSchema.js';
import { createContactSchema, updateContactSchema } from '@/presentation/schemas/contactSchema.js';
import { createLeadSchema, updateLeadSchema } from '@/presentation/schemas/leadSchema.js';
import {
  createLeadStatusConfigSchema,
  updateLeadStatusConfigSchema,
} from '@/presentation/schemas/leadStatusConfigSchema.js';
import { itKnownDefect } from '@tests/support/knownDefect.js';

const VALID_UUID = '22222222-2222-4222-8222-222222222222';
const STRONG_PASSWORD = 'Correct-Horse-Battery-9';

// Campos que solo decide el servidor. Un cliente no debe poder fijarlos desde el cuerpo de la petición.
const serverControlledFields = {
  id: VALID_UUID,
  tenantId: VALID_UUID,
  deleted: 'DELETED',
  createdAt: '2020-01-01T00:00:00.000Z',
};

describe('registerSchema', () => {
  const validRegistration = {
    companyName: 'Aluminios Andinos SAS',
    ownerEmail: 'owner@example.com',
    password: STRONG_PASSWORD,
    ownerFirstName: 'Carlos',
    ownerLastName: 'Pérez',
  };

  it('acepta un registro completo', () => {
    expect(registerSchema.parse(validRegistration)).toEqual(validRegistration);
  });

  it.each(['companyName', 'ownerEmail', 'password', 'ownerFirstName', 'ownerLastName'] as const)(
    'rechaza un registro sin %s',
    (missingField) => {
      const { [missingField]: _omitted, ...incompleteRegistration } = validRegistration;

      expect(registerSchema.safeParse(incompleteRegistration).success).toBe(false);
    },
  );

  it('rechaza un correo con formato inválido', () => {
    expect(registerSchema.safeParse({ ...validRegistration, ownerEmail: 'not-an-email' }).success).toBe(false);
  });

  it('rechaza una contraseña muy corta', () => {
    expect(registerSchema.safeParse({ ...validRegistration, password: 'abc' }).success).toBe(false);
  });

  it('rechaza un nombre de empresa vacío', () => {
    expect(registerSchema.safeParse({ ...validRegistration, companyName: '' }).success).toBe(false);
  });

  it('descarta el rol y el tenant enviados por el cliente', () => {
    const parsedRegistration = registerSchema.parse({ ...validRegistration, role: 'OWNER', ...serverControlledFields });

    expect(parsedRegistration).toEqual(validRegistration);
  });

  itKnownDefect('H7', 'rechaza contraseñas de menos de 12 caracteres (decisión D-11)', () => {
    const elevenCharacterPassword = 'Abcdefgh-12';

    expect(registerSchema.safeParse({ ...validRegistration, password: elevenCharacterPassword }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('acepta correo y contraseña', () => {
    const credentials = { email: 'owner@example.com', password: STRONG_PASSWORD };

    expect(loginSchema.parse(credentials)).toEqual(credentials);
  });

  it('rechaza un correo con formato inválido', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: STRONG_PASSWORD }).success).toBe(false);
  });

  it('rechaza un login sin contraseña', () => {
    expect(loginSchema.safeParse({ email: 'owner@example.com' }).success).toBe(false);
  });
});

describe('createLeadSchema', () => {
  it('acepta un lead solo con el nombre del contacto', () => {
    expect(createLeadSchema.parse({ contactName: 'Ana Gómez' })).toEqual({ contactName: 'Ana Gómez' });
  });

  it('acepta todos los campos y convierte la fecha de cierre en Date', () => {
    const parsedLead = createLeadSchema.parse({
      contactName: 'Ana Gómez',
      companyName: 'Vidrios del Norte',
      email: 'ana@example.com',
      phone: '3001234567',
      statusId: VALID_UUID,
      source: 'Referido',
      assignedToId: VALID_UUID,
      estimatedValue: 2_500_000,
      expectedCloseDate: '2026-06-30T00:00:00.000Z',
      notes: 'Llamar el lunes',
    });

    expect(parsedLead.expectedCloseDate).toEqual(new Date('2026-06-30T00:00:00.000Z'));
    expect(parsedLead.estimatedValue).toBe(2_500_000);
  });

  it('rechaza un lead sin nombre de contacto', () => {
    expect(createLeadSchema.safeParse({ companyName: 'Vidrios del Norte' }).success).toBe(false);
  });

  it.each([
    { field: 'email', invalidValue: 'not-an-email' },
    { field: 'statusId', invalidValue: 'not-a-uuid' },
    { field: 'assignedToId', invalidValue: 'not-a-uuid' },
    { field: 'estimatedValue', invalidValue: '2500000' },
    { field: 'expectedCloseDate', invalidValue: 'not-a-date' },
  ])('rechaza $field con un valor inválido', ({ field, invalidValue }) => {
    expect(createLeadSchema.safeParse({ contactName: 'Ana Gómez', [field]: invalidValue }).success).toBe(false);
  });

  it('descarta los campos que solo decide el servidor', () => {
    const parsedLead = createLeadSchema.parse({ contactName: 'Ana Gómez', ...serverControlledFields });

    expect(parsedLead).toEqual({ contactName: 'Ana Gómez' });
  });
});

describe('updateLeadSchema', () => {
  it('acepta una actualización vacía: todos los campos son opcionales', () => {
    expect(updateLeadSchema.parse({})).toEqual({});
  });

  it('rechaza un correo con formato inválido', () => {
    expect(updateLeadSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('descarta los campos que solo decide el servidor', () => {
    expect(updateLeadSchema.parse({ notes: 'Nota', ...serverControlledFields })).toEqual({ notes: 'Nota' });
  });
});

describe('createLeadStatusConfigSchema', () => {
  it('acepta nombre y orden', () => {
    const status = { name: 'En negociación', order: 3 };

    expect(createLeadStatusConfigSchema.parse(status)).toEqual(status);
  });

  it('acepta color y marca de predeterminado', () => {
    const status = { name: 'En negociación', order: 3, isDefault: true, color: '#0EA5E9' };

    expect(createLeadStatusConfigSchema.parse(status)).toEqual(status);
  });

  it('rechaza un estado sin nombre', () => {
    expect(createLeadStatusConfigSchema.safeParse({ name: '', order: 3 }).success).toBe(false);
  });

  it('rechaza un estado sin orden', () => {
    expect(createLeadStatusConfigSchema.safeParse({ name: 'En negociación' }).success).toBe(false);
  });

  it('rechaza un orden que no es un número', () => {
    expect(createLeadStatusConfigSchema.safeParse({ name: 'En negociación', order: '3' }).success).toBe(false);
  });

  it('descarta los campos que solo decide el servidor', () => {
    const parsedStatus = createLeadStatusConfigSchema.parse({
      name: 'En negociación',
      order: 3,
      ...serverControlledFields,
    });

    expect(parsedStatus).toEqual({ name: 'En negociación', order: 3 });
  });
});

describe('updateLeadStatusConfigSchema', () => {
  it('acepta una actualización parcial', () => {
    expect(updateLeadStatusConfigSchema.parse({ isDefault: true })).toEqual({ isDefault: true });
  });

  it('rechaza una marca de predeterminado que no es booleana', () => {
    expect(updateLeadStatusConfigSchema.safeParse({ isDefault: 'yes' }).success).toBe(false);
  });
});

describe('createContactSchema', () => {
  it('acepta nombre y apellido', () => {
    const contact = { firstName: 'Laura', lastName: 'Martínez' };

    expect(createContactSchema.parse(contact)).toEqual(contact);
  });

  it.each(['firstName', 'lastName'] as const)('rechaza un contacto sin %s', (missingField) => {
    const { [missingField]: _omitted, ...incompleteContact } = { firstName: 'Laura', lastName: 'Martínez' };

    expect(createContactSchema.safeParse(incompleteContact).success).toBe(false);
  });

  it('rechaza un correo con formato inválido', () => {
    expect(
      createContactSchema.safeParse({ firstName: 'Laura', lastName: 'Martínez', email: 'not-an-email' }).success,
    ).toBe(false);
  });

  it('rechaza un id de empresa que no es UUID', () => {
    expect(
      createContactSchema.safeParse({ firstName: 'Laura', lastName: 'Martínez', companyId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('descarta los campos que solo decide el servidor', () => {
    const parsedContact = createContactSchema.parse({
      firstName: 'Laura',
      lastName: 'Martínez',
      ...serverControlledFields,
    });

    expect(parsedContact).toEqual({ firstName: 'Laura', lastName: 'Martínez' });
  });
});

describe('updateContactSchema', () => {
  it('acepta una actualización parcial', () => {
    expect(updateContactSchema.parse({ phone: '3109876543' })).toEqual({ phone: '3109876543' });
  });

  it('rechaza un id de empresa que no es UUID', () => {
    expect(updateContactSchema.safeParse({ companyId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('createCompanyContactSchema', () => {
  it('acepta una empresa solo con nombre', () => {
    expect(createCompanyContactSchema.parse({ name: 'Constructora El Roble' })).toEqual({
      name: 'Constructora El Roble',
    });
  });

  it('rechaza una empresa sin nombre', () => {
    expect(createCompanyContactSchema.safeParse({ city: 'Bogotá' }).success).toBe(false);
  });

  it('rechaza un correo con formato inválido', () => {
    expect(
      createCompanyContactSchema.safeParse({ name: 'Constructora El Roble', email: 'not-an-email' }).success,
    ).toBe(false);
  });

  it('descarta los campos que solo decide el servidor', () => {
    const parsedCompanyContact = createCompanyContactSchema.parse({
      name: 'Constructora El Roble',
      ...serverControlledFields,
    });

    expect(parsedCompanyContact).toEqual({ name: 'Constructora El Roble' });
  });
});

describe('updateCompanyContactSchema', () => {
  it('acepta una actualización parcial', () => {
    expect(updateCompanyContactSchema.parse({ city: 'Medellín' })).toEqual({ city: 'Medellín' });
  });

  it('rechaza un correo con formato inválido', () => {
    expect(updateCompanyContactSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});
