#!/usr/bin/env bash
# ============================================================================
# Restore drill (FIND-35) - verify a RESTORED database is complete and its
# financial system-of-record data survived. A backup you have never restored is a
# hypothesis; this turns the manual annual drill in docs/operations.md into one
# command, and records how long it took (your RTO signal).
#
# Usage:
#   Verify a restore target (a SCRATCH db a backup was restored into - NEVER prod):
#     PGHOST=... PGPORT=... PGUSER=... PGDATABASE=scratch bash scripts/restore-drill.sh
#   Rehearse the whole cycle locally (build -> pg_dump -> drop -> restore -> verify):
#     bash scripts/restore-drill.sh --rehearse
#
# The real drill: restore the latest Supabase backup into a scratch project, run this
# to confirm the schema is at head and receipts reconcile, and SEPARATELY confirm the
# custodial attachments come back from Google Drive (they live outside the DB backup).
# Requires: psql / pg_dump / pg_restore on PATH.
# ============================================================================
set -uo pipefail
HOST="${PGHOST:-127.0.0.1}"; PORT="${PGPORT:-5432}"; USER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}"

pass=0; fail=0
Q() { psql -h "$HOST" -p "$PORT" -U "$USER" -d "$1" -tAqc "$2" 2>/dev/null; }
assert() { # LABEL DB SQL EXPECTED
  local label="$1" db="$2" sql="$3" want="$4" got
  got=$(Q "$db" "$sql")
  if [ "$got" = "$want" ]; then pass=$((pass+1)); echo "  ok   $label";
  else fail=$((fail+1)); echo "  FAIL $label : expected $want, got ${got:-<none>}"; fi
}

verify() { # DB - the reusable verification (runs as superuser, so RLS is bypassed and
  #             we test DATA presence/integrity, not policy enforcement).
  local db="$1"
  echo "== verifying restore: $db =="
  # 1. Schema at HEAD - objects from the latest migrations must exist, so a partial or
  #    stale restore (old snapshot / failed replay) is caught.
  assert "schema: guardians table (0076)"        "$db" "select (to_regclass('public.guardians') is not null)::text" true
  assert "schema: assignments.type column (0071)" "$db" "select count(*) from information_schema.columns where table_name='assignments' and column_name='type'" 1
  assert "schema: rls_disabled_tables fn (0069)"  "$db" "select count(*) from pg_proc where proname='rls_disabled_tables'" 1
  # 2. Financial system-of-record survived AND reconciles: for every receipt,
  #    total == sum(its line amounts) - discount. A restore that brought the schema but
  #    not the rows, or a corrupt restore, fails here.
  assert "data: at least one receipt present"     "$db" "select (count(*) > 0)::text from receipts" true
  assert "data: every receipt total reconciles"   "$db" \
    "select coalesce(bool_and(r.total = coalesce((select sum(l.amount) from receipt_lines l where l.receipt_id=r.id),0) - coalesce(r.discount,0)), true)::text from receipts r" true
}

if [ "${1:-}" = "--rehearse" ]; then
  DB=certed_restore_drill; DUMP="$(mktemp --suffix=.dump)"
  echo "== [rehearse] building a production-like DB from the migration chain =="
  psql -h "$HOST" -p "$PORT" -U "$USER" -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -q >/dev/null 2>&1 <<'SQL'
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
SQL
  for f in supabase/migrations/00*.sql; do
    psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/_drillmig 2>&1 \
      || { echo "MIGRATION FAILED: $f"; head -3 /tmp/_drillmig; exit 1; }
  done
  psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -q -v ON_ERROR_STOP=1 >/tmp/_drillseed 2>&1 <<'SQL' \
    || { echo "SEED FAILED"; cat /tmp/_drillseed; exit 1; }
insert into receipts(number,student_name_snapshot,currency,subtotal,total,created_by)
  values ('CEA-R-DRILL-0001','Drill Student','INR',600,600,null);
insert into receipt_lines(receipt_id,subject,hours,rate,amount)
  select id,'Maths',1,600,600 from receipts where number='CEA-R-DRILL-0001';
SQL

  echo "== [rehearse] pg_dump (simulated backup) -> drop -> restore =="
  start=$(date +%s)
  pg_dump -h "$HOST" -p "$PORT" -U "$USER" -Fc "$DB" -f "$DUMP" 2>/tmp/_drilldump || { echo "DUMP FAILED"; cat /tmp/_drilldump; exit 1; }
  psql -h "$HOST" -p "$PORT" -U "$USER" -q -c "drop database $DB" -c "create database $DB" >/dev/null 2>&1
  pg_restore -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" --no-owner --no-privileges "$DUMP" >/tmp/_drillrestore 2>&1
  end=$(date +%s)
  verify "$DB"
  echo "== restore + verify took $((end - start))s (RTO signal) =="
  rm -f "$DUMP"
  psql -h "$HOST" -p "$PORT" -U "$USER" -q -c "drop database if exists $DB" >/dev/null 2>&1
else
  DB="${PGDATABASE:?set PGDATABASE to the scratch database a backup was restored into (never production)}"
  start=$(date +%s); verify "$DB"; end=$(date +%s)
  echo "== verify took $((end - start))s =="
fi

echo "== DRILL RESULT: $pass passed, $fail failed =="
[ "$fail" = "0" ]
