FROM node:20-slim

# Herramientas del sistema y pnpm
RUN apt-get update -y && \
    apt-get install -y openssl && \
    npm install -g pnpm

WORKDIR /app

# Copia solo lo necesario para instalar dependencias (cacheo)
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# Instala todas las dependencias (producción + desarrollo)
RUN pnpm install

# Genera el cliente de Prisma
RUN pnpm prisma generate

# Copia el resto del código fuente
COPY . .

EXPOSE 4000

# Comando por defecto (se sobrescribe en docker-compose)
CMD ["pnpm", "dev"]