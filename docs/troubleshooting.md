# Troubleshooting (developer)

Symptoms you hit while building and testing, and how to diagnose them. This is the developer counterpart to [operations.md](operations.md), which owns _production_ incidents (backups, rollback, live outages).

## Know which log to read

Three logs are three different places — a symptom only shows up in one:

- **Build-time** — `npm run build` output (and the Vercel _Build_ log). Missing env vars, the client-manifest guard, type/lint errors surface here.
- **Runtime/server** — `npm run start` / Vercel _Function_ logs, and Sentry. RLS denials, thrown server errors, cron failures surface here.
- **Browser console** — client-side throws, hydration mismatches, a masked network error. Never appears in server logs.

## Build and deploy

| Symptom                                                                                                                                               | Likely cause                                                                                                                                       | Fix                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A page renders **"Something went wrong"** for everyone; build/server log shows `Could not find the module "…#Component" in the React Client Manifest` | a client component is in the module graph but was dropped from the page's client-reference manifest — a `next build --webpack` barrel-import quirk | deep-import the component's own `@/lib/ui/*` sub-module instead of the barrel (see `src/app/(prt)/messages/[id]/page.tsx`); the `check:client-manifest` build guard names the offending page |
| `npm run build` fails at `validate-build-env` or `next.config` throws on a missing public var                                                         | a required `NEXT_PUBLIC_*` is unset, or set **Sensitive** on Vercel (withheld from the build)                                                      | set it and mark it **not** Sensitive; redeploy **without** build cache — [environment.md](environment.md)                                                                                    |
| Sign-in works locally but is broken for everyone on the deploy, nothing in runtime logs                                                               | a `NEXT_PUBLIC_*` inlined as `undefined` at build time                                                                                             | same as above — the value must be present, non-Sensitive, at build; changing it needs a fresh (no-cache) build                                                                               |
| `git commit` blocked: "staged files are not Prettier-formatted"                                                                                       | the pre-commit hook ran `format:check` on staged files                                                                                             | `npm run format`, `git add`, commit again                                                                                                                                                    |
| `git commit`/`git push` blocked: "rebuild snapshot is stale"                                                                                          | a migration was staged without regenerating the snapshot (pre-commit / pre-push gate)                                                              | `supabase db reset && npm run db:rebuild-snapshot`, stage the snapshot with the migration — [migration-checklist.md](migration-checklist.md) §5                                              |
| `git push` blocked: a documentation link does not resolve                                                                                             | the pre-push `check:doc-links` gate                                                                                                                | fix the cross-doc link; re-run `npm run check:doc-links`                                                                                                                                     |

## Local development (mock mode)

| Symptom                                                    | Likely cause                          | Fix                                                                                               |
| ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Mock data looks stale, duplicated, or wrong after a change | `.mock-db.json` persists between runs | delete `.mock-db.json` — it reseeds from `src/lib/mock/seed.ts` on next boot                      |
| Can't sign in locally                                      | using a non-seeded email              | use a seeded account (e.g. `admin@mock.test`) / password `cert-ed` — [mock-mode.md](mock-mode.md) |
| Finance PDF won't render in dev                            | no headless Chrome path               | set `MOCK_CHROME_PATH` — [environment.md](environment.md)                                         |

## Real Supabase

| Symptom                                                  | Likely cause                                                          | Fix                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A query returns empty / "not found" for data that exists | the request used the RLS-scoped client where a policy denies it       | confirm the policy in [rls-policy-inventory.md](rls-policy-inventory.md); use `createAdminClient` only in a service that legitimately bypasses RLS |
| First sign-in fails for a real user                      | no `profiles` allowlist row to bind their auth identity to            | seed it — `scripts/seed-production-allowlist.mjs` — [setup-guide.md](setup-guide.md) §3                                                            |
| An uploaded file won't open, or upload returns 503       | a `GOOGLE_DRIVE_*` var is unset/rotated, or the refresh token expired | check the four Drive vars; re-mint the token with `scripts/get-drive-refresh-token.mjs` — [environment.md](environment.md)                         |
| `/api/cron/*` returns 401                                | `CRON_SECRET` unset or the `Authorization: Bearer` header is wrong    | the routes fail closed by design — set the secret and match the header                                                                             |

## E2E (Playwright)

The E2E web server runs a full `npm run build` before any spec (`playwright.config.ts`), so a build-time failure — including the client-manifest guard — shows up there **first**, before a cryptic mid-suite error. When several specs fail at once, read the build step at the top of the run before the spec output.

## Related

- [operations.md](operations.md) — production incidents (rollback, backups, live outages)
- [environment.md](environment.md) — every variable and where it must be set
- [migration-checklist.md](migration-checklist.md) — the snapshot discipline the hooks enforce
- [mock-mode.md](mock-mode.md) — the mock stack and seeded accounts
