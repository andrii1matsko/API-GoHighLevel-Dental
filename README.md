# Opus Dental API (NestJS Monolith)

Backend API for Opus Dental with:
- Layer API integration as the source of appointment data
- GoHighLevel calendar sync as the destination

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Copy env file and set credentials:

```bash
cp .env.example .env
```

3. Run in development:

```bash
pnpm start:dev
```

API runs on `http://localhost:3000` with global prefix `/api`.

## Endpoints

- `GET /api/health` - basic health check
- `POST /api/sync/calendar` - trigger manual Layer -> GoHighLevel sync
  - optional body:
    ```json
    { "reason": "manual-run" }
    ```

## Scheduled sync

The calendar sync job runs every 10 minutes using `@nestjs/schedule`.

## Environment variables

See `.env.example`.

Required keys:
- `DATABASE_URL` (Postgres connection string for Prisma)
- `LAYER_API_BASE_URL`
- `LAYER_API_KEY`
- `GHL_API_BASE_URL` (defaults to `https://services.leadconnectorhq.com`)
- `GHL_API_KEY`
- `GHL_LOCATION_ID`
- `GHL_CALENDAR_ID`

## Scripts

- `pnpm start:dev` - run in watch mode
- `pnpm build` - compile production build
- `pnpm test` - unit tests
- `pnpm test:e2e` - end-to-end tests
- `pnpm prisma:generate` - generate Prisma client
- `pnpm prisma:migrate:dev` - create/apply local migration

## Prisma scaffold

Prisma setup is included with minimal boilerplate only:
- schema file at `prisma/schema.prisma`
- global `PrismaModule` and `PrismaService` in `src/prisma`

No models or business logic are added yet, so you can design tables later.
