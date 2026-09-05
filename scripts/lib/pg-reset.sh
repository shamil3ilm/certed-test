#!/bin/bash

# Shared database bootstrap for the local harnesses (test-rls, test-privilege-parity,
# restore-drill).
#
# WHY THIS EXISTS
#   Each harness used to open with:
#
#     psql ... -c "drop database if exists $DB" -c "create database $DB" >/dev/null 2>&1
#
#   Output discarded, exit status never checked. DROP DATABASE fails whenever ANY
#   connection to that database still lingers - a psql left open, a previous run's
#   backend not yet reaped, a pooler. The drop then fails silently, the create fails
#   silently ("already exists"), and the harness runs its assertions against a stale or
#   half-built database. It does not report "could not reset the database"; it reports
#   dozens of confident assertion failures about columns that do not exist.
#
#   That is the worst failure mode a guard can have: it fails DISHONESTLY, and sends the
#   reader hunting a schema bug that was never there. It happened three passes running,
#   once producing 39 failures blaming a column that a hand-walk of the whole migration
#   chain proved present.
#
# WHAT reset_database DOES INSTEAD
#   1. Terminates every OTHER backend on the target database, so a lingering connection
#      cannot block the drop. (pg_terminate_backend excludes our own pid.)
#   2. Runs the drop and the create with ON_ERROR_STOP and NO output suppression.
#   3. Checks the exit status and aborts the whole harness with a readable message.
#
#   A reset that cannot happen is now a loud, immediate failure that names its cause -
#   never a downstream assertion pretending to be a schema problem.
#
# Usage:  reset_database <host> <port> <user> <dbname>

reset_database() {
  local host="$1" port="$2" user="$3" db="$4" out

  # Kill anything else attached, or the drop below loses the race. Connect to `postgres`,
  # not the target, so this connection is never one of the ones being terminated.
  out=$(psql -h "$host" -p "$port" -U "$user" -d postgres -v ON_ERROR_STOP=1 -tAq -c "
    select pg_terminate_backend(pid)
      from pg_stat_activity
     where datname = '$db' and pid <> pg_backend_pid();" 2>&1)
  if [ $? -ne 0 ]; then
    echo "FATAL: could not query/terminate connections to '$db' on $host:$port." >&2
    echo "       Is Postgres running and reachable as user '$user'?" >&2
    echo "$out" >&2
    return 1
  fi

  out=$(psql -h "$host" -p "$port" -U "$user" -d postgres -v ON_ERROR_STOP=1 -q \
        -c "drop database if exists $db" -c "create database $db" 2>&1)
  if [ $? -ne 0 ]; then
    echo "FATAL: could not reset the test database '$db' on $host:$port." >&2
    echo "       The harness has NOT run. Nothing below this line is an assertion result." >&2
    echo "$out" >&2
    return 1
  fi
  return 0
}

# Drop a database at teardown, reporting a failure rather than leaving a silent orphan
# behind - a leftover database is exactly what makes the NEXT run's drop race.
drop_database() {
  local host="$1" port="$2" user="$3" db="$4" out
  psql -h "$host" -p "$port" -U "$user" -d postgres -tAq -c "
    select pg_terminate_backend(pid)
      from pg_stat_activity
     where datname = '$db' and pid <> pg_backend_pid();" >/dev/null 2>&1
  out=$(psql -h "$host" -p "$port" -U "$user" -d postgres -v ON_ERROR_STOP=1 -q \
        -c "drop database if exists $db" 2>&1)
  if [ $? -ne 0 ]; then
    echo "WARNING: could not drop '$db' - it will linger and may race the next run." >&2
    echo "$out" >&2
  fi
}
