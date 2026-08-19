-- 0065: grant self-service UPDATE on the softer profile columns.
--
-- 0064 added phone/date_of_birth/gender/address/qualifications/bio, and the settings
-- page lets a person self-complete them via the RLS own-row client. But `authenticated`
-- holds column-level UPDATE on `full_name` only (tightened in 0033), so those writes
-- were denied at the GRANT layer -> a 500 on "Save details". Grant UPDATE on exactly
-- the self-serviceable columns.
--
-- Admin-owned fields (class_level, country, guardian_name, guardian_phone, joined_on)
-- are DELIBERATELY NOT granted here - they change only through the service-role admin
-- path (/admin/users/[id]), never by the person themselves. This is the same
-- column-grant defence that keeps a student from self-editing their own class_level.

grant update (phone, date_of_birth, gender, address, qualifications, bio) on table profiles to authenticated;
