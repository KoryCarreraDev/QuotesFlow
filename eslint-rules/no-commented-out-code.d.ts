import type { Rule } from 'eslint';

// Tipos de la regla local escrita en JavaScript, para importarla desde los tests en TypeScript.
declare const noCommentedOutCode: Rule.RuleModule;
export default noCommentedOutCode;
