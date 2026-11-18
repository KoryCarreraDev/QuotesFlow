// Configuración de ESLint (F0-T03). Aplica R2 (tests insaltables), R8 (seguridad) y R13 (código autodocumentado).
// Las violaciones que ya existían el 2026-11-16 están congeladas en `eslint-suppressions.json`:
// no se pueden añadir nuevas, y se eliminan al corregir el código (F1-T15, F1-T18).

import eslintJavaScript from '@eslint/js';
import vitestPlugin from '@vitest/eslint-plugin';
import prettierCompatibility from 'eslint-config-prettier';
import securityPlugin from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import noCommentedOutCode from './eslint-rules/no-commented-out-code.js';

// Números que no necesitan constante con nombre: índices, contadores e incrementos (docs/guia-de-codigo.md, sección 4).
const ALLOWED_PLAIN_NUMBERS = [-1, 0, 1];

const localRulesPlugin = { rules: { 'no-commented-out-code': noCommentedOutCode } };

const securityRulesAsErrors = Object.fromEntries(
  Object.keys(securityPlugin.configs.recommended.rules).map((ruleName) => [ruleName, 'error']),
);

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'Claude outputs/**'],
  },
  eslintJavaScript.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js}'],
    plugins: { security: securityPlugin, local: localRulesPlugin },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      ...securityRulesAsErrors,

      // R13: sin `any`.
      '@typescript-eslint/no-explicit-any': 'error',

      // R13: sin números mágicos.
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: ALLOWED_PLAIN_NUMBERS,
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreClassFieldInitialValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          enforceConst: true,
        },
      ],

      // R13: sin código comentado.
      'local/no-commented-out-code': 'error',

      // R13: convención de nombres (docs/guia-de-codigo.md, sección 2).
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'import', format: null },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
        { selector: 'variable', modifiers: ['destructured'], format: null },
        // `__filename` y `__dirname` son los nombres estándar de Node para ESM.
        { selector: 'variable', filter: { regex: '^__(filename|dirname)$', match: true }, format: null },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'classProperty', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['UPPER_CASE'] },
        // Claves que imponen otros: campos de Prisma, cabeceras HTTP, variables de entorno, operadores de filtro.
        { selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'], format: null },
      ],

      // R8: SQL crudo solo con plantillas parametrizadas.
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: 'Use $queryRaw with a tagged template (R8).' },
        { property: '$executeRawUnsafe', message: 'Use $executeRaw with a tagged template (R8).' },
      ],

      // Un guion bajo inicial marca a propósito un parámetro o variable que no se usa (firma impuesta por un puerto).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    plugins: { vitest: vitestPlugin },
    // R2: en los tests no se admiten comentarios que desactiven reglas; así nadie puede desactivar las de abajo.
    linterOptions: { noInlineConfig: true },
    languageOptions: { globals: vitestPlugin.environments.env.globals },
    rules: {
      ...vitestPlugin.configs.recommended.rules,
      // R2: prohibidos `.skip`, `.only`, `.todo` y tests comentados. `itKnownDefect` (envoltura de `it.fails`) se admite (Q-007).
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/warn-todo': 'error',
      'vitest/no-commented-out-tests': 'error',
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expect*', 'ruleTester.run', 'assert*'] }],
      'vitest/no-standalone-expect': ['error', { additionalTestBlockFunctions: ['itKnownDefect'] }],
      // Los tests no reciben entrada de usuarios: rutas de archivo y claves dinámicas son del propio test.
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['src/infrastructure/services/LocalDiskFileStorage.ts'],
    rules: {
      // Es el adaptador de disco: su trabajo es leer y escribir rutas. Ninguna llega del cliente; `pathFor` valida la
      // clave (segmentos seguros) y comprueba que la ruta resuelta queda dentro de la carpeta raíz antes de tocar el disco.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    files: ['tests/support/knownDefect.ts'],
    rules: {
      // Es la envoltura de `it.fails`, no un test: el título y las aserciones los pone quien la llama.
      'vitest/expect-expect': 'off',
      'vitest/valid-title': 'off',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node, ...globals.commonjs } },
  },
  {
    files: ['eslint.config.js', 'eslint-rules/**/*.js', '**/*.cjs'],
    rules: {
      // La configuración de herramientas sigue los nombres que imponen ESLint y sus plugins.
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  prettierCompatibility,
);
