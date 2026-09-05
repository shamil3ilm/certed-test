# API route reference

Every route under `src/app/api`. "Guard" is the primary access check at the entry point; most reads are additionally scoped by RLS, and class-scoped writes re-check class authority inside the service. Authenticated guards use `requireCapabilityApi(...)`.

## Authenticated (app host)

| Route                              | Method(s)     | Guard                                                                                                                                                         |
| ---------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/assignments`                 | POST          | `manageClassContent`                                                                                                                                          |
| `/api/calendar`                    | GET           | `viewCalendar`                                                                                                                                                |
| `/api/events`                      | GET, POST     | `viewCalendar` (read) / `manageCalendar` (write)                                                                                                              |
| `/api/events/[id]`                 | PATCH, DELETE | `manageCalendar`                                                                                                                                              |
| `/api/timetable`                   | GET, POST     | `viewCalendar` (read) / `manageCalendar` (write)                                                                                                              |
| `/api/timetable/[id]`              | PATCH, DELETE | `manageCalendar`                                                                                                                                              |
| `/api/resources/[id]/download`     | GET           | `viewClasses` + per-document `canDocument('download')`; per-user rate limit; Drive-host allowlist; skips speculative prefetches                               |
| `/api/attachments`                 | POST          | active session (`requireActiveProfileApi`); per-user upload rate limit; per-owner permission (own submission / `canDocument('upload')` / announcement author) |
| `/api/attachments/[id]/download`   | GET           | `viewClasses` + per-document access check; per-user rate limit; streams the bytes (file stays private, no public link)                                        |
| `/api/reports/[type]/[studentId]`  | GET           | report access check + rate limit; `?format=html\|pdf`                                                                                                         |
| `/api/report-card/[studentId]/pdf` | GET           | report access check + rate limit                                                                                                                              |
| `/api/payslips`                    | POST          | finance capability (via `@/lib/finance/handlers`)                                                                                                             |
| `/api/payslips/[id]/pdf`           | GET           | finance capability                                                                                                                                            |
| `/api/payslips/[id]/void`          | POST          | finance capability + rate limit                                                                                                                               |
| `/api/payslips/export`             | GET           | finance capability + rate limit                                                                                                                               |
| `/api/receipts`                    | POST          | finance capability                                                                                                                                            |
| `/api/receipts/[id]/pdf`           | GET           | finance capability                                                                                                                                            |
| `/api/receipts/[id]/void`          | POST          | finance capability + rate limit                                                                                                                               |
| `/api/receipts/export`             | GET           | finance capability + rate limit                                                                                                                               |
| `/api/logout`                      | POST          | active session                                                                                                                                                |

## Public and infrastructure

| Route                             | Method(s) | Guard                                                        |
| --------------------------------- | --------- | ------------------------------------------------------------ |
| `/api/contact`                    | POST      | none (public form) - shared IP rate limit + honeypot         |
| `/api/health`                     | GET       | none - trivial DB read for an uptime pinger                  |
| `/api/cron/keepalive`             | GET       | `CRON_SECRET` (fails closed)                                 |
| `/api/cron/drain-emails`          | GET       | `CRON_SECRET` (fails closed) - sends queued `pending_emails` |
| `/api/cron/reconcile-attachments` | GET       | `CRON_SECRET` (fails closed) - sweeps orphaned uploads       |
| `/api/cron/queue-health`          | GET       | `CRON_SECRET` (fails closed) - alarms on a stalled queue     |
| `/api/dev/login`                  | GET, POST | dev/mock only - no-op unless mock mode                       |
| `/api/dev/logout`                 | GET       | dev/mock only                                                |

The public routes above are the allowlist in [`src/lib/routing/public-paths.ts`](../src/lib/routing/public-paths.ts); everything else on the app host requires a session (middleware) and a capability (the route/page guard).
