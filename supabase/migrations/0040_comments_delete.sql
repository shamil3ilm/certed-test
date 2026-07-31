-- 0040_comments_delete.sql
--
-- Comments had only read + insert policies (create-once, permanent). Let a
-- comment's AUTHOR delete their own comment (and an admin delete any), matching
-- the is_self_active self-scoping used across the other tables. A tutor/mentor
-- moderating another user's comment is intentionally NOT granted here (that would
-- need the polymorphic entity->class join the insert policy uses); author-delete
-- covers the "remove my own comment" gap. Idempotent.

drop policy if exists comments_delete on comments;
create policy comments_delete on comments for delete using (
  is_active_admin() or is_self_active(author_id)
);
