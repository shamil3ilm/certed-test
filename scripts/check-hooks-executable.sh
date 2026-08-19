#!/bin/bash

# Assert every git hook under .githooks/ carries the executable bit (mode 100755) in
# git's index. Git SILENTLY skips a non-executable hook on Unix, so a hook committed
# 100644 never runs - the snapshot-freshness and format guards then "pass" locally
# while doing nothing. CI hooks don't run anyway, so this is the backstop that makes a
# non-executable (and therefore skipped) hook loud instead of silent. Fix a flagged
# file with:
#   git update-index --chmod=+x <file>

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

bad="$(git ls-files -s .githooks/ | awk '$1 != "100755" { print "  " $4 " (mode " $1 ")" }')"
if [ -n "$bad" ]; then
  echo "::error::these git hooks are not executable, so git will silently skip them:" >&2
  echo "$bad" >&2
  echo "Fix: git update-index --chmod=+x <file>" >&2
  exit 1
fi

echo "All .githooks are executable (100755)."
