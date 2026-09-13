-- ============================================================================
-- STEP 0 of 2 - prepare an EMPTY production database for the rebuild snapshot
-- ============================================================================
--
--   *** THIS DESTROYS EVERYTHING IN THE public SCHEMA. ***
--
-- Run it ONLY on a database that has no data you want - a newly created
-- Supabase project, before anything has been put in it. Running it on a
-- populated database deletes every table, row and policy in `public`.
--
-- WHY IT IS NEEDED
-- PROD-1 is a pg_dump of the fully migrated schema, and like every pg_dump it
-- begins with `CREATE SCHEMA public`. Every fresh Supabase project already has
-- a `public` schema, so PROD-1 stops on its 38th line with
-- `ERROR: schema "public" already exists` unless this has been run first.
-- The project's own scripts/test-privilege-parity.sh does exactly this before
-- applying the same snapshot.
--
-- HOW TO CHECK YOU ARE ON THE RIGHT DATABASE
-- Run the SELECT below on its own first. On a project that is ready for this,
-- it returns zero rows. If it returns ANY table names, stop - that database
-- has content, and this script would destroy it.
-- ============================================================================

-- 1. LOOK BEFORE YOU DROP. Expect: zero rows.
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- 2. Only once the above returned nothing, run this line.
drop schema if exists public cascade;

-- PROD-1 recreates the schema itself, so nothing else is needed here.
-- Next: run PROD-1_full_rebuild_0001-0106.sql, then PROD-2_verify_after_rebuild.sql.
