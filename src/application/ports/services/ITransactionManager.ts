/**
 * Ejecuta varias escrituras como una sola unidad: o se confirman todas o no queda ninguna.
 *
 * Los repositorios usan la transacción abierta sin recibirla como parámetro, así que el caso de uso
 * solo envuelve su trabajo y no conoce la base de datos.
 */
export interface ITransactionManager {
  /**
   * Ejecuta `work` dentro de una transacción y devuelve su resultado.
   *
   * Si `work` lanza, se revierte todo lo escrito y se relanza el mismo error. Llamado dentro de otra
   * transacción, se une a ella: no hay transacciones anidadas independientes.
   *
   * No conviene hacer dentro trabajo lento que no toque la base de datos (por ejemplo, cifrar una
   * contraseña): la transacción retiene una conexión y bloqueos mientras dura.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
