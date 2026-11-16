import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, it } from 'vitest';

import noCommentedOutCode from '../../../eslint-rules/no-commented-out-code.js';

// RuleTester usa las funciones globales de Mocha si no se le dan las de Vitest.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
});

const COMMENTED_OUT_CODE_ERROR = { messageId: 'commentedOutCode' };

describe('regla local no-commented-out-code (R13)', () => {
  ruleTester.run('no-commented-out-code', noCommentedOutCode, {
    valid: [
      { name: 'comentario en prosa que explica el porqué', code: '// El tenant va siempre primero: ningún filtro del cliente puede quitarlo.\nconst limit = 1;' },
      { name: 'comentario de una sola palabra', code: '// Seguridad\nconst limit = 1;' },
      { name: 'etiqueta seguida de una palabra', code: '// Nota: importante\nconst limit = 1;' },
      { name: 'JSDoc con ejemplos de código', code: '/**\n * Ejemplo:\n * const lead = buildLead();\n */\nconst limit = 1;' },
      { name: 'directiva de ESLint', code: '// eslint-disable-next-line no-console\nconsole.log(1);' },
      { name: 'directiva de TypeScript', code: '// @ts-expect-error tipo incompleto de la librería\nconst limit = 1;' },
      { name: 'TODO con ID de tarea', code: '// TODO(F1-T13): registrar el cambio en LeadStatusHistory.\nconst limit = 1;' },
      { name: 'comentario con una URL', code: '// Ver https://aka.ms/ts6 para la migración.\nconst limit = 1;' },
      { name: 'comentarios de prosa en varias líneas', code: '// Primera razón de la decisión,\n// y segunda razón de la decisión.\nconst limit = 1;' },
    ],
    invalid: [
      { name: 'una llamada comentada', code: '// await leadRepository.delete(leadId);\nconst limit = 1;', errors: [COMMENTED_OUT_CODE_ERROR] },
      { name: 'una declaración comentada', code: '// const limit = 20;\nconst page = 1;', errors: [COMMENTED_OUT_CODE_ERROR] },
      { name: 'un bloque comentado en varias líneas de comentario', code: '// if (isDefault) {\n//   unsetPreviousDefault();\n// }\nconst page = 1;', errors: [COMMENTED_OUT_CODE_ERROR] },
      { name: 'código dentro de un comentario de bloque', code: '/* return leads.map(toDTO); */\nconst page = 1;', errors: [COMMENTED_OUT_CODE_ERROR] },
      { name: 'un import comentado', code: "// import { Role } from './Role.js';\nconst page = 1;", errors: [COMMENTED_OUT_CODE_ERROR] },
    ],
  });
});
