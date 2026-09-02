-- 0087_mentee_notes_body_length.sql
-- N-09: mentee_notes.body had no DB-level bound - the 1..2000-char rule lived only in the
-- Zod schema (src/lib/services/mentee-notes.ts: z.string().trim().min(1).max(2000)), and the
-- writer is the SERVICE ROLE, which bypasses that schema on any path that doesn't go through
-- it. Mirror the rule at the boundary as defence-in-depth: a note is never empty (after
-- trimming) and never larger than 2000 characters, whatever the write path.
--
-- Depends on 0078 (mentee_notes).

begin;

alter table mentee_notes
  add constraint mentee_notes_body_length
  check (char_length(body) <= 2000 and char_length(btrim(body)) >= 1);

commit;
