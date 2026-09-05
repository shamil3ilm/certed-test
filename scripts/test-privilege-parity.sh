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
# Per-run scratch database names (PID-suffixed) for the same reason test-rls.sh uses one:
# a fixed name is a shared resource, so a concurrent run - or anything else in the
# workspace holding it - blocks reset_database's drop and kills the chain mid-provision
# (NEW-41). Already dropped on every exit by the cleanup trap below.
DB_MIG="certed_pp_mig_$$"
DB_SNAP="certed_pp_snap_$$"
TMPDIR="$(mktemp -d)"
# shellcheck source=scripts/lib/pg-reset.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/pg-reset.sh"
cleanup() {
  rm -rf "$TMPDIR"
  drop_database "$HOST" 5432 "$USER" "$DB_MIG"
  drop_database "$HOST" 5432 "$USER" "$DB_SNAP"
}
trap cleanup EXIT

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
union all
-- FUNCTION privileges. This gate compared tables and columns only, so the snapshot's C-01
-- function sweep could diverge from the chain unnoticed - which is exactly how a function
-- the chain grants to authenticated (is_app_link, backing the CHECK constraint on
-- notifications.link) went missing from the epilogue's hand-maintained keeps list, leaving
-- a snapshot-provisioned database refusing every notification insert. Read through
-- has_function_privilege so privileges inherited from DEFAULT PRIVILEGES resolve the same
-- way Postgres resolves them, and skip extension-owned functions.
select 'FUNCTION', r.rolname, p.proname, pg_get_function_identity_arguments(p.oid), 'EXECUTE'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
where n.nspname = 'public'
  and not exists (
    select 1 from pg_depend d
    where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
  )
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by 1,2,3,4,5;
SQL
}

echo "== provisioning via MIGRATIONS =="
reset_database "$HOST" 5432 "$USER" "$DB_MIG" || exit 1
base_setup "$DB_MIG"
for f in supabase/migrations/[0-9][0-9][0-9][0-9]_*.sql; do
  if ! PSQL -d "$DB_MIG" -v ON_ERROR_STOP=1 -q -f "$f" >"$TMPDIR/mig.log" 2>&1; then
    echo "MIGRATION FAILED: $f"; tail -3 "$TMPDIR/mig.log"; exit 1
  fi
done

echo "== provisioning via SNAPSHOT =="
reset_database "$HOST" 5432 "$USER" "$DB_SNAP" || exit 1
base_setup "$DB_SNAP"
# The snapshot issues CREATE SCHEMA public, so remove the default one first (as real
# provisioning does). The global default privileges set above survive this.
PSQL -d "$DB_SNAP" -q -c "drop schema if exists public cascade" >/dev/null 2>&1
if ! PSQL -d "$DB_SNAP" -v ON_ERROR_STOP=1 -q -f "$SNAPSHOT" >"$TMPDIR/snap.log" 2>&1; then
  echo "SNAPSHOT APPLY FAILED - the epilogue likely errors at runtime (e.g. unqualified names"
  echo "against pg_dump's empty search_path). First errors:"
  grep -iE "error|does not exist" "$TMPDIR/snap.log" | head -5
  exit 1
fi

dump_privs "$DB_MIG" "$TMPDIR/mig.privs"
dump_privs "$DB_SNAP" "$TMPDIR/snap.privs"

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
