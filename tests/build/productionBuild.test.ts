import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Regresión de H20: `pnpm build` fallaba con TypeScript 6 (`baseUrl` obsoleto y un error de tipos)
// y `tsc` por sí solo no reescribe el alias `@/`, así que `node dist/server.js` no arrancaría.
// Este test compila como `pnpm build` en una carpeta aparte y arranca el servidor compilado.

const runFile = promisify(execFile);
const requireFromTests = createRequire(import.meta.url);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
// Dentro del proyecto para que el código compilado resuelva `node_modules` igual que `dist/`.
const buildOutputDirectory = path.join(projectRoot, 'node_modules', '.cache', 'production-build-test');

const typescriptCompilerPath = requireFromTests.resolve('typescript/bin/tsc');
const aliasRewriterPath = path.join(
  path.dirname(requireFromTests.resolve('tsc-alias/package.json')),
  'dist/bin/index.js',
);

const UNRESOLVED_ALIAS_PATTERN = /from\s+['"]@\//;
const SERVER_START_TIMEOUT_MS = 15_000;
const HEALTH_POLL_INTERVAL_MS = 200;
const HTTP_OK = 200;

let compiledServer: ChildProcess | undefined;

async function compileLikeProductionBuild(): Promise<void> {
  await rm(buildOutputDirectory, { recursive: true, force: true });
  await runFile(process.execPath, [typescriptCompilerPath, '-p', tsconfigPath, '--outDir', buildOutputDirectory]);
  await runFile(process.execPath, [aliasRewriterPath, '-p', tsconfigPath, '--outDir', buildOutputDirectory]);
}

async function listCompiledJavaScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not obtain a free port'));
      });
    });
  });
}

async function waitForHealthyServer(healthUrl: string): Promise<Response> {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      return await fetch(healthUrl);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
    }
  }
  throw new Error(`Compiled server did not answer at ${healthUrl}`);
}

describe('build de producción (H20)', () => {
  beforeAll(async () => {
    await compileLikeProductionBuild();
  });

  afterAll(async () => {
    compiledServer?.kill();
    await rm(buildOutputDirectory, { recursive: true, force: true });
  });

  it('el código compilado no conserva imports con el alias @/', async () => {
    const compiledFiles = await listCompiledJavaScriptFiles(buildOutputDirectory);

    const filesWithUnresolvedAlias: string[] = [];
    for (const compiledFile of compiledFiles) {
      const compiledSource = await readFile(compiledFile, 'utf8');
      if (UNRESOLVED_ALIAS_PATTERN.test(compiledSource)) filesWithUnresolvedAlias.push(compiledFile);
    }

    expect(compiledFiles.length).toBeGreaterThan(0);
    expect(filesWithUnresolvedAlias).toEqual([]);
  });

  it('el servidor compilado arranca y responde en /health', async () => {
    const port = await findFreePort();
    compiledServer = spawn(process.execPath, [path.join(buildOutputDirectory, 'server.js')], {
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore',
    });

    const response = await waitForHealthyServer(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(HTTP_OK);
  });

  // Regresión de H1: sin JWT_SECRET la API arrancaba firmando tokens con 'default-secret'.
  it('el servidor compilado se niega a arrancar sin JWT_SECRET y nombra la variable que falta', async () => {
    const environmentWithoutSecret: NodeJS.ProcessEnv = { ...process.env, PORT: String(await findFreePort()) };
    delete environmentWithoutSecret.JWT_SECRET;

    const { exitCode, standardError } = await runUntilExit(path.join(buildOutputDirectory, 'server.js'), {
      env: environmentWithoutSecret,
    });

    // `null` significaría que siguió en marcha hasta que el test lo mató.
    expect(exitCode).not.toBeNull();
    expect(exitCode).not.toBe(0);
    expect(standardError).toContain('JWT_SECRET');
  });
});

async function runUntilExit(
  scriptPath: string,
  options: { env: NodeJS.ProcessEnv },
): Promise<{ exitCode: number | null; standardError: string }> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [scriptPath], {
      env: options.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const errorChunks: Buffer[] = [];
    const killTimer = setTimeout(() => childProcess.kill(), SERVER_START_TIMEOUT_MS);

    childProcess.stderr?.on('data', (chunk: Buffer) => errorChunks.push(chunk));
    childProcess.once('error', reject);
    childProcess.once('close', (exitCode) => {
      clearTimeout(killTimer);
      resolve({ exitCode, standardError: Buffer.concat(errorChunks).toString('utf8') });
    });
  });
}
