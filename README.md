# Opus Dental API (NestJS + Docker Postgres)

Backend API for Opus Dental with:
- Layer API integration as the source of appointment data
- GoHighLevel calendar sync as the destination
- Prisma + PostgreSQL running in Docker
- Auth endpoints: signup, login, logout

## 1) Start Postgres in Docker

```bash
docker compose up -d postgres
```

Check container health:

```bash
docker compose ps
```

Tail database logs:

```bash
docker compose logs -f postgres
```

## 2) Install and configure app

Install dependencies:

```bash
pnpm install
```

Copy environment variables:

```bash
cp .env.example .env
```

Important variables to set in `.env`:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opus_dental?schema=public`
- `JWT_SECRET=<your-strong-secret>`
- `JWT_ACCESS_TOKEN_EXPIRES_IN=3600`
- all Layer / Leyr / GoHighLevel keys you use

### GoHighLevel token automation

The GoHighLevel integration now supports automatic token lifecycle management:

- set `GHL_AGENCY_REFRESH_TOKEN` once
- set `GHL_COMPANY_ID` and `GHL_LOCATION_ID_OAUTH`
- optional: set `GHL_TOKEN_REFRESH_LEEWAY_SECONDS` (default `300`)

With these values, calendar/service/event endpoints automatically:

- refresh agency access token from refresh token
- generate location-scoped token
- cache tokens and refresh before expiry
- retry once on `401` with a forced refresh

You can still pass `accessToken` in request payload/query to override this behavior per request.

## 3) Run Prisma migrations

Generate Prisma client:

```bash
pnpm prisma:generate
```

Apply migrations:

```bash
pnpm prisma:migrate:deploy
```

For local iterative development, you can use:

```bash
pnpm prisma:migrate:dev
```

## 4) Run the API

```bash
pnpm start:dev
```

API base URL: `http://localhost:3000/api`  
Swagger docs: `http://localhost:3000/api/docs`

## 5) Endpoints

### Health

- `GET /api/health`

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Sync

- `POST /api/sync/calendar` (manual Layer -> GoHighLevel sync)

Current appointment sync behavior:

- creating an appointment via `POST /api/gohighlevel/calendars/events/appointments` stores `GhlAppointment` and queues `GHL_TO_LEYR` sync
- creating an appointment via `POST /api/leyr/emrs/:emr/care-units/:careUnitId/appointments` stores `LeyrAppointment` and queues `LEYR_TO_GHL` sync
- queued sync rows are processed by cron (`every 10 minutes`) or manually via `POST /api/sync/calendar`
- GoHighLevel webhook for create events:
  - `POST /api/gohighlevel/webhooks/appointments/create`
  - accepts `AppointmentCreate` payload from GHL Marketplace webhooks

Sync default env values required:

- `SYNC_LEYR_DEFAULT_CARE_UNIT_ID`
- `SYNC_LEYR_DEFAULT_HEALTHCARE_SERVICE_ID`
- `SYNC_LEYR_DEFAULT_RESOURCE_ID`
- `SYNC_GHL_DEFAULT_CONTACT_ID`
- `SYNC_GHL_DEFAULT_LOCATION_ID` (optional if `GHL_LOCATION_ID_OAUTH` already set)
- `SYNC_GHL_DEFAULT_CALENDAR_ID` (optional if `GHL_CALENDAR_ID` already set)

### Leyr appointment creation

- `POST /api/leyr/emrs/:emr/care-units/:careUnitId/appointments`

Example:

```bash
curl -X POST "http://localhost:3000/api/leyr/emrs/opus/care-units/<CARE_UNIT_ID>/appointments" \
  -H "Content-Type: application/json" \
  -d '{
    "start": "2026-04-24T10:00:00+02:00",
    "end": "2026-04-24T10:30:00+02:00",
    "healthcare_service_id": "<HEALTHCARE_SERVICE_ID>",
    "resource_id": "<RESOURCE_ID>",
    "patient_id": "<PATIENT_ID>",
    "comment": "Booked via sync service"
  }'
```

## 6) Test commands (curl)

Signup:

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@opusdental.com",
    "password": "StrongPassword123!",
    "name": "Dr. Jane Doe"
  }'
```

Login:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "doctor@opusdental.com",
    "password": "StrongPassword123!"
  }'
```

Logout (replace `<TOKEN>` with `accessToken` from login):

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <TOKEN>"
```

Health check:

```bash
curl http://localhost:3000/api/health
```

Trigger calendar sync:

```bash
curl -X POST http://localhost:3000/api/sync/calendar \
  -H "Content-Type: application/json" \
  -d '{"reason":"manual-run"}'
```

## Prisma models included

- `User`:
  - `id`, `email` (unique), `passwordHash`, `name`, timestamps
- `Session`:
  - token/session tracking for logout
  - `tokenId` (unique), `userId`, `expiresAt`, `revokedAt`
- `LeyrAppointment`:
  - normalized Leyr appointment store (`leyrAppointmentId`, status, participants, services)
- `GhlAppointment`:
  - normalized GoHighLevel appointment store (`ghlAppointmentId`, status, recurrence fields)
- `AppointmentSync`:
  - cross-system sync tracking (`direction`, `status`, source/target ids, retries, errors)

Migration file:
- `prisma/migrations/20260420000000_add_auth_models/migration.sql`

## Useful scripts

- `pnpm db:up` - start Docker Postgres
- `pnpm db:down` - stop containers
- `pnpm db:logs` - tail Postgres logs
- `pnpm prisma:generate` - generate Prisma client
- `pnpm prisma:migrate:deploy` - apply existing migrations
- `pnpm prisma:migrate:dev` - create/apply local migration
