import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IFileStorage, StoredFile } from '../../application/ports/services/IFileStorage.js';

// Cada segmento de la clave (separados por `/`): letras minúsculas, dígitos y `- _ .`, sin empezar por punto. Excluye
// `..`, rutas absolutas, barras invertidas y cualquier carácter raro: la clave la arma la aplicación, pero este
// adaptador no confía en ello.
const SAFE_SEGMENT_PATTERN = /^[a-z0-9_-][a-z0-9_.-]*$/;
const KEY_SEPARATOR = '/';
const MAXIMUM_KEY_LENGTH = 200;
const FALLBACK_CONTENT_TYPE = 'application/octet-stream';

const CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Adaptador de `IFileStorage` sobre una carpeta del disco (F3-T07). Para desarrollo y pruebas: en producción lo
 * reemplaza un adaptador de almacenamiento de objetos. El tipo del archivo se deduce de la extensión de la clave.
 */
export class LocalDiskFileStorage implements IFileStorage {
  private readonly rootDirectory: string;

  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
  }

  /**
   * @throws {Error} Si la clave no es segura o resolvería fuera de la carpeta raíz.
   */
  private pathFor(key: string): string {
    const isSafe =
      key.length <= MAXIMUM_KEY_LENGTH &&
      key.split(KEY_SEPARATOR).every((segment) => SAFE_SEGMENT_PATTERN.test(segment));
    if (!isSafe) throw new Error('Unsafe storage key');
    const filePath = path.resolve(this.rootDirectory, key);
    if (!filePath.startsWith(this.rootDirectory + path.sep)) throw new Error('Unsafe storage key');
    return filePath;
  }

  async save(key: string, content: Uint8Array, _contentType: string): Promise<void> {
    const filePath = this.pathFor(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    // Se escribe aparte y se renombra: una lectura nunca ve un archivo a medias.
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, content);
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async read(key: string): Promise<StoredFile | null> {
    const filePath = this.pathFor(key);
    try {
      const content = await readFile(filePath);
      const contentType = CONTENT_TYPE_BY_EXTENSION.get(path.extname(filePath)) ?? FALLBACK_CONTENT_TYPE;
      return { content, contentType };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
