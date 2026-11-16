// Reglas de arquitectura hexagonal (R4 de PLAN.md), comprobadas con `pnpm arch:check` (F0-T04).
// Capas y lo que cada una puede importar: docs/guia-de-codigo.md, sección 8.

const NODE_BUILT_IN = ['core'];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-is-self-contained',
      comment: 'R4: domain/ no importa nada de fuera de domain/ (solo módulos nativos de Node).',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/', dependencyTypesNot: NODE_BUILT_IN },
    },
    {
      name: 'application-depends-only-on-domain',
      comment: 'R4: application/ solo importa application/ y domain/; las librerías externas entran por un puerto.',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { pathNot: '^src/(application|domain)/', dependencyTypesNot: NODE_BUILT_IN },
    },
    {
      name: 'infrastructure-does-not-know-presentation',
      comment: 'R4: los adaptadores no dependen de las rutas ni de los esquemas de presentación.',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/presentation/' },
    },
    {
      name: 'presentation-does-not-touch-persistence',
      comment: 'R4: las rutas llegan a los datos a través de controllers y casos de uso, nunca a un repositorio.',
      severity: 'error',
      from: { path: '^src/presentation/' },
      to: { path: '^src/infrastructure/persistence/' },
    },
    {
      name: 'no-circular',
      comment: 'Un ciclo de imports rompe la separación en capas y el orden de carga de ESM.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-dev-dependency',
      comment: 'El código de producción no puede depender de devDependencies: no se instalan en la imagen final.',
      severity: 'error',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'], pathNot: ['node_modules/@types/'] },
    },
    {
      name: 'not-to-undeclared-package',
      comment: 'Todo paquete importado debe estar declarado en package.json.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Un import que no resuelve es un error de compilación o de despliegue.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.d\\.ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.js'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
