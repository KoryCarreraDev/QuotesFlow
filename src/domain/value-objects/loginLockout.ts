// Bloqueo progresivo de cuenta tras intentos de login fallidos (F2-T03, H7).
//
// Los primeros fallos no bloquean (un usuario se equivoca). A partir del quinto, cada fallo bloquea la cuenta
// el doble de tiempo que el anterior, hasta un tope: frena la prueba de contraseñas sobre una cuenta aunque
// venga de muchas IP. El tope es corto a propósito: un atacante también puede bloquear la cuenta de otro.

/** Fallos seguidos que se toleran sin bloquear. */
export const FAILED_LOGINS_BEFORE_LOCK = 4;
const FIRST_LOCK_MS = 60_000;
const MAXIMUM_LOCK_MS = 900_000;
const LOCK_GROWTH_FACTOR = 2;

/**
 * Cuánto se bloquea la cuenta tras `failedAttempts` fallos seguidos; `undefined` si todavía no se bloquea.
 * 5 fallos: 1 min; 6: 2 min; 7: 4 min; 8: 8 min; 9 o más: 15 min.
 */
export function lockDurationAfterFailedLogins(failedAttempts: number): number | undefined {
  const failuresOverTolerance = failedAttempts - FAILED_LOGINS_BEFORE_LOCK;
  if (failuresOverTolerance < 1) return undefined;
  return Math.min(FIRST_LOCK_MS * LOCK_GROWTH_FACTOR ** (failuresOverTolerance - 1), MAXIMUM_LOCK_MS);
}
