# RLS Policy Inventory

Reference for the intended end-state Row-Level Security policies after applying
migrations `0001`–`0017` (or a fresh build from `supabase/rebuild/0000_full_rebuild.sql`).

## Verification

After applying migrations, run:

```sql
SELECT schemaname, tablename, policyname
  FROM pg_policies
 WHERE schemaname = 'public'
 ORDER BY tablename, policyname;
```

Compare the output against the expected policies below — it should match exactly
(no extra policies, no missing policies). Expected total: ~40 policies.

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
| enrollments | enrollments_read | Admin OR teacher OR student self, hardened by 0017 |
| enrollments | enrollments_admin_write | Admin writes enrollments |
| class_teachers | class_teachers_read | Admin OR teacher self |
| class_teachers | class_teachers_admin_write | Admin writes |
| mentorships | mentorships_read | Admin OR teacher/student self, hardened by 0017 |
| mentorships | mentorships_admin_write | Admin writes |
| announcements | announcements_read | Admin OR enrolled OR teacher OR global |
| announcements | announcements_insert | Admin OR teacher |
| announcements | announcements_update | Admin OR teacher |
| resources | resources_read | Admin OR enrolled OR teacher |
| resources | resources_insert | Admin OR teacher |
| resources | resources_update | Admin OR teacher |
| assignments | assignments_read | Admin OR enrolled OR teacher |
| assignments | assignments_insert | Admin OR teacher |
| assignments | assignments_update | Admin OR teacher |
| submissions | submissions_read | Admin OR teacher OR student self, hardened by 0017 |
| submissions | submissions_insert | Student self in enrolled class |
| submissions | submissions_update | Admin OR student self, hardened by 0017 |
| comments | comments_read | Polymorphic (submission/resource/meet access) |
| comments | comments_insert | Polymorphic (same) |
| meet_links | meet_links_read | Admin OR teacher OR enrolled OR global |
| meet_links | meet_links_write | Admin OR teacher |
| persona_assignments | Users can read own persona assignments | User reads own only (0014) |
| persona_assignments | Admins can read all persona assignments | Admin reads all (0014) |
| persona_assignments | Only admins can insert persona assignments | Admin writes only (0014) |
| persona_assignments | Only admins can update persona assignments | Admin writes only (0014) |
| persona_assignments | Only admins can delete persona assignments | Admin deletes only (0014) |
| receipts | receipts_read | Admin OR student self, hardened by 0017 |
| receipts | receipts_admin_write | Admin writes |
| receipt_lines | receipt_lines_read | Admin OR student self, hardened by 0017 |
| receipt_lines | receipt_lines_admin_write | Admin writes |
| payslips | payslips_read | Admin OR teacher self, hardened by 0017 |
| payslips | payslips_admin_write | Admin writes |
| payslip_lines | payslip_lines_read | Admin OR teacher self, hardened by 0017 |
| payslip_lines | payslip_lines_admin_write | Admin writes |
| reminders | reminders_all | User self only |
| attendance | attendance_read | Admin OR teacher OR student self, hardened by 0017 |
| audit_log | audit_read | Admin only |
| audit_log | audit_admin_insert | Admin only |
| timetable_slots | timetable_slots_read | Admin OR teacher OR enrolled |
| timetable_slots | timetable_slots_write | Admin OR teacher (not admin-only) |

## Checklist

- [ ] All expected policies exist
- [ ] No duplicate policies (same table, different names, same purpose)
- [ ] All unit tests pass
- [ ] All E2E persona journeys pass
- [ ] Policy count is ~40 total
