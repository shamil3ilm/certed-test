#!/bin/bash

# Regenerate the rebuild snapshot WITHOUT Docker or the Supabase CLI.
#
# WHY THIS EXISTS
#   The pre-commit hook blocks a commit that adds a migration without regenerating the
#   snapshot - correctly, because the two must stay atomic. But its fix line said only:
#
#       supabase db reset && npm run db:rebuild-snapshot
#
#   which needs the Supabase CLI and Docker. On a machine with neither (plain local
#   Postgres is enough for every other database harness here) that is a dead end: a
#   correct block with an instruction you cannot follow. The escape existed -
#   rebuild-snapshot.sh honours SNAPSHOT_DB_URL - but it needs a FULLY MIGRATED database
#   to dump from, and building one by hand is: create the database, create the auth schema
#   and the three API roles, then apply ~100 migrations in order. Nobody reads a hook
#   message and does that from memory.
#
#   This does those steps and hands the result to rebuild-snapshot.sh.
#
# Usage:  bash scripts/rebuild-snapshot-local.sh
#         PGHOST / PGPORT / PGUSER / PGPASSWORD honoured; defaults are the local dev values
#         every other harness in this repo uses.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-5432}"
USER_="${PGUSER:-postgres}"
DB="certed_snapshot_build_$$"

# shellcheck source=scripts/lib/pg-reset.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/pg-reset.sh"

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: psql and pg_dump must be on PATH (this is the no-Docker path)." >&2
  exit 1
fi

# pg_dump refuses to dump from a NEWER server, and a mismatch churns the diff with
# unrelated formatting anyway. Fail here with the versions rather than inside the dump.
server_major=$(psql -h "$HOST" -p "$PORT" -U "$USER_" -d postgres -tAqc "show server_version_num" | cut -c1-2)
dump_major=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
if [ "$server_major" != "$dump_major" ]; then
  echo "Error: pg_dump $dump_major cannot dump from server $server_major - versions must match." >&2
  exit 1
fi

cleanup() { drop_database "$HOST" "$PORT" "$USER_" "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== provisioning a scratch database from the migration chain =="
reset_database "$HOST" "$PORT" "$USER_" "$DB" || exit 1

# The pieces Supabase provides that a bare Postgres does not. Mirrors base_setup in
# test-privilege-parity.sh, so the snapshot is dumped from the same shape the harnesses
# assert against - including the default privileges the 0096 sweep is there to close.
psql -h "$HOST" -p "$PORT" -U "$USER_" -d "$DB" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
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
  if ! psql -h "$HOST" -p "$PORT" -U "$USER_" -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/tmp/_snapmig.log 2>&1; then
    echo "MIGRATION FAILED: $f" >&2
    tail -5 /tmp/_snapmig.log >&2
    echo "The snapshot was NOT regenerated - fix the migration first." >&2
    exit 1
  fi
  applied=$((applied + 1))
done
echo "   $applied migrations applied cleanly (head: $(basename "$(ls supabase/migrations/*.sql | tail -1)"))"

echo "== dumping =="
SNAPSHOT_DB_URL="postgresql://${USER_}@${HOST}:${PORT}/${DB}" bash scripts/rebuild-snapshot.sh

echo
echo "Now stage it IN THE SAME COMMIT as the migration:"
echo "  git add supabase/rebuild/0000_full_rebuild.sql"
