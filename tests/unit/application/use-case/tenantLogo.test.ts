import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditAction } from '@/application/ports/services/IAuditLogger.js';
import {
  GetTenantLogoUseCase,
  RemoveTenantLogoUseCase,
  UploadTenantLogoUseCase,
} from '@/application/use-case/tenant/TenantLogoUseCases.js';
import { Role } from '@/domain/enums/Role.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { LOGO_MAXIMUM_BYTES, LOGO_MAXIMUM_SIDE_PIXELS, inspectLogoImage } from '@/domain/value-objects/logoImage.js';
import { LocalDiskFileStorage } from '@/infrastructure/services/LocalDiskFileStorage.js';
import { DEFAULT_TEST_TENANT_ID } from '@tests/support/builders/entityBuilders.js';
import { buildJpeg, buildPngHeader } from '@tests/support/builders/imageFixtures.js';
import { FixedTenantContext } from '@tests/support/doubles/FixedTenantContext.js';
import { InMemoryFileStorage } from '@tests/support/doubles/InMemoryFileStorage.js';
import { InMemoryTenantProfileRepository } from '@tests/support/doubles/InMemoryTenantProfileRepository.js';
import { RecordingAuditLogger } from '@tests/support/doubles/RecordingAuditLogger.js';
import { RecordingLogger } from '@tests/support/doubles/RecordingLogger.js';
import { RecordingTransactionManager } from '@tests/support/doubles/RecordingTransactionManager.js';

// F3-T07: logo de la empresa.

const LOGO_WIDTH = 400;
const LOGO_HEIGHT = 120;
const OVERSIZED_SIDE = LOGO_MAXIMUM_SIDE_PIXELS + 1;
const TRUNCATED_LENGTH = 20;
const ORIGINAL_AND_NEW_FILES = 2;
const MAXIMUM_PIXEL_SIDE = 0xffffffff;
const owner = { role: Role.OWNER, userId: 'owner-id' };
const partner = { role: Role.PARTNER, userId: 'partner-id' };
const salesLeader = { role: Role.SALES_LEADER, userId: 'leader-id' };
const salesRep = { role: Role.SALES_REP, userId: 'rep-id' };

