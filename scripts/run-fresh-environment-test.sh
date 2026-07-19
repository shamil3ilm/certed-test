#!/bin/bash

# Phase 4.5: Fresh environment build and validation runner
# Usage: bash scripts/run-fresh-environment-test.sh

set -e

echo "Phase 4.5 Fresh Environment Build and Test"
echo "=========================================="
echo ""

echo "Checking environment..."

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "Missing NEXT_PUBLIC_SUPABASE_URL"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Missing SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi

echo "OK: Supabase credentials found"
echo ""

echo "Applying migrations (0001-0017)..."
supabase db push
echo "OK: Migrations applied"
echo ""

echo "Seeding test data..."
npx ts-node scripts/seed-test-data.ts
echo "OK: Test data seeded"
echo ""

echo "Verifying schema and migration results..."
npx ts-node scripts/verify-migrations.ts
echo "OK: Migration verification passed"
echo ""

echo "Running unit tests..."
npm test -- --run
echo "OK: Unit tests passed"
echo ""

echo "Running E2E persona tests..."
npm run test:e2e -- tests/e2e/persona-journeys.spec.ts
echo "OK: E2E tests passed"
echo ""

echo "=========================================="
echo "Fresh Environment Build Successful"
echo ""
echo "Summary:"
echo "  OK: Migration chain 0001-0017 applied"
echo "  OK: Test data populated"
echo "  OK: Schema verified"
echo "  OK: Unit tests passed"
echo "  OK: E2E tests passed"
echo ""
echo "Ready for production staging validation."
