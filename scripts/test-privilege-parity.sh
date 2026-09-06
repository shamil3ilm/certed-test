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
union all
-- DEFAULT PRIVILEGES. Not a privilege on anything that exists yet, which is exactly why it
-- was missed: it decides what the NEXT function arrives holding. 0034 closed this for
-- PUBLIC only, so every function created afterwards still arrived granted to anon and
-- authenticated - the mechanism behind C-01, where 0095's re-signed issue_receipt_doc /
-- issue_payslip_doc came back EXECUTE-able by the publishable key. If the two provisioning
-- paths disagree here they will silently diverge on the next migration, not this one.
select 'DEFAULT_ACL', r.rolname, coalesce(n.nspname,'-'), d.defaclobjtype::text, a.privilege_type
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
join pg_roles r on r.oid = a.grantee
where r.rolname in ('anon','authenticated')
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

# ---------------------------------------------------------------------------
# CORRECTNESS - asserted on each database independently, BEFORE the parity diff.
#
# Parity alone cannot catch a privilege that is wrong in BOTH provisioning paths: two
# identically-open databases diff clean and the gate reports OK. That is not theoretical -
# it is what happened. C-01 (anon could mint financial documents through
# issue_receipt_doc / issue_payslip_doc, which are SECURITY DEFINER and do not
# self-authorize) and C-02 (11 further functions leaking EXECUTE) were both present in the
# chain AND the snapshot, so this gate passed green while they shipped.
#
# So: name the functions that must never be reachable by the API roles, and check them
# outright. A finding here is a real hole, not a drift.
# ---------------------------------------------------------------------------
SERVICE_ROLE_ONLY="issue_receipt_doc issue_payslip_doc next_document_number revoke_profile_guarded claim_pending_emails rate_limit_hit edit_assignment_and_reclassify rls_disabled_tables"

correctness_failures=0
for db in "$DB_MIG" "$DB_SNAP"; do
  label=$([ "$db" = "$DB_MIG" ] && echo "migrations" || echo "snapshot")

  # (a) No service-role-only function may be EXECUTE-able by anon or authenticated.
  leaked=$(PSQL -d "$db" -tAq <<SQL
select p.oid::regprocedure || '  <- ' || r.rolname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (select rolname from pg_roles where rolname in ('anon','authenticated')) r
where n.nspname = 'public'
  and p.proname in ($(printf "'%s'," $SERVICE_ROLE_ONLY | sed 's/,$//'))
  and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
order by 1;
SQL
)
  if [ -n "$leaked" ]; then
    echo "== PRIVILEGE CORRECTNESS: FAILED ($label) =="
    echo "These SECURITY DEFINER functions are callable by an API role. They do not"
    echo "self-authorize, so the EXECUTE grant is the ONLY control on them:"
    echo "$leaked" | sed 's/^/   /'
    correctness_failures=$((correctness_failures + 1))
  fi

  # (b) The default must be closed, or the NEXT function created arrives open again.
  open_default=$(PSQL -d "$db" -tAq <<SQL
select count(*)
from pg_default_acl d
cross join lateral aclexplode(d.defaclacl) a
join pg_roles r on r.oid = a.grantee
where d.defaclobjtype = 'f'
  and r.rolname in ('anon','authenticated')
  and a.privilege_type = 'EXECUTE';
SQL
)
  if [ "${open_default:-0}" != "0" ]; then
    echo "== PRIVILEGE CORRECTNESS: FAILED ($label) =="
    echo "DEFAULT PRIVILEGES still grant EXECUTE on new functions to anon/authenticated."
    echo "Every function added after this point arrives open - the C-01 mechanism."
    correctness_failures=$((correctness_failures + 1))
  fi
done

if [ "$correctness_failures" -ne 0 ]; then
  echo "----------------------------------------------------------------------------"
  echo "Fix: apply the function sweep (migration 0096) and re-run."
  exit 1
fi
echo "== PRIVILEGE CORRECTNESS: OK =="
echo "   no service-role-only function is reachable by anon/authenticated, in either path"
echo "   and DEFAULT PRIVILEGES deny EXECUTE on future functions"

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
