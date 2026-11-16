// Tipos de los valores que `databaseContainer.globalSetup.ts` entrega a los archivos de test.

declare module 'vitest' {
  export interface ProvidedContext {
    /** URL de conexión a la base de mantenimiento del contenedor efímero (para crear bases por archivo). */
    testDatabaseAdminUrl: string;
    /** Nombre de la base plantilla que ya tiene todas las migraciones aplicadas. */
    testDatabaseTemplateName: string;
  }
}

export {};
