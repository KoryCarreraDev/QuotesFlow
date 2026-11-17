import { IBreachedPasswordChecker } from '@/application/ports/services/IBreachedPasswordChecker.js';

/** Doble de `IBreachedPasswordChecker`: solo las contraseñas indicadas cuentan como filtradas. */
export class FakeBreachedPasswordChecker implements IBreachedPasswordChecker {
  private readonly breachedPasswords: Set<string>;

  constructor(...breachedPasswords: string[]) {
    this.breachedPasswords = new Set(breachedPasswords);
  }

  async isBreached(password: string): Promise<boolean> {
    return this.breachedPasswords.has(password);
  }
}
