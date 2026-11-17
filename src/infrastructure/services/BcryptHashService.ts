import bcrypt from 'bcryptjs';
import { IHashService } from '../../application/ports/services/IHashService.js';

// D-10: bcrypt con coste 12 (2^12 rondas). Antes se usaba 10.
const BCRYPT_COST = 12;
// Texto cualquiera: solo importa que su hash tenga el mismo coste que los reales.
const TIMING_EQUALIZER_SECRET = 'timing-equalizer-for-missing-accounts';

// Uno por proceso y calculado una sola vez: hacerlo en cada login duplicaría su coste.
let timingEqualizerHash: Promise<string> | undefined;

function equalizerHash(): Promise<string> {
  timingEqualizerHash ??= bcrypt.hash(TIMING_EQUALIZER_SECRET, BCRYPT_COST);
  return timingEqualizerHash;
}

export class BcryptHashService implements IHashService {
  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async compareWithoutHash(plain: string): Promise<false> {
    // Compara de verdad contra un hash del mismo coste (H22): el tiempo es el de un login con cuenta.
    await bcrypt.compare(plain, await equalizerHash());
    return false;
  }
}
