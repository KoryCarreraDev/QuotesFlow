import { IHashService } from '@/application/ports/services/IHashService.js';

const FAKE_HASH_PREFIX = 'fake-hash:';

/** Hash determinista y reversible a simple vista: suficiente para comprobar que nunca se guarda el texto plano. */
export class FakeHashService implements IHashService {
  async hash(plain: string): Promise<string> {
    return `${FAKE_HASH_PREFIX}${plain}`;
  }

  /** Veces que se llamó a `compareWithoutHash`: el login debe gastar el mismo trabajo aunque no haya cuenta (H22). */
  comparisonsWithoutHash = 0;

  async compare(plain: string, hash: string): Promise<boolean> {
    return hash === `${FAKE_HASH_PREFIX}${plain}`;
  }

  async compareWithoutHash(): Promise<false> {
    this.comparisonsWithoutHash += 1;
    return false;
  }
}
