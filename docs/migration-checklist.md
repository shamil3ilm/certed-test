# Migration Checklist

- Status: Active checklist
- Purpose: Keep schema, RLS, docs, and tests aligned whenever database migrations change the system.

## Use this checklist when

- adding a new migration
- changing RLS
- changing helper-function authority
- adding a new table
- changing access behavior
- changing a hot-path query shape or index strategy

## 1. Migration design

1. Is this change append-only?
2. Is the migration name specific and readable?
3. Does the migration do one coherent job?
4. If the change is risky, is it broken into smaller steps?

## 2. Schema and policy correctness

1. Are referenced tables and columns current and correct?
2. Are referenced helper functions current and correct?
3. If RLS changes, do the policy names match the live chain?
4. Does the migration preserve intended security boundaries?
5. Does the migration fail closed where appropriate?

## 3. App alignment

1. Does the application code need to change for this migration?
2. Do any guards, persona rules, or capability rules need updates?
3. Do any page loaders or service commands need updates?
4. Does mock mode need matching support?

## 4. Documentation alignment

Update any affected docs in the same workstream:

- `README.md`
- `docs/setup-guide.md`
- `docs/schema-reference.md`
- `docs/rls-policy-inventory.md`
- `docs/persona-model.md`
- `supabase/README.md`

## 5. Rebuild alignment

1. Does `supabase/rebuild/0000_full_rebuild.sql` need to be updated?
2. Does the rebuild still represent the end state of the live migration chain?

## 6. Test alignment

1. Add or update unit tests where behavior changes.
2. Add or update E2E checks where workflow changes.
3. If access rules changed, update permission coverage.

## 7. Verification

1. Can the migration apply cleanly?
2. Are the expected tables, helpers, indexes, and policies present afterwards?
3. Are there any transitional paths that must be tracked for later cleanup?

## 8. Completion rule

A migration change is not complete until:

1. schema is correct
2. docs are updated
3. tests are aligned
4. rebuild state is aligned if needed
