#!/bin/bash

# Assert every relative Markdown link in the LIVING docs resolves to a real file.
# A broken cross-doc link is the quiet rot that makes documentation untrustworthy,
# and it is invisible until someone clicks. This is the SINGLE source for that check:
# both the CI verify job and the local pre-push hook call it, so the two can never
# diverge (same pattern as check-snapshot-freshness.sh).
#
# Point-in-time artifacts are excluded on purpose: docs/qa/ (dated audits) and
# docs/archive/ (superseded designs) are snapshots that may reference things since
# moved or removed. External (http), anchor-only (#...), and mailto links are skipped.
#
# Exit 0 when all links resolve, 1 (listing the offenders) otherwise.

set -euo pipefail

broken=0
report=""

for src in $(git ls-files '*.md'); do
  case "$src" in
    docs/qa/* | docs/archive/*) continue ;;
  esac
  dir=$(dirname "$src")
  # Allow one level of balanced parens in the target so route-group paths like
  # ../src/app/(prt)/page.tsx parse (not a link ending at the first ")"), and strip
  # the <> that Markdown uses to wrap a target containing parens.
  links=$(grep -oE '\]\(([^()]*\([^()]*\))*[^()]*\)' "$src" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//; s/^<//; s/>$//' || true)
  [ -z "$links" ] && continue
  while IFS= read -r link; do
    [ -z "$link" ] && continue
    case "$link" in
      http*://* | '#'* | mailto:*) continue ;;
    esac
    base="${link%%#*}" # strip any #anchor
    [ -z "$base" ] && continue
    # `..` resolves at the filesystem level, so a plain existence test is enough.
    if [ ! -e "$dir/$base" ]; then
      report="$report"$'\n'"  $src -> $link"
      broken=$((broken + 1))
    fi
  done <<< "$links"
done

if [ "$broken" -gt 0 ]; then
  echo "::error::$broken broken documentation link(s):" >&2
  printf '%s\n' "$report" >&2
  echo "Fix the link or the target path, then re-run 'npm run check:doc-links'." >&2
  exit 1
fi

echo "All documentation links resolve."
