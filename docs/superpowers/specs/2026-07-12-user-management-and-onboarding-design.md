# User Management & Onboarding — Design

**Date:** 2026-07-12
**Goal:** Add a two-tier admin model and let allowlisted users self-register with a
password (no Google required), gated by an admin-issued one-time setup code.

---

## 1. Roles

Keep the internal `admin` role as-is (it already means "full access"); add one new role.

| Role (internal) | UI label | Access |
|---|---|---|
| `admin` | **Super Admin** | Everything (unchanged) |
| `sub_admin` *(new)* | **Sub Admin** | **Full user management for teacher/student accounts** — add, view list, edit, revoke/restore. Cannot manage admin-tier accounts or assign admin roles; no finance, no class management, no settings |
| `teacher` | Tutor | unchanged |
| `student` | Student | unchanged |

**Why relabel, not rename:** renaming `admin` → `super_admin` would ripple through every
RLS policy (`is_active_admin()`) and in-code `role === 'admin'` check on a live deploy —
high risk, no functional gain. `admin` stays the internal name; "Super Admin" is display only.

### Permission matrix
| Capability | Super Admin | Sub Admin | Teacher | Student |
|---|:--:|:--:|:--:|:--:|
| Add / edit / revoke / restore **teacher & student** | ✓ | ✓ | ✗ | ✗ |
| View user list | ✓ | ✓ | ✗ | ✗ |
| Create/edit/revoke **admin-tier** accounts, or assign admin roles | ✓ | ✗ | ✗ | ✗ |
| Finance / classes / settings | ✓ | ✗ | (own) | (own) |

**Guard (security):** a Sub Admin's edit/revoke apply to **teacher/student targets only**. They
cannot edit or revoke an `admin`/`sub_admin` account, and cannot set anyone's role to
`admin`/`sub_admin`. This keeps the admin tier managed exclusively by Super Admins — otherwise a
Sub Admin could revoke the Super Admin (lockout) or promote a puppet account to admin (escalation).

`is_active_admin()` (RLS) stays **`admin` only**. Sub Admin's user-add/list runs through the
existing **service-role server action**, already gated in code — so `sub_admin` gets no broad
database access.

---

## 2. Self-registration with setup code

1. A Super/Sub Admin adds a user (email + role). On create, the system generates a **one-time
   setup code**, shown to the admin **once**, and stores only its **SHA-256 hash**.
2. The admin shares the code out-of-band (WhatsApp / in person).
3. The user visits **`/register`** → enters **email + setup code + new password**. Valid only if:
   the email is allowlisted, not yet claimed (`auth_user_id is null`), and the code hash matches
   and hasn't expired → `auth.admin.createUser({ email, password, email_confirm: true })` →
   set `auth_user_id` → clear the code.
4. **Login page** gains an **email + password** form beside "Continue with Google". Google unaffected.

**Defaults:** setup code = 8-char alphanumeric, **7-day** expiry; min password **8 chars**;
register page at `/register`, linked from `/login`.

**Security properties:** code stored hashed + single-use + expiring (an outsider who only knows an
allowlisted email cannot claim it); passwords hashed by Supabase Auth (bcrypt), never in our tables;
Sub Admin cannot mint admins.

---

## 3. Data model changes (migration `0007`)

```sql
-- role: allow the new value (recreate CHECK if one exists)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin','sub_admin','teacher','student'));

-- one-time setup code for self-registration
alter table profiles add column setup_code_hash text;
alter table profiles add column setup_code_expires_at timestamptz;
```

RLS: `is_active_admin()` unchanged. `setup_code_hash` is only ever read/written by the
service-role server actions (register + add-user), never exposed to clients.

---

## 4. Files to touch

- **DB:** `supabase/migrations/0007_admin_tiers_and_setup_codes.sql` + the ALTER SQL to run on Supabase.
- **Types/validation:** `src/lib/auth/profile.ts` (role union), `src/lib/validation/user.ts` (role enum, password rules).
- **Gates:** `requireRole` — add-user, list, **edit, revoke/restore** allow `['admin','sub_admin']`; everything else stays `['admin']`. Sub-admin edit/revoke actions carry an extra guard: **target must be teacher/student** and the assigned role can't be admin-tier (no escalation, no touching the admin tier).
- **Users hub:** `src/app/(prt)/admin/users/page.tsx` + `actions.ts` — Sub Admin sees Add + list + edit + revoke controls, but the controls are shown **only on teacher/student rows** (admin-tier rows are read-only to them); the role dropdown is restricted to teacher/student; generate + surface the setup code on add.
- **Nav/labels:** `src/app/(prt)/nav.ts` (sub_admin → Dashboard + Users), `src/app/(prt)/ui.tsx` `roleLabel`.
- **New:** `/register` page + server action; email/password login form on `/login`; setup-code helpers (generate + hash + verify).

---

## 5. Verification

- Local: `tsc`, `next build`, unit tests (mock mode).
- **`auth.admin.createUser` only runs against real Supabase**, so register/login end-to-end is
  verified on the `certed-test` deploy after the migration is run — not in mock.
