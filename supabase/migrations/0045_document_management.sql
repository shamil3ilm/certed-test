-- 0045_document_management.sql
--
-- Turn `resources` into a proper document library: predefined categories (not
-- user-created tags), richer metadata, download tracking, and a staff/class
-- visibility gate. Fully backward-compatible - existing rows keep their data and
-- fall into the General Documents category with class-wide visibility.
--
-- Storage model is unchanged: a document is still a Google Drive link. This adds
-- the organisation + access layer on top, not file storage.

begin;

-- Predefined, fixed categories. An enum (not free text) enforces "no custom
-- categories" at the database boundary.
do $$ begin
  create type document_category as enum (
    'question_papers',
    'practice_sheets',
    'academic_resources',
    'general_documents'
  );
exception when duplicate_object then null; end $$;

-- Who may see a document. 'class' = every class member (incl. students);
-- 'staff' = admin/tutor/mentor only (hidden from enrolled students).
do $$ begin
  create type document_visibility as enum ('class', 'staff');
exception when duplicate_object then null; end $$;

alter table resources
  add column if not exists category document_category not null default 'general_documents',
  add column if not exists description text,
  add column if not exists subject text,
  add column if not exists file_type text,
  add column if not exists download_count integer not null default 0,
  add column if not exists visibility document_visibility not null default 'class';

-- The category sections read (class_id, category, status); subject powers a filter.
create index if not exists resources_class_category_idx on resources (class_id, category, status);
create index if not exists resources_subject_idx on resources (subject) where subject is not null;

-- Recreate the read policy to honour visibility: a staff-only document is never
-- returned to an enrolled student, even via the Data API. Admin and
-- teachers-of-class (teaches_class already includes mentors of an enrolled
-- student, per 0043) still see everything. Only the STUDENT clause gains the gate.
drop policy if exists resources_read on resources;
create policy resources_read on resources for select using (
  is_active_admin()
  or teaches_class(class_id)
  or (is_enrolled(class_id) and status = 'active' and visibility = 'class')
);

commit;