describe('inspectLogoImage', () => {
  it('reconoce un PNG y lee sus medidas', () => {
    expect(inspectLogoImage(buildPngHeader(LOGO_WIDTH, LOGO_HEIGHT))).toEqual({
      format: 'png',
      contentType: 'image/png',
      extension: 'png',
      width: LOGO_WIDTH,
      height: LOGO_HEIGHT,
    });
  });

  it('reconoce un JPEG y lee sus medidas, saltando los segmentos previos', () => {
    expect(inspectLogoImage(buildJpeg(LOGO_WIDTH, LOGO_HEIGHT))).toEqual({
      format: 'jpeg',
      contentType: 'image/jpeg',
      extension: 'jpg',
      width: LOGO_WIDTH,
      height: LOGO_HEIGHT,
    });
  });

  it.each([
    ['vacío', Buffer.alloc(0)],
    ['texto', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['GIF', Buffer.from('GIF89a', 'ascii')],
    ['PNG truncado', buildPngHeader(LOGO_WIDTH, LOGO_HEIGHT).subarray(0, TRUNCATED_LENGTH)],
    ['JPEG truncado', buildJpeg(LOGO_WIDTH, LOGO_HEIGHT).subarray(0, TRUNCATED_LENGTH)],
    ['PNG sin ancho', buildPngHeader(0, LOGO_HEIGHT)],
    ['PNG con alto cero', buildPngHeader(LOGO_WIDTH, 0)],
    ['PNG demasiado ancho', buildPngHeader(OVERSIZED_SIDE, LOGO_HEIGHT)],
    ['PNG demasiado alto', buildPngHeader(LOGO_WIDTH, OVERSIZED_SIDE)],
    ['JPEG demasiado grande en píxeles', buildJpeg(OVERSIZED_SIDE, OVERSIZED_SIDE)],
    ['PNG con 4 mil millones de píxeles', buildPngHeader(MAXIMUM_PIXEL_SIDE, MAXIMUM_PIXEL_SIDE)],
  ])('rechaza %s', (_description, content) => {
    expect(inspectLogoImage(content)).toBeUndefined();
  });

  it('rechaza un archivo por encima del tamaño máximo aunque su cabecera sea válida', () => {
    const header = buildPngHeader(LOGO_WIDTH, LOGO_HEIGHT);

    const oversized = Buffer.concat([header, Buffer.alloc(LOGO_MAXIMUM_BYTES)]);

    expect(inspectLogoImage(oversized)).toBeUndefined();
  });

  it('un JPEG con un segmento de longitud cero no hace bucle infinito', () => {
    const corrupt = Buffer.concat([Buffer.from('ffd8ffe00000', 'hex'), Buffer.alloc(TRUNCATED_LENGTH)]);

    expect(inspectLogoImage(corrupt)).toBeUndefined();
  });
});

describe('LocalDiskFileStorage', () => {
  const directories: string[] = [];

  async function createStorage() {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quotesflow-storage-test-'));
    directories.push(directory);
    return { directory, storage: new LocalDiskFileStorage(directory) };
  }

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it('guarda, lee y borra un archivo, deduciendo el tipo de la extensión', async () => {
    const { storage } = await createStorage();
    const content = Buffer.from('contenido');

    await storage.save('logos/tenant-1/logo.png', content, 'image/png');
    const stored = await storage.read('logos/tenant-1/logo.png');
    await storage.delete('logos/tenant-1/logo.png');

    expect(stored?.contentType).toBe('image/png');
    expect(Buffer.from(stored?.content ?? []).equals(content)).toBe(true);
    await expect(storage.read('logos/tenant-1/logo.png')).resolves.toBeNull();
  });

  it('reemplazar un archivo deja solo el nuevo y ningún temporal', async () => {
    const { directory, storage } = await createStorage();

    await storage.save('logos/t/logo.jpg', Buffer.from('uno'), 'image/jpeg');
    await storage.save('logos/t/logo.jpg', Buffer.from('dos'), 'image/jpeg');

    expect(await readdir(path.join(directory, 'logos', 't'))).toEqual(['logo.jpg']);
    expect((await storage.read('logos/t/logo.jpg'))?.content.toString()).toBe('dos');
  });

  it('leer o borrar lo que no existe no falla', async () => {
    const { storage } = await createStorage();

    await expect(storage.read('logos/no/existe.png')).resolves.toBeNull();
    await expect(storage.delete('logos/no/existe.png')).resolves.toBeUndefined();
  });

  it.each([
    '../fuera.png',
    'logos/../../fuera.png',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    'logos\\tenant\\logo.png',
    'logos//logo.png',
    '.oculto/logo.png',
    'logos/Logo.PNG',
    'logos/logo.png\0',
    '',
    `logos/${'a'.repeat(LOGO_MAXIMUM_BYTES)}`,
  ])('rechaza la clave insegura %j', async (key) => {
    const { directory, storage } = await createStorage();
    await writeFile(path.join(directory, 'secreto.txt'), 'no tocar');

    await expect(storage.save(key, Buffer.from('x'), 'image/png')).rejects.toThrow('Unsafe storage key');
    await expect(storage.read(key)).rejects.toThrow('Unsafe storage key');
    await expect(storage.delete(key)).rejects.toThrow('Unsafe storage key');
    await expect(readFile(path.join(directory, 'secreto.txt'), 'utf8')).resolves.toBe('no tocar');
  });

  it('assertWritable comprueba que se puede escribir y no deja archivos (F3-A18)', async () => {
    const { directory, storage } = await createStorage();

    await expect(storage.assertWritable()).resolves.toBeUndefined();

    expect(await readdir(directory)).toEqual([]);
  });

  it('assertWritable falla con un mensaje claro si la carpeta no es escribible', async () => {
    const { directory } = await createStorage();
    const occupiedByAFile = path.join(directory, 'archivo.txt');
    await writeFile(occupiedByAFile, 'no soy una carpeta');

    await expect(new LocalDiskFileStorage(occupiedByAFile).assertWritable()).rejects.toThrow(
      'File storage directory is not writable',
    );
  });

  it('un archivo con otra extensión se sirve como binario genérico', async () => {
    const { storage } = await createStorage();

    await storage.save('files/data.bin', Buffer.from('x'), 'application/octet-stream');

    await expect(storage.read('files/data.bin')).resolves.toMatchObject({ contentType: 'application/octet-stream' });
  });
});

function setup() {
  const tenantContext = new FixedTenantContext(DEFAULT_TEST_TENANT_ID);
  const profiles = new InMemoryTenantProfileRepository();
  const storage = new InMemoryFileStorage();
  const auditLogger = new RecordingAuditLogger();
  const transactionManager = new RecordingTransactionManager();
  const logger = new RecordingLogger();
  return {
    profiles,
    storage,
    auditLogger,
    transactionManager,
    logger,
    upload: new UploadTenantLogoUseCase(profiles, storage, tenantContext, transactionManager, auditLogger, logger),
    remove: new RemoveTenantLogoUseCase(profiles, storage, transactionManager, auditLogger, logger),
    get: new GetTenantLogoUseCase(profiles, storage),
  };
}

const png = () => buildPngHeader(LOGO_WIDTH, LOGO_HEIGHT);

describe('Subir el logo', () => {
  it('guarda el archivo con una clave de la empresa, la deja en el perfil y audita sin datos del archivo', async () => {
    const context = setup();

    const profile = await context.upload.execute(owner, png());

    expect(profile.logoUrl).toBe('/api/v1/tenant/logo');
    expect(profile).not.toHaveProperty('logoKey');
    const [key] = context.storage.keys();
    expect(key.startsWith(`logos/${DEFAULT_TEST_TENANT_ID}/`)).toBe(true);
    expect(key).toMatch(/.png$/);
    expect((await context.profiles.findCurrent())?.logoKey).toBe(key);
    expect(context.auditLogger.entries).toEqual([
      expect.objectContaining({ action: AuditAction.TENANT_LOGO_UPDATED, metadata: { format: 'png' } }),
    ]);
  });

  it('un JPEG se guarda con extensión jpg', async () => {
    const context = setup();

    await context.upload.execute(partner, buildJpeg(LOGO_WIDTH, LOGO_HEIGHT));

    expect(context.storage.keys()[0]).toMatch(/\.jpg$/);
  });

  it('el tipo sale del contenido: texto o SVG se rechazan aunque el cliente diga que es una imagen', async () => {
    const context = setup();

    await expect(context.upload.execute(owner, Buffer.from('<svg onload="alert(1)"></svg>'))).rejects.toMatchObject({
      code: ErrorCode.INVALID_LOGO_IMAGE,
    });
    expect(context.storage.keys()).toEqual([]);
    expect(context.auditLogger.entries).toEqual([]);
  });

  it('reemplazar el logo borra el archivo anterior solo después de confirmar el cambio', async () => {
    const context = setup();
    await context.upload.execute(owner, png());
    const [previousKey] = context.storage.keys();

    await context.upload.execute(owner, buildJpeg(LOGO_WIDTH, LOGO_HEIGHT));

    expect(context.storage.keys()).toHaveLength(1);
    expect(context.storage.keys()).not.toContain(previousKey);
  });

  it('el archivo que se borra es el que devuelve el cambio, no el que se leyó antes: dos subidas encadenadas no dejan huérfanos (F3-A19)', async () => {
    const context = setup();
    await context.upload.execute(owner, png());
    const [originalKey] = context.storage.keys();
    // Otra subida confirma entre la lectura del perfil y este cambio: el cambio ve su clave, no la original.
    const interleavedKey = 'logos/tenant/otra-subida.png';
    await context.storage.save(interleavedKey, png(), 'image/png');
    const update = context.profiles.updateLogoKey.bind(context.profiles);
    vi.spyOn(context.profiles, 'updateLogoKey').mockImplementationOnce(async (key) => {
      await update(interleavedKey);
      return update(key);
    });

    await context.upload.execute(owner, buildJpeg(LOGO_WIDTH, LOGO_HEIGHT));

    const remaining = context.storage.keys();
    expect(remaining).toHaveLength(ORIGINAL_AND_NEW_FILES);
    expect(remaining).toContain(originalKey);
    expect(remaining).not.toContain(interleavedKey);
  });

  it('si guardar la clave falla, el archivo nuevo se borra y el logo anterior sigue', async () => {
    const context = setup();
    await context.upload.execute(owner, png());
    const [previousKey] = context.storage.keys();
    context.auditLogger.record = async () => {
      throw new Error('audit failure');
    };

    await expect(context.upload.execute(owner, buildJpeg(LOGO_WIDTH, LOGO_HEIGHT))).rejects.toThrow('audit failure');

    expect(context.storage.keys()).toEqual([previousKey]);
  });

  it('si no se puede guardar el archivo, el perfil no cambia', async () => {
    const context = setup();
    context.storage.failNextSave = true;

    await expect(context.upload.execute(owner, png())).rejects.toThrow('simulated storage failure');

    expect((await context.profiles.findCurrent())?.logoKey).toBeUndefined();
  });

  it('si no se puede borrar el archivo anterior, el cambio sigue adelante y queda un aviso', async () => {
    const context = setup();
    await context.upload.execute(owner, png());
    context.storage.failNextDelete = true;

    await expect(context.upload.execute(owner, png())).resolves.toBeDefined();

    expect(context.logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('solo dueño y socio la suben', async () => {
    const context = setup();

    for (const actor of [salesLeader, salesRep]) {
      await expect(context.upload.execute(actor, png())).rejects.toMatchObject({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
      });
    }
    expect(context.storage.keys()).toEqual([]);
  });
});

describe('Quitar el logo', () => {
  it('borra el archivo y la clave, y lo audita', async () => {
    const context = setup();
    await context.upload.execute(owner, png());
    context.auditLogger.entries.length = 0;

    await context.remove.execute(partner);

    expect(context.storage.keys()).toEqual([]);
    expect((await context.profiles.findCurrent())?.logoKey).toBeUndefined();
    expect(context.auditLogger.entries.map((entry) => entry.action)).toEqual([AuditAction.TENANT_LOGO_REMOVED]);
  });

  it('sin logo no hace nada ni audita', async () => {
    const context = setup();

    await context.remove.execute(owner);

    expect(context.auditLogger.entries).toEqual([]);
  });

  it('solo dueño y socio lo quitan', async () => {
    const context = setup();

    await expect(context.remove.execute(salesRep)).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_PERMISSIONS });
  });
});

describe('Ver el logo', () => {
  it('todo el equipo lo ve', async () => {
    const context = setup();
    await context.upload.execute(owner, png());

    for (const actor of [owner, partner, salesLeader, salesRep]) {
      await expect(context.get.execute(actor)).resolves.toMatchObject({ contentType: 'image/png' });
    }
  });

  it('sin logo, o con el archivo perdido, responde LOGO_NOT_FOUND', async () => {
    const context = setup();
    await expect(context.get.execute(salesRep)).rejects.toMatchObject({ code: ErrorCode.LOGO_NOT_FOUND });

    await context.upload.execute(owner, png());
    await context.storage.delete(context.storage.keys()[0]);

    await expect(context.get.execute(salesRep)).rejects.toMatchObject({ code: ErrorCode.LOGO_NOT_FOUND });
  });
});
