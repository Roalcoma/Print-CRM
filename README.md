# CRM

CRM multi-tenant (estilo GoHighLevel) — fase inicial: núcleo CRM (auth, organizaciones, contactos, oportunidades).

Stack: **PostgreSQL + Node/Express (TS) + Vue 3 (TS)**. Multi-tenancy row-level (`organization_id`). Auth JWT propio.

## Arrancar en local

Requisitos: Docker y Node 24+.

```bash
# 1. Base de datos
docker compose up -d

# 2. Backend
cd server
cp .env.example .env
npm install
npm run migrate        # crea tablas + datos de ejemplo
npm run dev            # http://localhost:3000

# 3. Frontend (otra terminal)
cd web
npm install
npm run dev            # http://localhost:5173
```

Usuario de prueba (creado por el seed): `demo@crm.test` / `demo1234`.

## Tests

```bash
cd server
npm test               # levanta un servidor de pruebas en :3202, corre aislamiento + flujos y lo apaga
```

Usa la BD del `.env` local (crea organizaciones propias con registro público) y simula Evolution,
Meta/Instagram y Google con un servidor falso en `:4202`: no se envía nada real. El servidor de
pruebas arranca con `DISABLE_BACKGROUND_JOBS=true` y los overrides `EVOLUTION_URL`, `META_GRAPH_URL`,
`IG_GRAPH_URL`, `GOOGLE_API_URL`, `GOOGLE_TOKEN_URL` (ver `server/test/run.ts`).
`npm test -- test/flows.test.ts` corre solo un archivo.

## Estructura

```
crm/
├── docker-compose.yml   # Postgres local
├── server/              # API Express + TS
│   ├── migrations/      # *.sql numerados (runner propio)
│   └── src/
│       ├── auth/        # scrypt (stdlib) + JWT
│       └── routes/      # auth, contacts, pipelines, opportunities
└── web/                 # Vue 3 + Vite + Tailwind
```

## Roadmap (un módulo a la vez)

- [x] Núcleo: auth + organizaciones + contactos
- [x] Oportunidades / pipelines (kanban)
- [ ] Conversaciones (SMS/Email/WhatsApp)
- [ ] Calendario / citas
- [ ] Automatizaciones / workflows
