# Unified Service Scheduler

A NestJS backend for the Keyloop coding challenge. A customer can book a service only when a qualified technician and a repair bay are available for the entire service. The backend chooses resources, prevents conflicting bookings across multiple processes, preserves cancellation history, and handles repeated requests safely.

## Run locally

Requirements: Node.js 24, npm, Docker Desktop/Engine with Compose.

```sh
npm ci
npm run env:init
# Creates .env with random local credentials; never overwrites an existing file.
docker compose up -d --wait db
npm run db:migrate
npm run db:roles
npm run db:seed
npm run start:dev
```

API: [http://127.0.0.1:3000/api](http://127.0.0.1:3000/api). Interactive OpenAPI: [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs). Public readiness check: `/api/health`.

In another terminal:

```sh
npm run demo
```

The demo reads the generated credentials without printing them. It logs in, checks availability, creates and replays a booking, verifies another customer cannot read it, cancels it, confirms a replay stays cancelled, and books again with a new key. Both demonstration appointments are cancelled at the end while their history remains stored.

Seed usernames are `customer.a` and `customer.b`; their passwords come from `SEED_CUSTOMER_A_PASSWORD` and `SEED_CUSTOMER_B_PASSWORD`. Seeded dealerships use `Europe/London`, with two resource pairs at North Loop and one at River Gate. Account seeding preserves existing password hashes.

If `.env` already exists, preserve it and use a separate file:

```sh
POSTGRES_PORT=55432 npm run env:init -- .env.scheduler.local
export DOTENV_CONFIG_PATH=.env.scheduler.local
docker compose --env-file .env.scheduler.local up -d --wait db
# Subsequent npm commands read DOTENV_CONFIG_PATH.
```

See `.env.example` for the configuration keys. Migration and runtime database credentials must be different. `db:roles` provisions the restricted role from `DATABASE_URL`. All migrations and seed commands are explicit; app startup never changes the schema. For a compiled runtime, use `npm run build` then `npm run start:prod`. Swagger is available only outside production when `HOST` is `127.0.0.1`, `::1` or `localhost`.

## API contract

All routes below start with `/api`. Business endpoints require `Authorization: Bearer <accessToken>`.

| Method | Route                      | Behavior                                                                          |
| ------ | -------------------------- | --------------------------------------------------------------------------------- |
| POST   | `/auth/login`              | `{ username, password }` → 15-minute access token                                 |
| GET    | `/catalog`                 | Dealerships, opening hours, services, and the caller's vehicles                   |
| GET    | `/availability`            | Query `dealershipId`, `vehicleId`, `serviceId`, `startsAt`; advisory availability |
| POST   | `/appointments`            | Same four fields in JSON, plus required `Idempotency-Key` header                  |
| GET    | `/appointments/:id`        | Retrieve an owned appointment                                                     |
| POST   | `/appointments/:id/cancel` | JSON `{}` or `{ reason }`; preserve history and release resources                 |
| GET    | `/health`                  | Public readiness check                                                            |

Booking input:

```json
{
  "dealershipId": "30000000-0000-4000-8000-000000000001",
  "vehicleId": "20000000-0000-4000-8000-000000000001",
  "serviceId": "40000000-0000-4000-8000-000000000001",
  "startsAt": "2030-10-01T09:00:00+01:00"
}
```

Choose a start strictly in the future, with the entire service interval inside the dealer's opening hours in its configured timezone. Input must include seconds and an explicit timezone offset, with at most millisecond precision. Responses use UTC. The customer is derived from the authenticated account; sending `customerId`, technician/bay IDs, status, duration or end time is rejected.

The vehicle must belong to the caller and cannot have another overlapping confirmed appointment, including at another dealership. Technicians must belong to the dealership and be qualified for the service. All bays support all services in the current model; allocation chooses the lowest available technician and bay IDs.

A new appointment returns 201. Replaying the same customer/key/input returns 200 with the current appointment, including `CANCELLED`. A different input with that key returns `409 IDEMPOTENCY_CONFLICT`. The key is 1–128 visible ASCII characters. Booking again after cancellation uses a new key.

Cancellation is allowed strictly before the scheduled start. Repeating a successful cancellation returns the original cancellation time/reason, even after that start time. Only `CONFIRMED` occupies resources; consecutive half-open intervals may share resources.

Errors have `{ code, message, requestId }`. Validation uses 400, authentication 401, missing/foreign resources 404, invalid time/working hours 422, capacity/idempotency/cancellation conflicts 409, rate limits 429, and temporary database failures 503. Availability returns `200 available:false` with a business reason when its input is otherwise valid.

## Design and security

The service uses NestJS modules, MikroORM 7 and PostgreSQL 18. Booking/cancellation transactions acquire locks in dealership → vehicle → appointment order. A fresh availability query runs after the lock. Three database exclusion constraints independently prevent overlapping confirmed bookings for technician, bay and vehicle. A successful response is sent only after commit.

This serializes writes at one dealership, including unrelated dates. It is a deliberate simplicity/throughput tradeoff for the challenge. Separate dealerships can proceed concurrently, and vehicle conflicts are protected across dealerships. There is no process-local booking lock, external queue or automatic transaction retry.

Security includes Argon2id password hashes, verified short-lived JWTs, owner-scoped queries, strict DTO validation, parameterized data access, JSON-body limits, request throttling, database timeouts, Helmet, safe errors and redacted local logs. A freshly provisioned runtime database role has no schema-changing or account password-hash write grants; role setup does not revoke pre-existing privileges from reused roles. API and DB ports bind to loopback by default; a network deployment needs HTTPS. Rate limits are per instance. There is no refresh token, account registration, password reset, employee/admin role or immediate token revocation in this submission.

Implementation scope, decisions and contracts: [solution design](solution-design.md).

## Verify

Fast checks do not require a database:

```sh
npm run check
npm run format:check
```

Create the disposable test database once, then run real PostgreSQL checks:

```sh
docker compose exec -T db createdb -U scheduler_admin scheduler_test
npm run test:integration
npm run test:e2e
```

Use `--env-file .env.scheduler.local` for Compose if using the alternate environment. `TEST_DATABASE_URL` must point to a separate database with a name ending in `_test`; the harness refuses the application database and never falls back to it. Test suites rebuild/reset only test data. Database suites run sequentially within a test DB; separate databases were used during parallel implementation.

Integration tests exercise actual migrations, all resource exclusions/composite foreign keys, privileges, allocation, clock rules, idempotency and rollback. E2E launches **two separate Node processes with their own ORM pools and restricted runtime credentials**. Explicit database locks/barriers coordinate races. It also verifies real login, cross-customer access, validation, rate limits, restart persistence and log redaction.

The CI workflow is configured to run the same stack and checks. [Testing and verification](solution-design.md#610-testing-and-verification) records local results and their scope. Remote CI results have not been inspected.

## Observability

JSON HTTP logs contain request ID, route template, outcome and duration; no request bodies, credentials, connection strings or cancellation reasons. To summarize a captured runtime log:

```sh
npm run logs:summary -- server.log
```

The output counts HTTP outcomes and reports p50/p95 latency across the captured requests. Cancellation counts include successful replays. Metrics are derived from these HTTP logs; per-allocation business events and application/database tracing are not implemented.

## AI Collaboration Plan

My collaboration plan starts with defining the problem, discussing scope and business rules with AI, and comparing architecture options, including alternatives I find myself. I set design principles before asking AI for a draft. I plan to have another AI agent, such as Claude, review it, then check every section myself with extra attention to key decisions.

Once I am happy with the design, I will ask Codex for an implementation plan before coding. The plan will identify shared setup tasks and tasks that can run in parallel. One agent will build the shared foundation first; other agents can then build modules using agreed interfaces. A review sub-agent will check each agent's work when it finishes. After coding, I will review the main business rules, especially preventing double bookings and keeping each customer's appointments private. These steps describe the planned workflow.
