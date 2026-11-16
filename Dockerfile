# syntax=docker/dockerfile:1
# Imagen de producción (F0-T08). Multi-etapa: lo que se compila no viaja a la imagen final.
# El entorno de desarrollo usa Dockerfile.dev y docker-compose.yml.
#
#   docker build -t quotesflow-api .                       -> imagen de la API (etapa runtime)
#   docker build --target migrator -t quotesflow-migrator . -> aplica migraciones (lo ejecuta Operaciones, R6)

# Node 24 LTS (D-04). Versión y digest fijados: una reconstrucción produce la misma base.
ARG NODE_IMAGE=node:24.18.0-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
# Igual que `devEngines.packageManager` de package.json.
ARG PNPM_VERSION=11.28.10

# ---------------------------------------------------------------------------
# build: dependencias completas, cliente de Prisma, compilación y poda a producción.
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
ENV CI=true
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm prisma generate && pnpm build

# Quita las devDependencies conservando el cliente de Prisma ya generado.
RUN pnpm prune --prod --ignore-scripts

# ---------------------------------------------------------------------------
# migrator: imagen aparte con el CLI de Prisma para `prisma migrate deploy`.
# Nunca se ejecuta sola al arrancar la API: las migraciones en producción las lanza un humano (R6).
FROM ${NODE_IMAGE} AS migrator
ARG PNPM_VERSION
ENV CI=true
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
RUN pnpm install --frozen-lockfile --ignore-scripts && chown -R node:node /app
COPY --chown=node:node prisma ./prisma
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runtime: solo el código compilado y las dependencias de producción, sin pnpm ni compiladores.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# Usuario sin privilegios que trae la imagen oficial de Node (uid 1000).
USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Ejecutar con `docker run --init` (o `init: true` en compose) para que SIGTERM llegue a Node;
# el apagado ordenado llega en F1-T08.
CMD ["node", "dist/server.js"]
