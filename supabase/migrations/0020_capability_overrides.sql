-- Capability overrides: admin-managed, per-profile exceptions to the persona
-- baseline. A profile's effective capabilities = persona baseline, then explicit
-- allow, then explicit deny (deny beats allow). Hard-rule capabilities
-- (e.g. manageAdminTier) are never grantable/removable here and are enforced in
-- application code (src/lib/capabilities.resolveCapabilities) + a status guard.
--
-- Phase 1 scope: the table supports scoped overrides for the future (scope_type
-- reuses persona_scope_type), but only GLOBAL, ACTIVE rows are consumed by
-- resolution today. Management is admin-only.

CREATE TABLE capability_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny')),
  scope_type persona_scope_type NOT NULL DEFAULT 'global',
  scope_id UUID, -- class_id / student_id / etc., only for non-global scopes
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- scope_id is set only for non-global scopes (mirrors persona_assignments)
  CONSTRAINT capability_overrides_scope_consistency CHECK (
    (scope_type = 'global' AND scope_id IS NULL) OR
    (scope_type != 'global' AND scope_id IS NOT NULL)
  )
);

-- One row per (profile, capability, effect, scope). effect is part of the key so
-- an allow and a deny for the same capability+scope can coexist; resolution then
-- applies deny-beats-allow. COALESCE folds the nullable scope_id into the key.
CREATE UNIQUE INDEX uq_capability_overrides_identity
  ON capability_overrides (profile_id, capability, effect, scope_type, COALESCE(scope_id::text, 'global'));

-- Resolution hot path: a profile's active global overrides.
CREATE INDEX idx_capability_overrides_resolve
  ON capability_overrides (profile_id)
  WHERE status = 'active' AND scope_type = 'global';

COMMENT ON TABLE capability_overrides IS
'Admin-managed per-profile capability exceptions layered over the persona baseline.
Precedence: hard rule > explicit deny > explicit allow > persona default. Only
active, global rows are consumed by resolution today; scoped rows are reserved.';

-- RLS. Policies resolve the caller by profile.id, not auth.uid() (which is only
-- the authentication identity), matching persona_assignments.
ALTER TABLE capability_overrides ENABLE ROW LEVEL SECURITY;

-- A user can read their own overrides (so their session resolves its capabilities).
CREATE POLICY "Users can read own capability overrides"
  ON capability_overrides
  FOR SELECT
  USING (
    profile_id = (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

-- Admins can read every override (for the management UI).
CREATE POLICY "Admins can read all capability overrides"
  ON capability_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        AND pa_admin.persona_name = 'admin'::persona_name
        AND pa_admin.status = 'active'
    )
  );

-- Only admins can create capability overrides.
CREATE POLICY "Only admins can insert capability overrides"
  ON capability_overrides
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        AND pa_admin.persona_name = 'admin'::persona_name
        AND pa_admin.status = 'active'
    )
  );

-- Only admins can update capability overrides (e.g. disable).
CREATE POLICY "Only admins can update capability overrides"
  ON capability_overrides
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        AND pa_admin.persona_name = 'admin'::persona_name
        AND pa_admin.status = 'active'
    )
  );

-- Only admins can delete capability overrides.
CREATE POLICY "Only admins can delete capability overrides"
  ON capability_overrides
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM persona_assignments pa_admin
      WHERE pa_admin.profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
        AND pa_admin.persona_name = 'admin'::persona_name
        AND pa_admin.status = 'active'
    )
  );
