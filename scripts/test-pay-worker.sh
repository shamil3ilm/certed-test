#!/usr/bin/env bash
# ============================================================================
# Pay-follows-the-worker test (0126) - the pay rule and the billed-hours lock, against REAL Postgres.
#
# Mock mode has no database, so nothing else exercises session_pay_worker, the billing-source
# fingerprint or the guard trigger. This applies the whole migration chain to a scratch database
# and runs tests/db/pay-worker.sql, then insists on EVERY "OK <n>" line it prints: a section that
# stopped running must fail the check rather than pass it by saying nothing.
#
# Usage:  bash scripts/test-pay-worker.sh
# Requires: local Postgres (psql on PATH), superuser `postgres`, empty password.
# ============================================================================
set -uo pipefail
export PGPASSWORD="${PGPASSWORD:-}"
HOST=127.0.0.1
USER=postgres
DB="certed_pay_worker_$$"
SECTIONS="1 2a 2b 2c 3a 3b 4 5"
# shellcheck source=scripts/lib/pg-reset.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/pg-reset.sh"
cleanup() { drop_database "$HOST" 5432 "$USER" "$DB"; }
trap cleanup EXIT

PSQL() { psql -h "$HOST" -U "$USER" "$@"; }

reset_database "$HOST" 5432 "$USER" "$DB" || exit 1
PSQL -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
alter default privileges for role postgres grant all on tables to anon, authenticated, service_role;
SQL

applied=0
for f in supabase/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  if ! PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/tmp/_payworker_mig.log 2>&1; then
    echo "MIGRATION FAILED: $f" >&2
    tail -5 /tmp/_payworker_mig.log >&2
    exit 1
  fi
  applied=$((applied + 1))
done
echo "== $applied migrations applied; running tests/db/pay-worker.sql =="

out=$(PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f tests/db/pay-worker.sql 2>&1)
status=$?
echo "$out" | sed 's/^psql:[^ ]* //'
if [ $status -ne 0 ]; then
  echo "FAIL: an assertion in tests/db/pay-worker.sql did not hold." >&2
  exit 1
fi
missing=0
for n in $SECTIONS; do
  echo "$out" | grep -q "OK $n:" || { echo "FAIL: section $n never reported OK." >&2; missing=1; }
done
[ $missing -eq 0 ] || exit 1
echo "== pay rule: all sections held =="
