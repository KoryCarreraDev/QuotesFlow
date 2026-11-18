import { readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '@/app.js';
import prisma from '@/config/database.js';
import { env } from '@/config/env.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { LOGO_MAXIMUM_BYTES } from '@/domain/value-objects/logoImage.js';
import { buildJpeg, buildPngHeader } from '@tests/support/builders/imageFixtures.js';
import {
  TEST_LOGO_PNG,
  type TenantWithTeam,
  persistTenantWithTeam,
} from '@tests/support/database/persistenceFactories.js';
import { sessionCookieFor } from '@tests/support/http/apiClient.js';
import { apiPaths } from '@tests/support/http/apiRoutes.js';

// F3-T07: logo de la empresa. Permisos por rol y aislamiento: suites de `tests/api/security/`.

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const LOGO_WIDTH = 300;
const LOGO_HEIGHT = 100;
const HTTP_UNAUTHORIZED = 401;
const HUGE_SIDE = 10_000;

async function filesOf(tenantId: string): Promise<string[]> {
  try {
    return await readdir(path.resolve(env.FILE_STORAGE_DIRECTORY, 'logos', tenantId));
  } catch {
    return [];
  }
}

describe('API del logo de la empresa', () => {
  let company: TenantWithTeam;
  let ownerCookie: string;
  let salesRepCookie: string;

  beforeEach(async () => {
    company = await persistTenantWithTeam();
    ownerCookie = sessionCookieFor(company.owner);
    salesRepCookie = sessionCookieFor(company.salesRep);
  });

  function uploadLogo(cookie: string, content: Buffer, filename = 'logo.png', contentType = 'image/png') {
    return request(app)
      .put(apiPaths.tenant.logo)
      .set('Cookie', cookie)
      .attach('file', content, { filename, contentType });
  }

  it('el dueño sube un PNG: el perfil lo anuncia con una ruta y nunca con la clave interna', async () => {
    const response = await uploadLogo(ownerCookie, TEST_LOGO_PNG);

    expect(response.status).toBe(HTTP_OK);
    expect(response.body.logoUrl).toBe(apiPaths.tenant.logo);
    expect(JSON.stringify(response.body)).not.toContain('logos/');
    const profile = await request(app).get(apiPaths.tenant.profile).set('Cookie', salesRepCookie);
    expect(profile.body.logoUrl).toBe(apiPaths.tenant.logo);
    expect(profile.body).not.toHaveProperty('logoKey');
    const stored = await prisma.tenant.findUniqueOrThrow({ where: { id: company.tenant.id } });
    expect(stored.logoUrl?.startsWith(`logos/${company.tenant.id}/`)).toBe(true);
    expect(stored.logoUrl).toMatch(/.png$/);
  });

  it('todo el equipo descarga la imagen con su tipo, privada y sin que el navegador la reinterprete', async () => {
    await uploadLogo(ownerCookie, TEST_LOGO_PNG);

    const response = await request(app)
      .get(apiPaths.tenant.logo)
      .set('Cookie', salesRepCookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('private, max-age=300');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(response.body).equals(TEST_LOGO_PNG)).toBe(true);
  });

  it('un JPEG se sirve como image/jpeg', async () => {
    const jpeg = buildJpeg(LOGO_WIDTH, LOGO_HEIGHT);
    await uploadLogo(ownerCookie, jpeg, 'logo.jpg', 'image/jpeg');

    const response = await request(app).get(apiPaths.tenant.logo).set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_OK);
    expect(response.headers['content-type']).toBe('image/jpeg');
  });

  it('sin logo responde 404 LOGO_NOT_FOUND', async () => {
    const response = await request(app).get(apiPaths.tenant.logo).set('Cookie', ownerCookie);

    expect(response.status).toBe(HTTP_NOT_FOUND);
    expect(response.body.error.code).toBe(ErrorCode.LOGO_NOT_FOUND);
  });

  it('reemplazar el logo deja un solo archivo en el almacenamiento', async () => {
    await uploadLogo(ownerCookie, TEST_LOGO_PNG);
    await uploadLogo(ownerCookie, buildJpeg(LOGO_WIDTH, LOGO_HEIGHT), 'otro.jpg', 'image/jpeg');

    const files = await filesOf(company.tenant.id);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.jpg$/);
  });

  it('quitar el logo borra el archivo y la clave; repetirlo no falla', async () => {
    await uploadLogo(ownerCookie, TEST_LOGO_PNG);

    const removed = await request(app).delete(apiPaths.tenant.logo).set('Cookie', ownerCookie);
    const again = await request(app).delete(apiPaths.tenant.logo).set('Cookie', ownerCookie);
    const read = await request(app).get(apiPaths.tenant.logo).set('Cookie', ownerCookie);

    expect([removed.status, again.status, read.status]).toEqual([HTTP_NO_CONTENT, HTTP_NO_CONTENT, HTTP_NOT_FOUND]);
    expect(await filesOf(company.tenant.id)).toEqual([]);
    await expect(prisma.tenant.findUniqueOrThrow({ where: { id: company.tenant.id } })).resolves.toMatchObject({
      logoUrl: null,
    });
  });

  it('subir y quitar el logo quedan auditados sin datos del archivo', async () => {
    await uploadLogo(ownerCookie, TEST_LOGO_PNG);
    await request(app).delete(apiPaths.tenant.logo).set('Cookie', ownerCookie);

    const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });

    expect(entries.map((entry) => entry.action)).toEqual(['TENANT_LOGO_UPDATED', 'TENANT_LOGO_REMOVED']);
    expect(entries[0].metadata).toMatchObject({ format: 'png' });
  });

  it('rechaza lo que no es un PNG o JPEG por su contenido, diga lo que diga el cliente', async () => {
    const attempts = [
      uploadLogo(ownerCookie, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'logo.png', 'image/png'),
      uploadLogo(ownerCookie, Buffer.from('MZ ejecutable'), 'logo.jpg', 'image/jpeg'),
      uploadLogo(ownerCookie, buildPngHeader(0, 0)),
      uploadLogo(ownerCookie, buildPngHeader(HUGE_SIDE, HUGE_SIDE)),
      uploadLogo(ownerCookie, Buffer.concat([TEST_LOGO_PNG, Buffer.alloc(LOGO_MAXIMUM_BYTES)])),
    ];

    const responses = await Promise.all(attempts);

    for (const response of responses) {
      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_LOGO_IMAGE);
    }
    expect(await filesOf(company.tenant.id)).toEqual([]);
  });

  it('rechaza una petición sin archivo, con otro nombre de campo o que no es multipart', async () => {
    const noFile = await request(app).put(apiPaths.tenant.logo).set('Cookie', ownerCookie);
    const otherField = await request(app)
      .put(apiPaths.tenant.logo)
      .set('Cookie', ownerCookie)
      .attach('imagen', TEST_LOGO_PNG, 'logo.png');
    const json = await request(app).put(apiPaths.tenant.logo).set('Cookie', ownerCookie).send({ file: 'x' });
    const extraField = await request(app)
      .put(apiPaths.tenant.logo)
      .set('Cookie', ownerCookie)
      .field('nota', 'hola')
      .attach('file', TEST_LOGO_PNG, 'logo.png');

    for (const response of [noFile, otherField, json, extraField]) {
      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_LOGO_IMAGE);
    }
  });

  it('un comercial no sube ni quita el logo, aunque sí lo ve', async () => {
    await uploadLogo(ownerCookie, TEST_LOGO_PNG);

    const upload = await uploadLogo(salesRepCookie, TEST_LOGO_PNG);
    const remove = await request(app).delete(apiPaths.tenant.logo).set('Cookie', salesRepCookie);
    const read = await request(app).get(apiPaths.tenant.logo).set('Cookie', salesRepCookie);

    expect([upload.status, remove.status, read.status]).toEqual([HTTP_FORBIDDEN, HTTP_FORBIDDEN, HTTP_OK]);
    expect(await filesOf(company.tenant.id)).toHaveLength(1);
  });

  it('una petición sin sesión no sube nada', async () => {
    const response = await request(app).put(apiPaths.tenant.logo).attach('file', TEST_LOGO_PNG, 'logo.png');

    expect(response.status).toBe(HTTP_UNAUTHORIZED);
    expect(await filesOf(company.tenant.id)).toEqual([]);
  });
});
