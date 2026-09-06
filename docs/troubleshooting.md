# Troubleshooting (developer)

Symptoms you hit while building and testing, and how to diagnose them. This is the developer counterpart to [operations.md](operations.md), which owns _production_ incidents (backups, rollback, live outages).

## Know which log to read

Three logs are three different places — a symptom only shows up in one:

- **Build-time** — `npm run build` output (and the Vercel _Build_ log). Missing env vars, the client-manifest guard, type/lint errors surface here.
- **Runtime/server** — `npm run start` / Vercel _Function_ logs, and Sentry. RLS denials, thrown server errors, cron failures surface here.
- **Browser console** — client-side throws, hydration mismatches, a masked network error. Never appears in server logs.

## Build and deploy

| Symptom                                                                                                                                               | Likely cause                                                                                                                                       | Fix                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A page renders **"Something went wrong"** for everyone; build/server log shows `Could not find the module "…#Component" in the React Client Manifest` | a client component is in the module graph but was dropped from the page's client-reference manifest — a `next build --webpack` barrel-import quirk | deep-import the component's own `@/lib/ui/*` sub-module instead of the barrel (see `src/app/(prt)/messages/[id]/page.tsx`); the `check:client-manifest` build guard names the offending page                                                                                              |
| `npm run build` fails at `validate-build-env` or `next.config` throws on a missing public var                                                         | a required `NEXT_PUBLIC_*` is unset, or set **Sensitive** on Vercel (withheld from the build)                                                      | set it and mark it **not** Sensitive; redeploy **without** build cache — [environment.md](environment.md)                                                                                                                                                                                 |
| Sign-in works locally but is broken for everyone on the deploy, nothing in runtime logs                                                               | a `NEXT_PUBLIC_*` inlined as `undefined` at build time                                                                                             | same as above — the value must be present, non-Sensitive, at build; changing it needs a fresh (no-cache) build                                                                                                                                                                            |
| `git commit` blocked: "staged files are not Prettier-formatted"                                                                                       | the pre-commit hook ran `format:check` on staged files                                                                                             | `npm run format`, `git add`, commit again                                                                                                                                                                                                                                                 |
| `git commit`/`git push` blocked: "rebuild snapshot is stale"                                                                                          | a migration was staged without regenerating the snapshot (pre-commit / pre-push gate)                                                              | `supabase db reset && npm run db:rebuild-snapshot` — or, without Docker/the Supabase CLI, `npm run db:rebuild-snapshot:local` (builds a scratch DB from the chain with plain Postgres) — then stage the snapshot with the migration — [migration-checklist.md](migration-checklist.md) §5 |
| `git push` blocked: a documentation link does not resolve                                                                                             | the pre-push `check:doc-links` gate                                                                                                                | fix the cross-doc link; re-run `npm run check:doc-links`                                                                                                                                                                                                                                  |

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

| Symptom                                                                       | Likely cause                                                                       | Fix                                                                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `E2E reset REFUSED: pid N still holds the mock database`                      | a previous mock server is still running and shares `.mock-db.json`                 | stop that pid (`taskkill /PID N /T /F`). The refusal is the guard working — see below                        |
| `strict mode violation: resolved to 2 elements` naming the spec's OWN fixture | two mock servers were writing the same `.mock-db.json`, so the row already existed | this is what the lock above prevents; if it still happens, check for a stray server before suspecting the UI |

**Do not chase a duplicate-render bug for that second symptom.** A spec failing on a row it
created itself is almost always a second writer, not the component. It cost a full
investigation once: five specs failed that way and the same suite passed 79/79 the moment
the stale server was killed.

## Database harnesses (`test-rls`, `test-privilege-parity`, `restore-drill`)

These provision a scratch database first. If that reset cannot happen the script now
**aborts loudly** and says so — nothing below the abort is an assertion result.

| Symptom                                                           | Likely cause                                                                                  | Fix                                                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FATAL: could not reset the test database`                        | a connection to the scratch DB is open, or Postgres is unreachable                            | the message names the cause; the harness terminates other backends itself, so this means the server is down or credentials are wrong                                         |
| Dozens of assertion failures blaming a column that clearly exists | **historically**: a silent failed reset, leaving assertions running against an empty database | fixed — the bootstrap now checks its exit status. If you see this on an OLD checkout, verify the scratch DB actually has tables before believing the failures                |
| `expected allow, got error - ERROR: …`                            | a write assertion's SQL did not run at all (bad column, FK/NOT NULL violation, stale fixture) | fix the statement or the fixture. This is **not** an RLS result — `error` is a third state on purpose, because a statement that never executed says nothing about the policy |

The third row is the other half of the same lesson. `check_write`/`check_guard` used to
classify psql output two ways — "looks like an RLS refusal" or, for everything else,
"allowed" — so a write that failed for any _other_ reason was scored as _permitted by the
policy_ and passed. Rewriting one `allow` assertion's INSERT to name a column that does not
exist still produced `104 passed, 0 failed`; every `allow` expectation in the file was
asserting nothing. There is now an explicit `error` state that is never a pass.

The same shape appears on the read side: an assertion expecting `0` passes when the actor
can read nothing _at all_. Each persona therefore needs at least one assertion expecting a
NON-zero count — a positive control proving the fixture is live — or its zeros are
unfalsifiable. `sub_admin` and `S2` both had all-zero read sets and now have controls.

And once more on the guard side: `check_guard` takes a 5th argument naming **which** guard
the assertion expects to fire, because its default pattern used to include a bare
`violates`, which matches any constraint error. An assertion could pass because _something_
rejected the write, not because the guard under test did — a `block` expectation on the
0095 `billing_period` CHECK still passed when the statement was rewritten to raise a
foreign-key violation instead, and would have passed with that constraint dropped
altogether. `violates check constraint` is a guard a migration declared on purpose; a
not-null or foreign-key violation means the _test statement_ is broken and must surface as
`error`.

**The rule all three share:** every assertion helper must be exercised in both directions.
A helper with only `block`/`0` callers cannot distinguish "the policy refused" from "nothing
worked". `check_guard` had no `allow` caller at all, so it could not have told the
assigned-reminder guard apart from a trigger that refused every update the assignee makes —
which is a different, wrong behaviour that 0086 does not implement. All four helpers now
have callers on both sides.

The second row is why the reset check exists. A drop blocked by a lingering connection used to
fail silently, and the harness then reported dozens of confident failures about missing
columns — one pass produced 39 blaming a real column in a real migration, which took a
hand-walk of the whole chain to disprove. A guard that fails dishonestly is worse than no
guard: it sends the reader hunting a schema bug that was never there.

## Related

- [operations.md](operations.md) — production incidents (rollback, backups, live outages)
- [environment.md](environment.md) — every variable and where it must be set
- [migration-checklist.md](migration-checklist.md) — the snapshot discipline the hooks enforce
- [mock-mode.md](mock-mode.md) — the mock stack and seeded accounts
