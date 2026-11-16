// D-10: bcrypt con coste 12 (2^12 rondas). Antes se usaba 10.
const BCRYPT_COST = 12;

import { IHashService } from '../../application/ports/services/IHashService.js';
import bcrypt from 'bcryptjs';

export class BcryptHashService implements IHashService {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
