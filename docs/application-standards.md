# Application Standards

- Date: 2026-07-16
- Status: Active baseline
- Purpose: Define the default structural and coding standards that all ongoing overhaul work must follow.

---

## 1. File Paths

1. Route files must use Next.js conventions only where required: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`.
2. Shared library files under `src/lib/` must use kebab-case file names, for example `actor-context.ts`, `calendar-events.ts`, `rate-limit.ts` (unified with the kebab-case app-layer helpers; the module's exported symbols stay camelCase).
3. React component files outside route conventions must use PascalCase file names, for example `PortalHeader.tsx`, `SubmitForm.tsx`.
4. Folder names must stay lower-case unless a framework convention requires otherwise.
5. New shared domains should prefer `src/lib/services/<domain>.ts` or `src/lib/services/<area>/<domain>.ts` instead of scattering helpers into pages.

## 2. File Naming Convention

1. One file should own one primary concern.
2. Avoid vague names such as `utils.ts`, `helpers.ts`, or `common.ts` unless the scope is truly generic and stable.
3. Use domain-specific names for service modules, for example `class-attendance.ts` instead of generic loader names.
4. Action files should be named for their transport role, for example `actions.ts`, `manage-actions.ts`, `submit-actions.ts`, until the route structure is simplified further.

## 3. Coding Pattern

1. Pages, route handlers, and server actions must stay thin.
2. Business rules, validation, normalization, permission checks, and audit writes belong in services.
3. Shared transport behavior must use shared helpers instead of local JSON/result shapes.
4. Repeated parsing or orchestration should be promoted into a shared helper once it appears in more than one surface.
5. Comments must be plain ASCII unless the file already has a justified Unicode requirement.

## 4. Methods

1. Service methods should use verb-first names: `listProfilesByRole`, `createEventFromApiInput`, `markAttendance`.
2. Validation helpers should use `validate...` names.
3. Action/route adapter helpers should use `...FromActionInput` or `...FromApiInput` names.
4. Boolean helpers should use `is...`, `has...`, or `can...`.

## 5. Variables

1. Use lower camel case for variables and function parameters.
2. Prefer explicit domain names over abbreviations unless the abbreviation is already standard in the file.
3. Request actor variables should default to `me` for authenticated action/route flows and `actor` for service-layer parameters.
4. Avoid one-letter names except for short callback parameters with obvious local meaning.

## 6. Constants

1. Shared constants must use `UPPER_SNAKE_CASE`.
2. User-facing shared messages must live in a shared constant module when reused across surfaces.
3. Literal sets that define policy or behavior should move to named constants instead of being duplicated inline.

## 7. Error Codes

1. Shared application error codes must come from `src/lib/api/error-codes.ts`.
2. The baseline shared codes are:
   - `UNAUTHORIZED`
   - `FORBIDDEN`
   - `ACCESS_REVOKED`
   - `NO_ACCESS`
   - `NOT_FOUND`
   - `INVALID_REQUEST`
   - `INVALID_INPUT`
   - `RATE_LIMITED`
   - `INTERNAL_ERROR`
3. API and action helpers may include a code alongside the human-readable message where the caller benefits from stable programmatic handling.
4. Do not invent route-local error-code strings when a shared code already exists.

## 8. Immediate Adoption Rule

1. All new files and all touched files in the overhaul must follow this standard.
2. Existing legacy naming can remain temporarily where renaming would create broad churn, but any touched hotspot should be normalized when safe.
3. Mojibake or unreadable characters in comments, user-facing copy, or developer-facing docs should be treated as defects and removed when found.
