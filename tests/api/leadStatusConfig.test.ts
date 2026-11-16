import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { NON_EXISTENT_ID } from '@tests/support/builders/entityBuilders.js';
import { type TenantWithTeam, persistTenantWithTeam } from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const FIRST_FREE_ORDER = 6;

describe('API de estados de lead', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;

  async function listDefaultStatusNames(): Promise<string[]> {
    const defaultStatuses = await prisma.leadStatusConfig.findMany({
      where: { tenantId: company.tenant.id, isDefault: true },
    });
    return defaultStatuses.map((status) => status.name);
  }

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
  });

  describe('GET /api/leadStatusConfig/getAll', () => {
    it('devuelve los estados de la empresa ordenados por su orden', async () => {
      const response = await request(app).get(apiPaths.leadStatusConfigs.getAll).set('Cookie', ownerCookie);

      expect(response.status).toBe(HTTP_OK);
      expect(response.body.map((status: { name: string }) => status.name)).toEqual([
        'Nuevo',
        'Contactado',
        'Calificado',
        'Ganado',
        'Perdido',
      ]);
    });

    it('la respuesta no expone el tenant', async () => {
      const response = await request(app).get(apiPaths.leadStatusConfigs.getAll).set('Cookie', ownerCookie);

      expect(Object.keys(response.body[0])).not.toContain('tenantId');
    });
  });

  describe('POST /api/leadStatusConfig/create', () => {
    it('crea el estado en la empresa del usuario y responde 201', async () => {
      const response = await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'En negociación', order: FIRST_FREE_ORDER, color: '#0EA5E9' });

      expect(response.status).toBe(HTTP_CREATED);
      expect(response.body).toMatchObject({ name: 'En negociación', order: FIRST_FREE_ORDER, color: '#0EA5E9' });
      const storedStatus = await prisma.leadStatusConfig.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(storedStatus.tenantId).toBe(company.tenant.id);
      expect(storedStatus.isDefault).toBe(false);
    });

    it('crear un estado predeterminado desmarca el anterior', async () => {
      await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'Entrante', order: FIRST_FREE_ORDER, isDefault: true });

      await expect(listDefaultStatusNames()).resolves.toEqual(['Entrante']);
    });

    it('rechaza un orden que ya usa otro estado de la empresa', async () => {
      const response = await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'Duplicado', order: company.defaultLeadStatus.order });

      expect(response.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
      await expect(prisma.leadStatusConfig.count({ where: { tenantId: company.tenant.id } })).resolves.toBe(
        company.leadStatuses.length,
      );
    });

    it('responde 400 si falta el orden', async () => {
      const response = await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'En negociación' });

      expect(response.status).toBe(HTTP_BAD_REQUEST);
    });

    it('si falla la creación de un estado predeterminado, la empresa conserva su predeterminado anterior', async () => {
      await request(app)
        .post(apiPaths.leadStatusConfigs.create)
        .set('Cookie', ownerCookie)
        .send({ name: 'Duplicado', order: company.defaultLeadStatus.order, isDefault: true });

      await expect(listDefaultStatusNames()).resolves.toEqual(['Nuevo']);
    });
  });

  describe('PATCH /api/leadStatusConfig/update/:id', () => {
    it('actualiza los campos enviados y conserva el resto', async () => {
      const [, contactedStatus] = company.leadStatuses;

      const response = await request(app)
        .patch(apiPaths.leadStatusConfigs.update(contactedStatus.id))
        .set('Cookie', ownerCookie)
        .send({ name: 'Primer contacto' });

      expect(response.status).toBe(HTTP_OK);
      expect(response.body).toMatchObject({
        id: contactedStatus.id,
        name: 'Primer contacto',
        order: contactedStatus.order,
        color: contactedStatus.color,
      });
    });

    it('marcar otro estado como predeterminado desmarca el anterior', async () => {
      const [, contactedStatus] = company.leadStatuses;

      await request(app)
        .patch(apiPaths.leadStatusConfigs.update(contactedStatus.id))
        .set('Cookie', ownerCookie)
        .send({ isDefault: true });

      await expect(listDefaultStatusNames()).resolves.toEqual(['Contactado']);
    });

    it('no permite dejar a la empresa sin estado predeterminado', async () => {
      const response = await request(app)
        .patch(apiPaths.leadStatusConfigs.update(company.defaultLeadStatus.id))
        .set('Cookie', ownerCookie)
        .send({ isDefault: false });

      expect(response.status).toBeGreaterThanOrEqual(HTTP_BAD_REQUEST);
      await expect(listDefaultStatusNames()).resolves.toEqual(['Nuevo']);
    });

    it('responde 404 si el estado no existe', async () => {
      const response = await request(app)
        .patch(apiPaths.leadStatusConfigs.update(NON_EXISTENT_ID))
        .set('Cookie', ownerCookie)
        .send({ name: 'Primer contacto' });

      expect(response.status).toBe(HTTP_NOT_FOUND);
    });
  });
});
