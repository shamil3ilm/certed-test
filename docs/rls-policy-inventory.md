# RLS Policy Inventory

Reference for the intended end-state Row-Level Security policies after applying
migrations `0001`–`0021` (or a fresh build from `supabase/rebuild/0000_full_rebuild.sql`).

## Verification

After applying migrations, run:

```sql
SELECT schemaname, tablename, policyname
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;
```

Compare the output against the expected policies below — it should match exactly
(no extra policies, no missing policies). Expected total: ~50 policies (includes the
5 capability_overrides policies added in 0020).

## Expected policies

| Table | Policy | Purpose |
|-------|--------|---------|
| profiles | profiles_self_read | User reads own profile OR admin |
| profiles | profiles_self_update | User updates own profile OR admin |
| profiles | profiles_admin_write | Admin writes any profile |
| org_settings | org_read | Active admin only (0017) |
| org_settings | org_admin_write | Active admin writes only (0017) |
| classes | classes_read | Active users read classes |
| classes | classes_admin_write | Admin writes classes |
| enrollments | enrollments_read | Admin OR tutor OR student self, hardened by 0017 |
| enrollments | enrollments_admin_write | Admin writes enrollments |
| class_tutors | class_tutors_read | Admin OR tutor self |
| class_tutors | class_tutors_admin_write | Admin writes |
| mentorships | mentorships_read | Admin OR mentor/student self (mentor_id per 0021), hardened by 0017 |
| mentorships | mentorships_admin_write | Admin writes |
| announcements | announcements_read | Admin OR enrolled OR tutor OR global |
| announcements | announcements_insert | Admin OR tutor |
| announcements | announcements_update | Admin OR tutor |
| resources | resources_read | Admin OR enrolled OR tutor |
| resources | resources_insert | Admin OR tutor |
| resources | resources_update | Admin OR tutor |
| assignments | assignments_read | Admin OR enrolled OR tutor |
| assignments | assignments_insert | Admin OR tutor |
| assignments | assignments_update | Admin OR tutor |
| submissions | submissions_read | Admin OR tutor OR student self, hardened by 0017 |
| submissions | submissions_insert | Student self in enrolled class |
| submissions | submissions_update | Admin OR student self, hardened by 0017 |
| comments | comments_read | Polymorphic (submission/resource/meet access) |
| comments | comments_insert | Polymorphic (same) |
| meet_links | meet_links_read | Admin OR tutor OR enrolled OR global |
| meet_links | meet_links_write | Admin OR tutor |
| persona_assignments | Users can read own persona assignments | User reads own only (0014) |
| persona_assignments | Admins can read all persona assignments | Admin reads all (0014) |
| persona_assignments | Only admins can insert persona assignments | Admin writes only (0014) |
| persona_assignments | Only admins can update persona assignments | Admin writes only (0014) |
| persona_assignments | Only admins can delete persona assignments | Admin deletes only (0014) |
| receipts | receipts_read | Admin OR student self, hardened by 0017 |
| receipts | receipts_admin_write | Admin writes |
| receipt_lines | receipt_lines_read | Admin OR student self, hardened by 0017 |
| receipt_lines | receipt_lines_admin_write | Admin writes |
| payslips | payslips_read | Admin OR tutor self, hardened by 0017 |
| payslips | payslips_admin_write | Admin writes |
| payslip_lines | payslip_lines_read | Admin OR tutor self, hardened by 0017 |
| payslip_lines | payslip_lines_admin_write | Admin writes |
| reminders | reminders_all | User self only |
| attendance | attendance_read | Admin OR tutor OR student self, hardened by 0017 |
| audit_log | audit_read | Admin only |
| audit_log | audit_admin_insert | Admin only |
| timetable_slots | timetable_slots_read | Admin OR tutor OR enrolled |
| timetable_slots | timetable_slots_write | Admin OR tutor (not admin-only) |
| conversations | conversations_read | Participant OR admin (0018) |
| conversations | conversations_insert | created_by = current_profile_id() (0018) |
| conversation_participants | conversation_participants_read | Participant of the conversation (0018) |
| messages | messages_read | Participant of the conversation (0018) |
| messages | messages_insert | sender = current_profile_id() AND conversation member (0018) |

## Checklist

- [ ] All expected policies exist
- [ ] No duplicate policies (same table, different names, same purpose)
- [ ] All unit tests pass
- [ ] All E2E persona journeys pass
- [ ] Policy count is ~45 total
