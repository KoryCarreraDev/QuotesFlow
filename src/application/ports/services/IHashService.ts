/**
 * Cifrado de contraseñas en un solo sentido (bcrypt, D-10) y su comprobación.
 */
export interface IHashService {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;

  /**
   * Tarda lo mismo que `compare` y siempre devuelve `false` (H22, F2-T03). El login la usa cuando no hay hash
   * que comprobar (correo inexistente, cuenta bloqueada): así el tiempo de respuesta no revela la causa.
   */
  compareWithoutHash(plain: string): Promise<false>;
}
