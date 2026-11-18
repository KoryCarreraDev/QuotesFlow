/** Archivo leído del almacenamiento. */
export interface StoredFile {
  content: Uint8Array;
  contentType: string;
}

/**
 * Almacenamiento de archivos (F3-T07, D-26): logos de las empresas y, más adelante, otros adjuntos. La clave la
 * decide la aplicación (`logos/<tenantId>/<id>.png`) y nunca es una ruta que escriba el cliente.
 *
 * Hoy hay un adaptador en disco local (Q-017: mientras dure el desarrollo); uno compatible con S3 (Cloudflare R2)
 * implementará este mismo puerto cuando se despliegue.
 */
export interface IFileStorage {
  /** Guarda el contenido bajo la clave, reemplazando lo que hubiera. */
  save(key: string, content: Uint8Array, contentType: string): Promise<void>;

  /** El archivo, o `null` si no existe. */
  read(key: string): Promise<StoredFile | null>;

  /** Borra el archivo; si no existe, no hace nada. */
  delete(key: string): Promise<void>;
}
