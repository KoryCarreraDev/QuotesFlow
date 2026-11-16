// Regla local de ESLint: prohíbe dejar código comentado (R13 de PLAN.md).
// Ninguna regla del núcleo de ESLint lo detecta y los plugins existentes no son compatibles con ESLint 10.
//
// Criterio: un comentario (o un grupo de comentarios de línea consecutivos) es código comentado si su texto
// se puede analizar como TypeScript válido y contiene algo más que palabras sueltas. La prosa en español
// casi nunca es TypeScript válido ("Añade el tenantId" no compila), así que los falsos positivos son raros.

import tseslint from 'typescript-eslint';

const JSDOC_MARKER = '*';
const TOOLING_DIRECTIVE_PATTERN =
  /^\s*(eslint|eslint-disable|eslint-enable|global|globals|exported|@ts-|prettier-ignore|istanbul|c8|v8)\b/;
const NEXT_LINE_DISTANCE = 1;

/**
 * Indica si una sentencia es solo una palabra o un literal sueltos (por ejemplo, el comentario "// Seguridad").
 * @param {import('@typescript-eslint/types').TSESTree.Statement} statement
 * @returns {boolean}
 */
function isBareWordOrLiteral(statement) {
  if (statement.type === 'LabeledStatement') return isBareWordOrLiteral(statement.body);
  if (statement.type === 'EmptyStatement') return true;
  if (statement.type !== 'ExpressionStatement') return false;
  return statement.expression.type === 'Identifier' || statement.expression.type === 'Literal';
}

/**
 * @param {string} commentText
 * @returns {boolean}
 */
function looksLikeCode(commentText) {
  try {
    const { ast: program } = tseslint.parser.parseForESLint(commentText, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    return program.body.length > 0 && !program.body.every(isBareWordOrLiteral);
  } catch {
    return false;
  }
}

/**
 * Agrupa comentarios de línea consecutivos: el código comentado suele ocupar varias líneas
 * y cada línea por separado puede no ser válida.
 * @param {import('eslint').AST.Program['comments']} comments
 * @returns {Array<Array<import('eslint').AST.Program['comments'][number]>>}
 */
function groupConsecutiveLineComments(comments) {
  const groups = [];
  for (const comment of comments) {
    const currentGroup = groups.at(-1);
    const previousComment = currentGroup?.at(-1);
    const continuesPreviousGroup =
      comment.type === 'Line' &&
      previousComment?.type === 'Line' &&
      comment.loc.start.line - previousComment.loc.end.line === NEXT_LINE_DISTANCE;

    if (continuesPreviousGroup) currentGroup.push(comment);
    else groups.push([comment]);
  }
  return groups;
}

/**
 * @param {import('eslint').AST.Program['comments'][number]} comment
 * @returns {boolean}
 */
function isDocumentationOrDirective(comment) {
  const isJsDoc = comment.type === 'Block' && comment.value.startsWith(JSDOC_MARKER);
  return isJsDoc || TOOLING_DIRECTIVE_PATTERN.test(comment.value);
}

/** @type {import('eslint').Rule.RuleModule} */
const noCommentedOutCode = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow commented-out code (R13)' },
    schema: [],
    messages: {
      commentedOutCode: 'Commented-out code is not allowed (R13): delete it, git keeps the history.',
    },
  },
  create(context) {
    return {
      Program() {
        const comments = context.sourceCode.getAllComments().filter((comment) => !isDocumentationOrDirective(comment));

        for (const group of groupConsecutiveLineComments(comments)) {
          const groupText = group.map((comment) => comment.value).join('\n');
          if (!looksLikeCode(groupText)) continue;

          context.report({
            loc: { start: group[0].loc.start, end: group.at(-1).loc.end },
            messageId: 'commentedOutCode',
          });
        }
      },
    };
  },
};

export default noCommentedOutCode;
