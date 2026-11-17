import { createHash } from 'node:crypto';
import axios, { type AxiosInstance } from 'axios';
import { IBreachedPasswordChecker } from '../../application/ports/services/IBreachedPasswordChecker.js';
import { ILogger } from '../../application/ports/services/ILogger.js';

/** URL fija de la API de rangos de Have I Been Pwned (API10). */
export const PWNED_PASSWORDS_BASE_URL = 'https://api.pwnedpasswords.com';
const RANGE_PATH = '/range/';
// k-anonimato: solo salen los 5 primeros caracteres del SHA-1 de la contraseña.
const HASH_PREFIX_LENGTH = 5;
// Más que esto retrasaría el registro; ante una demora se acepta la contraseña (Q-013).
const REQUEST_TIMEOUT_MS = 3_000;
const LINE_SEPARATOR = /\r?\n/;
const SUFFIX_COUNT_SEPARATOR = ':';

export interface PwnedPasswordsCheckerOptions {
  /** Solo para los tests, que apuntan a un servidor local. */
  baseUrl?: string;
}

/** Adaptador de `IBreachedPasswordChecker` sobre Have I Been Pwned (D-11, F2-T03). */
export class PwnedPasswordsChecker implements IBreachedPasswordChecker {
  private readonly httpClient: AxiosInstance;

  constructor(
    private readonly logger: ILogger,
    options: PwnedPasswordsCheckerOptions = {},
  ) {
    this.httpClient = axios.create({
      baseURL: options.baseUrl ?? PWNED_PASSWORDS_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      // Con relleno, el tamaño de la respuesta no revela cuántos sufijos coinciden con el prefijo.
      headers: { 'Add-Padding': 'true' },
      responseType: 'text',
      maxRedirects: 0,
    });
  }

  async isBreached(password: string): Promise<boolean> {
    const passwordHash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const hashPrefix = passwordHash.slice(0, HASH_PREFIX_LENGTH);
    const hashSuffix = passwordHash.slice(HASH_PREFIX_LENGTH);

    try {
      const response = await this.httpClient.get<string>(`${RANGE_PATH}${hashPrefix}`);
      return typeof response.data === 'string' && rangeContains(response.data, hashSuffix);
    } catch {
      this.logger.warn('Breached password check unavailable; password accepted', { provider: 'pwnedpasswords' });
      return false;
    }
  }
}

/** Busca el sufijo en la lista `SUFIJO:VECES`; las líneas de relleno llevan 0 veces y no cuentan. */
function rangeContains(rangeBody: string, hashSuffix: string): boolean {
  return rangeBody.split(LINE_SEPARATOR).some((line) => {
    const [suffix, count] = line.trim().split(SUFFIX_COUNT_SEPARATOR);
    return suffix === hashSuffix && Number(count) > 0;
  });
}

/** `PASSWORD_BREACH_CHECK=off`: no consulta nada (tests y entornos sin salida a internet). */
export class DisabledBreachedPasswordChecker implements IBreachedPasswordChecker {
  async isBreached(): Promise<boolean> {
    return false;
  }
}
