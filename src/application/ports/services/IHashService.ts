/**
 * Cifrado de contraseñas en un solo sentido (bcrypt, D-10) y su comprobación.
 */
export interface IHashService {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
