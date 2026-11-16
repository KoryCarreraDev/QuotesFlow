import { ErrorCode } from './ErrorCode.js';

/**
 * Error esperado de la aplicación: una regla de negocio, un permiso o una entrada inválida.
 *
 * El manejador de errores de la web lo traduce a su código HTTP y lo devuelve con el formato único
 * `{ error: { code, message } }`. Cualquier otro `Error` se trata como un fallo de programación:
 * responde 500 genérico y su mensaje nunca llega al cliente.
 */
export abstract class ApplicationError extends Error {
  /**
   * @param code Código estable que lee el frontend.
   * @param message Mensaje técnico en inglés; puede llegar al cliente, así que no lleva datos internos.
   * @param options `cause` con el error original, que se queda en el servidor.
   */
  protected constructor(
    readonly code: ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
