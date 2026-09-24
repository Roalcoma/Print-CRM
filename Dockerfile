# ── Stage 1: Compilar el frontend Vue ────────────────────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# Saltamos vue-tsc para builds más rápidos; type-check se hace en local
RUN npx vite build

# ── Stage 2: Imagen de producción ────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /crm/server

# tsx para ejecutar TypeScript directamente (el proyecto tiene noEmit: true)
RUN npm install -g tsx

# Solo dependencias de producción del servidor
COPY server/package*.json ./
RUN npm ci --omit=dev

# Código fuente del servidor (src/ + migrations/ + tsconfig.json)
COPY server/ ./

# Frontend compilado en la ruta que espera index.ts (../../web/dist)
COPY --from=web-builder /build/web/dist /crm/web/dist

EXPOSE 3100

# Ejecutar migraciones y luego arrancar
CMD ["sh", "-c", "tsx src/migrate.ts && tsx src/index.ts"]
