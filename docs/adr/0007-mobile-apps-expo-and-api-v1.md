# 0007 — Native apps in Expo, over a versioned API that reuses the existing guards

- **Date:** 2026-09-29
- **Status:** Accepted — decided, not yet built. Preparatory work in the web repo has landed (this commit); the API layer and the app have not started.

## Context

The academy wants the portal on the App Store and Google Play, for students and tutors. Admin, finance and mentor workflows stay on the web, where they belong.

Two facts about this codebase shape every option:

**There is no general-purpose API.** The write surface is 138 server actions, which are a transport between this React app and its own server, not something another client can call.

**Authority lives in server code as much as in the database.** There are 191 `requireCapability`/`requireRole` call sites on top of 145 RLS policies, and several guard pairs differ by exactly one persona — a mentor may mark attendance but not clear a session, may oversee but never grade. In the places where a write goes through the service-role client, RLS never runs at all and the app guard is the only control. A client talking straight to Supabase would bypass all 191 of those decisions.

Two further requirements were stated when the decision was made: **UI/UX quality matters to the people using it**, and **the person maintaining this will not always be the person who wrote it**. The product is also expected to grow **live sessions inside the app** rather than linking out to Google Meet.

## Decision

**Expo / React Native**, in a separate repository, over a new **`/api/v1`** that calls the same services and the same guards the web uses.

The successor requirement decided the framework. This product is already ~55,000 lines of TypeScript, React and Supabase. Flutter or Kotlin Multiplatform would mean whoever inherits it must know two languages, or the academy must staff two people — and the predictable failure is hiring a web developer and watching the app rot. Expo keeps the whole product inside one skill set, and is the only serious option with first-party over-the-air updates, so a JavaScript-level bug can be fixed the same day instead of waiting on store review.

**Rejected, with reasons, so this is not relitigated from memory:**

| Option                             | Why not                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacitor over the existing web UI | Cheapest by far — one UI forever, no API layer — but it is a web view, and UI/UX was named a priority. Apple also reviews web-view apps for native depth under guideline 4.2.                                                                                               |
| Flutter                            | The strongest challenger: better tooling, very consistent UI. Loses on one thing only — a second language for a product that is otherwise entirely TypeScript. Revisit if the team grows past one developer, or if pixel-identical cross-platform UI becomes a requirement. |
| Kotlin Multiplatform + Compose     | Compelling for a Kotlin shop; this is not one. Its WebRTC story also means per-platform work for live sessions.                                                                                                                                                             |
| Swift + Kotlin natively            | Three codebases to staff for one academy.                                                                                                                                                                                                                                   |
| PWA / Android TWA                  | No iOS store listing, and the same web-view UX ceiling.                                                                                                                                                                                                                     |

**Direct-to-Supabase was rejected for data access.** It is much faster to build and it bypasses every one of the 191 server-side checks. Re-expressing that authority as database policy is a large, high-risk rewrite of the security model; reusing it from an API is not.

**The API is additive.** New routes under a new path; no existing route or server action changes. The existing `/api/*` surface keeps cookie authentication and stays unversioned, because versioning exists to protect clients you cannot update and those only ever serve the web app from the same deployment.

## Consequences

- **A permanent version-skew tax.** Old builds live on phones for months, so every server change needs a compatibility thought it does not need today. `/api/v1` and a minimum-supported-build gate exist from the first commit for that reason; a build shipped without a kill switch can never be turned off.
- **An annual platform tax of roughly 3–5 weeks**, before any feature work: Google raises the required target API level yearly, Apple requires builds against the current SDK, and Expo ships a major upgrade about annually.
- **The UI is written twice.** React and React Native are the same language and different component worlds.
- **A bad web deploy takes the app's backend down with it**, because the API ships with the web app. Accepted deliberately in exchange for one identity, one rule set and one database.
- **Native dependencies are kept few and each is justified in an ADR.** This is the mitigation for the one real advantage Flutter had: a self-contained toolchain ages better than twenty native modules.

## Follow-up work

Landed with this ADR, in the web repo:

- `getStudentGradeTrajectory` became `getOwnGradeTrajectory(actor)` — it read through the service-role client with a caller-supplied id and no check, which would have become an IDOR the first time a route forwarded a path parameter to it.
- `canEditStaffNote` has one definition in `src/lib/permission/staff-note.ts`, used by both the form that hides the field and the action that writes it.
- The attendance form parsing moved beside its service as `markAttendanceFromActionInput`.
- Six copies of the cron auth guard became `src/lib/api/cron-auth.ts`.

**Shared contracts — decided, not yet executed.** The zod schemas are the app's input contracts and should be shared rather than retyped. They are already portable: 22 of the 23 schema modules import nothing from the server. The single exception is `src/lib/services/assignments/validation.ts`, which type-imports `AssignmentType` from `src/lib/data/assignments.ts`. Moving that string union to a server-free module (it has 24 references across 6 files) is the one prerequisite for extracting the schemas into a package the app can consume. Do it at the start of the mobile work, not before — it is the first step of that work, not of this one.

Not started: the bearer client, the `/api/v1` factory, the `Map`/`Set` serializer, the proxy change admitting `/api/v1` to the public prefixes, and the app itself.
