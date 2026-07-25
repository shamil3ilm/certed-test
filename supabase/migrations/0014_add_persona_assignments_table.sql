-- Add the persona_assignments table: the authorization model.
-- Supports multiple personas per profile, scoped personas (e.g. mentor-for-a-
-- student), and future persona types without schema changes.

-- Create enum for persona types
CREATE TYPE persona_name AS ENUM (
  'admin',
  'sub_admin',
  'tutor',
  'mentor',
  'student',
  -- Future personas (placeholders)
  'guardian',
  'finance_operator',
  'assistant',
  'executive'
);

-- Create enum for scope types
CREATE TYPE persona_scope_type AS ENUM (
  'global',      -- Academy-wide (e.g., admin, tutor)
  'class',       -- Scoped to a class_id
  'student',     -- Scoped to a student_id (e.g., mentor for specific student)
  'finance',     -- Scoped to finance operations
  'reporting'    -- Scoped to reporting access
);

-- Create persona_assignments table
CREATE TABLE persona_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  persona_name persona_name NOT NULL,
  scope_type persona_scope_type NOT NULL DEFAULT 'global',
  scope_id UUID, -- class_id, student_id, etc. depending on scope_type
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
  assigned_at TIMESTAMP NOT NULL DEFAULT now(),

  -- Ensure one persona per scope per user
  UNIQUE(profile_id, persona_name, scope_id),

  -- Validate: scope_id is only set for non-global scopes
  CONSTRAINT scope_consistency CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type != 'global' AND scope_id IS NOT NULL)
  )
);

-- Create indexes for hot paths
CREATE INDEX idx_persona_assignments_profile_id ON persona_assignments(profile_id);
CREATE INDEX idx_persona_assignments_persona_name ON persona_assignments(persona_name);
CREATE INDEX idx_persona_assignments_scope ON persona_assignments(scope_type, scope_id) WHERE scope_id IS NOT NULL;
CREATE INDEX idx_persona_assignments_status ON persona_assignments(status);
CREATE INDEX idx_persona_assignments_active ON persona_assignments(profile_id, persona_name) WHERE status = 'active';

COMMENT ON TABLE persona_assignments IS
'Authorization model: personas (global + scoped) per profile. Global personas are
kept in sync with profiles.role (the account''s fixed identity); scoped personas
(e.g. mentor-for-a-student) come from their own tables such as mentorships.';

-- RLS. Policies resolve the caller by profile.id (persona_assignments.profile_id),
-- not auth.uid() (auth.uid() is only the authentication identity).
ALTER TABLE persona_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own persona assignments
-- Resolves caller's profile.id via subquery, then compares to persona_assignments.profile_id
CREATE POLICY "Users can read own persona assignments"
  ON persona_assignments
  FOR SELECT
  USING (
    profile_id = (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: Admins can read all persona assignments (for user management)
-- Admin check: caller has admin persona in their own persona_assignments
CREATE POLICY "Admins can read all persona assignments"
  ON persona_assignments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (
        SELECT id FROM profiles WHERE auth_user_id = auth.uid()
      )
      AND pa_admin.persona_name = 'admin'::persona_name
      AND pa_admin.status = 'active'
    )
  );

-- Policy: Only admins can insert persona assignments
CREATE POLICY "Only admins can insert persona assignments"
  ON persona_assignments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (
        SELECT id FROM profiles WHERE auth_user_id = auth.uid()
      )
      AND pa_admin.persona_name = 'admin'::persona_name
      AND pa_admin.status = 'active'
    )
  );

-- Policy: Only admins can update persona assignments
CREATE POLICY "Only admins can update persona assignments"
  ON persona_assignments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (
        SELECT id FROM profiles WHERE auth_user_id = auth.uid()
      )
      AND pa_admin.persona_name = 'admin'::persona_name
      AND pa_admin.status = 'active'
    )
  );

-- Policy: Only admins can delete persona assignments
CREATE POLICY "Only admins can delete persona assignments"
  ON persona_assignments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (
        SELECT id FROM profiles WHERE auth_user_id = auth.uid()
      )
      AND pa_admin.persona_name = 'admin'::persona_name
      AND pa_admin.status = 'active'
    )
  );
