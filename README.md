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
