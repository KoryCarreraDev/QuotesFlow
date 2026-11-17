/**
 * Indica si una contraseña aparece en filtraciones públicas (D-11, F2-T03). El adaptador de producción
 * consulta Have I Been Pwned por rango (k-anonimato): solo salen los 5 primeros caracteres del SHA-1, nunca la
 * contraseña ni su hash completo.
 *
 * Nunca lanza: si el servicio no responde devuelve `false` y deja un aviso técnico. Decisión registrada en
 * Q-013: una caída del servicio externo no debe impedir registrarse ni cambiar la contraseña.
 */
export interface IBreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>;
}
