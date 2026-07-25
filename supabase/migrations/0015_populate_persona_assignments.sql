-- Populate persona_assignments from profiles.role and mentorships
-- Date: 2026-07-16
-- Purpose: Migrate existing personas to the new multi-persona model atomically

-- Step 1: Migrate all existing roles from profiles.role to persona_assignments
INSERT INTO persona_assignments (profile_id, persona_name, scope_type, status)
SELECT
  id,
  CASE
    WHEN role = 'teacher' THEN 'tutor'::persona_name
    -- Postgres forbids a direct enum->enum cast (user_role -> persona_name);
    -- route through text. admin/sub_admin/student exist in both enums.
    ELSE role::text::persona_name
  END,
  'global'::persona_scope_type,
  CASE WHEN status = 'active' THEN 'active' ELSE 'inactive' END
FROM profiles
WHERE role IS NOT NULL;

-- Step 2: Extract mentor relationships from the mentorships table
-- Add student-scoped 'mentor' personas for each tutor-student mentorship
INSERT INTO persona_assignments (profile_id, persona_name, scope_type, scope_id, status)
SELECT
  teacher_id,
  'mentor'::persona_name,
  'student'::persona_scope_type,
  student_id,
  CASE WHEN active THEN 'active' ELSE 'inactive' END
FROM mentorships
WHERE teacher_id IS NOT NULL AND student_id IS NOT NULL
-- ON CONFLICT: tutor may already have tutor persona, but mentor is different (student-scoped)
ON CONFLICT (profile_id, persona_name, scope_id) DO NOTHING;

-- Verification query: count personas by type
-- Run this to verify migration:
-- SELECT persona_name, COUNT(*) as count FROM persona_assignments GROUP BY persona_name ORDER BY count DESC;
