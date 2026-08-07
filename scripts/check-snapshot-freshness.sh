#!/bin/bash

# Assert the one-shot rebuild snapshot (supabase/rebuild/0000_full_rebuild.sql) is
# in lockstep with the migration chain head. A migration added without regenerating
# the snapshot lets the one-shot provisioning file silently drift from the numbered
# migrations - the drift that repeatedly let a snapshot-built environment miss later
# behaviour. This is the SINGLE source for that check: both the CI `verify` job and
# the local pre-push hook (.githooks/pre-push) call it, so the two can never diverge.
#
# Exit 0 when current, 1 (with a fix hint) when missing or stale.

set -euo pipefail

SNAPSHOT="supabase/rebuild/0000_full_rebuild.sql"

latest=$(ls supabase/migrations/*.sql | xargs -n1 basename | sed -E 's/_.*//' | sort | tail -1)
snap=$(grep -oE '0001\.\.[0-9]{4}' "$SNAPSHOT" | head -1 | sed -E 's/0001\.\.//')

if [ -z "$snap" ]; then
  echo "::error::rebuild snapshot has no 0001..NNNN marker; run 'npm run db:rebuild-snapshot'" >&2
  exit 1
elif [ "$snap" != "$latest" ]; then
  echo "::error::rebuild snapshot is stale (snapshot=$snap, migrations head=$latest); run 'supabase db reset && npm run db:rebuild-snapshot' and commit the regenerated file" >&2
  exit 1
else
  echo "Rebuild snapshot is current ($snap)."
fi
