import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cruise, type IConfiguration, type IViolation } from 'dependency-cruiser';
import { beforeAll, describe, expect, it } from 'vitest';

// Comprueba que las reglas de R4 de `.dependency-cruiser.cjs` detectan cada violación del fixture
// y no marcan las dependencias permitidas. `pnpm arch:check` aplica las mismas reglas a `src/`.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtureRoot = path.join(projectRoot, 'tests/fixtures/architecture');
const architectureConfig = createRequire(import.meta.url)(
  path.join(projectRoot, '.dependency-cruiser.cjs'),
) as IConfiguration;

let violations: IViolation[] = [];

function violationsOf(ruleName: string): string[] {
  return violations.filter((violation) => violation.rule.name === ruleName).map((violation) => violation.from);
}

describe('reglas de arquitectura (R4, dependency-cruiser)', () => {
  beforeAll(async () => {
    const { tsConfig: _projectTsConfig, ...optionsWithoutProjectTsConfig } = architectureConfig.options ?? {};
    const result = await cruise(['src'], {
      ...optionsWithoutProjectTsConfig,
      baseDir: fixtureRoot,
      validate: true,
      ruleSet: { forbidden: architectureConfig.forbidden },
    });
    if (typeof result.output === 'string') throw new Error('Expected a structured cruise result');
    violations = result.output.summary.violations;
  });

  it('domain no puede importar una librería externa', () => {
    expect(violationsOf('domain-is-self-contained')).toContain('src/domain/EntityUsingLibrary.ts');
  });

  it('domain sí puede importar módulos nativos de Node', () => {
    expect(violationsOf('domain-is-self-contained')).not.toContain('src/domain/PureEntity.ts');
  });

  it('application no puede importar infraestructura', () => {
    expect(violationsOf('application-depends-only-on-domain')).toEqual(['src/application/UseCaseUsingAdapter.ts']);
  });

  it('infraestructura no puede importar presentación', () => {
    expect(violationsOf('infrastructure-does-not-know-presentation')).toEqual([
      'src/infrastructure/AdapterUsingRoute.ts',
    ]);
  });

  it('presentación no puede importar persistencia', () => {
    expect(violationsOf('presentation-does-not-touch-persistence')).toEqual([
      'src/presentation/RouteUsingRepository.ts',
    ]);
  });

  it('se detectan los ciclos de imports', () => {
    const circularPair = ['src/domain/CircularFirst.ts', 'src/domain/CircularSecond.ts'];

    const reportedFiles = violationsOf('no-circular');

    // dependency-cruiser informa el ciclo una vez, desde uno de sus dos extremos.
    expect(reportedFiles).toHaveLength(1);
    expect(circularPair).toContain(reportedFiles[0]);
  });

  it('el código de producción no puede depender de devDependencies', () => {
    expect(violationsOf('not-to-dev-dependency')).toEqual(['src/infrastructure/AdapterUsingDevDependency.ts']);
  });

  it('se detectan los imports que no resuelven', () => {
    expect(violationsOf('not-to-unresolvable')).toEqual(['src/infrastructure/AdapterWithBrokenImport.ts']);
  });
});
