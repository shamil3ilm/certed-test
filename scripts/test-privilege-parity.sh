#!/usr/bin/env bash
# ============================================================================
# Privilege-parity test (R-01) - the check that actually catches a broken snapshot.
#
# The migration chain REVOKEs Supabase's table-wide default grants and re-GRANTs
# specific columns. The rebuild snapshot is a schema-only pg_dump that DROPS those
# REVOKEs (no-ops in the dump source), so a "Table privilege epilogue" re-applies
# them. Text-level tests can pass on an epilogue that is present but non-functional
# (bare names that error, or a REVOKE ordered after its column GRANTs so it cascades
# them away). The ONLY check that cannot be fooled is provisioning a database BOTH
# ways and diffing the EFFECTIVE privileges of the API roles.
#
# We model Supabase's default privileges (ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
# TABLES TO the API roles) so the chain's REVOKEs have something to remove - without
# this a local role holds no table-wide grant and every REVOKE is a silent no-op,
# hiding the very drift this guard exists to catch.
#
# Usage:  bash scripts/test-privilege-parity.sh
# Requires: local Postgres (psql on PATH), superuser `postgres`, empty password.
# ============================================================================
set -uo pipefail
export PGPASSWORD="${PGPASSWORD:-}"
HOST=127.0.0.1
USER=postgres
SNAPSHOT="${1:-supabase/rebuild/0000_full_rebuild.sql}"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"; psql -h $HOST -U $USER -q -c "drop database if exists certed_pp_mig" -c "drop database if exists certed_pp_snap" >/dev/null 2>&1' EXIT

PSQL() { psql -h $HOST -U $USER "$@"; }

# Shared Supabase-shaped base: auth schema/roles + default privileges that grant every
# NEW table postgres creates to the API roles (global, so it survives the snapshot's
# own DROP/CREATE SCHEMA public).
base_setup() { # $1 = db
  PSQL -d "$1" -q >/dev/null 2>&1 <<'SQL'
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
}

# Dump the effective table- and column-level privileges of the API roles, normalised
# and sorted so two provisioning paths can be diffed line-for-line.
dump_privs() { # $1 = db, $2 = out file
  PSQL -d "$1" -tAF $'\t' -q >"$2" <<'SQL'
select 'TABLE', grantee, table_name, '', privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
union all
select 'COLUMN', grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon','authenticated')
order by 1,2,3,4,5;
SQL
}

echo "== provisioning via MIGRATIONS =="
PSQL -q -c "drop database if exists certed_pp_mig" -c "create database certed_pp_mig" >/dev/null 2>&1
base_setup certed_pp_mig
for f in supabase/migrations/00*.sql; do
  if ! PSQL -d certed_pp_mig -v ON_ERROR_STOP=1 -q -f "$f" >"$TMPDIR/mig.log" 2>&1; then
    echo "MIGRATION FAILED: $f"; tail -3 "$TMPDIR/mig.log"; exit 1
  fi
done

echo "== provisioning via SNAPSHOT =="
PSQL -q -c "drop database if exists certed_pp_snap" -c "create database certed_pp_snap" >/dev/null 2>&1
base_setup certed_pp_snap
# The snapshot issues CREATE SCHEMA public, so remove the default one first (as real
# provisioning does). The global default privileges set above survive this.
PSQL -d certed_pp_snap -q -c "drop schema if exists public cascade" >/dev/null 2>&1
if ! PSQL -d certed_pp_snap -v ON_ERROR_STOP=1 -q -f "$SNAPSHOT" >"$TMPDIR/snap.log" 2>&1; then
  echo "SNAPSHOT APPLY FAILED - the epilogue likely errors at runtime (e.g. unqualified names"
  echo "against pg_dump's empty search_path). First errors:"
  grep -iE "error|does not exist" "$TMPDIR/snap.log" | head -5
  exit 1
fi

dump_privs certed_pp_mig "$TMPDIR/mig.privs"
dump_privs certed_pp_snap "$TMPDIR/snap.privs"

if diff -u "$TMPDIR/mig.privs" "$TMPDIR/snap.privs" >"$TMPDIR/diff.txt"; then
  echo "== PRIVILEGE PARITY: OK =="
  echo "   migrations and snapshot grant identical table/column privileges to anon + authenticated"
  echo "   ($(wc -l < "$TMPDIR/mig.privs" | tr -d ' ') privilege rows compared)"
  exit 0
fi

echo "== PRIVILEGE PARITY: FAILED =="
echo "A snapshot-provisioned database has DIFFERENT effective privileges than the migration"
echo "chain. This is the R-01 failure mode text tests miss: the epilogue is missing, ordered"
echo "after its column GRANTs (a table REVOKE cascades those away), or references bare names."
echo "'-' lines are privileges the chain has but the snapshot LOST; '+' are extra."
echo "Fix the epilogue in $SNAPSHOT / scripts/rebuild-snapshot.sh, then re-run."
echo "----------------------------------------------------------------------------"
grep -E '^[-+][^-+]' "$TMPDIR/diff.txt" | head -40
exit 1
