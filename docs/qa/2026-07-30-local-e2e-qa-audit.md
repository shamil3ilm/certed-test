# Cert-Ed Academia QA Audit

- Date: 2026-07-30
- Environment: local Windows workspace, production build, mock mode, `app.localhost:3100`
- Auditor: Codex acting as senior QA engineer and test architect
- Scope basis: full QA brief from attached request

## 1. Test Strategy

### Objective

Assess production readiness of the classroom-management application across:

- authentication
- role-based access
- core classroom workflows
- CRUD coverage
- security boundaries
- responsive behavior
- regression stability

### Execution model used for this audit

This audit combined:

- static setup review
- docs and architecture review
- local build verification
- unit and API regression execution
- Playwright browser E2E execution against the production build in mock mode

### Constraints

This local environment does **not** provide:

- real Supabase production data
- real email, SMS, push, or payment integrations
- multi-browser farm
- mobile devices
- load-generation infrastructure
- distributed performance telemetry

Accordingly, any items depending on those capabilities are marked `Blocked`, `Not tested`, or `Partially tested`.

## 2. Test Environment and Setup Report

### Observed environment

- Framework: Next.js 14.2.35
- Runtime mode used: production build with mock mode
- E2E target host: `http://app.localhost:3100`
- Mock env source: `.env.local`
- Unit runner: Vitest
- Browser runner: Playwright Chromium

### Verified setup inputs

- `MOCK_MODE=1`
- `NEXT_PUBLIC_MOCK_MODE=1`
- sentinel Supabase env values present for local mock mode
- `APP_HOSTNAME` and `MARKETING_HOSTNAME` present
- production build succeeds locally

### Required host-routing nuance

The portal is host-sensitive.

- Plain `http://127.0.0.1:3100/login` returned an app-host mismatch response path.
- Requests succeed when the host is treated as `app.localhost`.
- Playwright already handles this with `--host-resolver-rules=MAP app.localhost 127.0.0.1`.

### Configuration and prerequisite gaps found

1. No dedicated E2E environment reset script was found for `.mock-db.json`.
2. Playwright specs assume a fresh seed state, but the local mock database persists across runs.
3. Real integration credentials and callback infrastructure are not present in this local environment.
4. No load/stress/soak harness or scripts are present in `package.json`.
5. No multi-browser Playwright project matrix is configured; only Chromium is defined.

### Setup verdict

- Local developer verification: usable
- Full production-like end-to-end certification: not yet achievable from this setup alone

## 3. Role-Permission Matrix

This matrix reflects the current documented live model plus observed navigation and route behavior.

| Role                    | Core access observed                                                                        | Explicit limits observed                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `super-admin` / `admin` | dashboard, messages, classes, calendar, grading, mentees, users, finance, history, settings | none observed in local mock mode                                            |
| `sub-admin`             | dashboard, settings, operational user-management flows                                      | narrower than admin; no evidence of finance/admin-tier powers by default    |
| `tutor`                 | dashboard, messages, classes, calendar, grading, pay slips, class-scoped academic actions   | blocked from admin areas in journey tests; broader scoping suite incomplete |
| `mentor`                | dashboard, messages, students/mentees, settings                                             | dedicated mentor has no class access and no calendar/classroom by default   |
| `student`               | dashboard, classes, classwork, attendance visibility, receipts, calendar, settings          | blocked from finance admin screens in journey tests                         |

Important caveat:

- hybrid tutor+mentor behavior exists in the authorization model and is only partially exercised by the current local suite.

## 4. Module and Feature Inventory

### Marketing

- home
- about
- classes
- blogs
- contact

### Authentication and account access

- login
- register
- auth callback
- access pending
- access revoked
- logout
- profile/settings

### Portal modules

- dashboard
- messages
- notifications
- classroom list
- class stream
- classwork
- attendance
- people
- assignments
- grading
- calendar / timetable
- students / mentees
- admin users
- permissions editor
- finance
- receipts
- pay slips
- report card PDF
- resources
- meetings

### APIs exposed

- assignments
- calendar
- contact
- cron keepalive
- dev login/logout
- events
- logout
- payslips
- receipts
- report-card PDF
- resources download
- timetable

## 5. End-to-End Workflow List

### Workflows covered by existing browser suite

1. Admin creates class -> enrols student -> posts announcement -> issues receipt -> adds user
2. Tutor creates assignment -> comments on submission
3. Student submits assignment via Drive link
4. Mentor opens mentees and is blocked from classroom
5. Student blocked from admin finance
6. Tutor/student dashboard role widgets render
7. Admin grants capability override
8. Admin direct messaging
9. Admin group messaging
10. Messaging non-participant access denial
11. Student notification from message
12. Tutor shares meet link and resource
13. Tutor grades homework and comments
14. Tutor marks attendance and adds reminder
15. Student timetable/materials/grade/attendance/report-card journey
16. Responsive horizontal-overflow sweeps
17. Page/API scoping boundaries for events and admin pages

### Important workflows **not** fully verified in this audit

- forgot-password
- real password reset email flow
- expired reset link
- multi-device login
- real Supabase/RLS flows
- real Google integrations
- real PDF rendering under production infrastructure limits
- payment callbacks
- push/SMS/email delivery
- large-data pagination performance
- restore flows after deletion/void/archive across all modules

## 6. Detailed Test Cases

The table below is the executed and recommended regression core. It is not the final exhaustive enterprise matrix, but it is sufficient to drive immediate release hardening.

| ID            | Module              | Role      | Scenario                              | Preconditions                            | Steps                                | Expected result                              | Actual result                                              | Status          |
| ------------- | ------------------- | --------- | ------------------------------------- | ---------------------------------------- | ------------------------------------ | -------------------------------------------- | ---------------------------------------------------------- | --------------- |
| TC-AUTH-001   | Login               | all       | valid login                           | mock env active                          | login with seeded account            | redirects to dashboard with role nav         | works in browser suite                                     | Pass            |
| TC-AUTH-002   | Login               | student   | direct URL without auth               | signed out                               | open protected route                 | redirect to login                            | not directly executed in this pass                         | Not tested      |
| TC-AUTH-003   | Login               | all       | empty or invalid credentials          | login page available                     | submit bad data                      | validation or uniform failure                | not executed in browser                                    | Not tested      |
| TC-RBAC-001   | Admin pages         | student   | open `/admin/finance`                 | student signed in                        | navigate directly                    | blocked/redirected                           | journey test passed                                        | Pass            |
| TC-RBAC-002   | Classroom pages     | mentor    | open class page without `viewClasses` | mentor signed in                         | open `/classroom/{id}`               | blocked/redirected                           | journey test passed                                        | Pass            |
| TC-RBAC-003   | Event API           | tutor     | create own-class event                | tutor teaches class                      | POST `/api/events` with own class    | `201`                                        | not completed due suite timeout                            | Not tested      |
| TC-RBAC-004   | Event API           | student   | create event                          | student signed in                        | POST `/api/events`                   | `403`                                        | not completed due suite timeout                            | Not tested      |
| TC-DASH-001   | Dashboard           | student   | due work widget visible               | seeded student data                      | open dashboard                       | student-specific panel visible               | passed                                                     | Pass            |
| TC-DASH-002   | Dashboard           | tutor     | submissions widget visible            | seeded tutor data                        | open dashboard                       | tutor-specific panel visible                 | passed                                                     | Pass            |
| TC-DASH-003   | Dashboard           | sub-admin | real non-blank dashboard              | seeded sub-admin                         | open dashboard and settings          | dashboard and settings usable                | passed                                                     | Pass            |
| TC-CLASS-001  | Classroom           | admin     | create class                          | admin signed in                          | create class from classroom page     | class created once                           | browser test hit duplicate-state side effects              | Fail / polluted |
| TC-CLASS-002  | People              | admin     | enrol student                         | class exists                             | enrol Sara                           | student visible in people list               | partially exercised in admin journey                       | Partial         |
| TC-STREAM-001 | Announcements       | admin     | post class announcement               | class exists                             | post title + message                 | single new announcement visible              | duplicate announcement observed in polluted mock state     | Fail / polluted |
| TC-ASSIGN-001 | Assignment create   | tutor     | create assignment                     | tutor signed in                          | create assignment in classwork       | assignment heading visible                   | assignment creation succeeded before later comment failure | Partial         |
| TC-ASSIGN-002 | Submission          | student   | submit Drive link                     | seeded assignment available              | submit link                          | submission accepted with status              | passed                                                     | Pass            |
| TC-ASSIGN-003 | Comments            | tutor     | comment on submission                 | open assignment detail                   | type comment and send                | comment saved                                | send button remained disabled                              | Fail            |
| TC-MSG-001    | Messaging           | admin     | direct message                        | admin signed in                          | select one recipient + message       | thread created, redirect to inbox/thread     | start button remained disabled                             | Fail            |
| TC-MSG-002    | Messaging           | admin     | group message                         | admin signed in                          | select multiple recipients + message | group thread created                         | start group flow failed in same area                       | Fail            |
| TC-MSG-003    | Messaging           | student   | unauthorized thread access            | thread exists without student membership | open thread URL                      | not found / denied                           | not completed due upstream messaging failure               | Blocked         |
| TC-NOTIF-001  | Notifications       | student   | notified of new message               | message created                          | open notifications                   | notification visible                         | blocked by messaging failure                               | Blocked         |
| TC-FIN-001    | Receipts            | admin     | issue receipt                         | finance page seeded                      | issue receipt                        | receipt row visible and PDF/export available | not fully validated due upstream polluted admin journey    | Partial         |
| TC-MOBILE-001 | Global portal shell | all       | no horizontal overflow at 320px       | signed in                                | sweep critical routes                | zero sideways scroll                         | repeated `+8px` overflow found                             | Fail            |

## 7. Test Execution Report

### Commands executed

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npx playwright test --list
npx playwright test
```

### Non-browser verification

| Check               | Result                     |
| ------------------- | -------------------------- |
| `npm run typecheck` | Pass                       |
| `npm run lint`      | Pass                       |
| `npm run test`      | Pass, 77 files / 605 tests |
| `npm run build`     | Pass                       |

### Browser execution

- Total defined Playwright tests: `29`
- Browser executed: Chromium headless
- Result: **partial execution only**
- Reason: suite exceeded local timeout and contains reproducible failures

### Unique Playwright test outcomes observed before runner timeout

- Passed: `7`
- Failed: `16`
- Not reached / incomplete: `6`

### Passed browser journeys observed

1. Student submits assignment via Drive link
2. Mentor sees mentees and is redirected away from classroom
3. Student blocked from admin finance in journey suite
4. Dedicated mentor redirected from class page in journey suite
5. Student and tutor dashboard panels render correctly
6. Sub-admin lands on dashboard and reaches settings
7. Mentor responsive sweep passed on retry

### Failed browser journeys observed

1. Admin capability override persistence test
2. Admin class/enrol/announcement/receipt/add-user journey
3. Tutor assignment-comment journey
4. Direct messaging
5. Group messaging
6. Non-participant thread access flow
7. Notification-on-message flow
8. Tutor meet/resource/comment workflow
9. Tutor assignment/grading/comment workflow
10. Tutor attendance/reminder workflow
11. Student full journey
12. Responsive admin sweep
13. Responsive tutor sweep
14. Responsive student sweep
15. Scoping suite: student blocked-admin-pages test
16. Scoping suite: tutor blocked-admin-pages test

## 8. Defect Report

### QA-2026-001

- Title: Mock E2E environment is not reset between runs, causing state pollution
- Module: test infrastructure / mock mode
- Role: all
- Preconditions: `.mock-db.json` already mutated by prior E2E run
- Steps:
  1. Run Playwright suite once
  2. Re-run without deleting `.mock-db.json`
  3. Observe persisted conversations, announcements, permissions, comments
- Expected: suite starts from clean deterministic seed state
- Actual: browser tests see prior-run records and non-default permission states
- Severity: Major
- Priority: High
- Frequency: Always on repeated runs
- Workaround: delete `.mock-db.json` before browser suite
- Evidence: `tests/e2e/*` comments claim seed reset; no reset script found; failure artifacts show prior records already present

### QA-2026-002

- Title: New direct/group message flow leaves submit button disabled after valid input
- Module: messaging
- Role: admin
- Environment: local mock production build
- Preconditions: signed in as admin
- Steps:
  1. Open `/messages`
  2. Select `Tarun Tutor`
  3. Enter `E2E direct hello`
  4. Attempt to click `Start`
- Expected: button enables and thread is created
- Actual: `Start` remains disabled
- Severity: Critical
- Priority: Highest
- Frequency: Reproducible
- Workaround: None known
- Evidence: `test-results/messaging.../error-context.md`

### QA-2026-003

- Title: Submission comment composer leaves `Send` disabled after tutor enters a comment
- Module: assignment detail / comments
- Role: tutor
- Preconditions: seeded submission exists
- Steps:
  1. Open assignment detail page
  2. Expand comment thread
  3. Type comment
  4. Attempt to send
- Expected: send button enables and comment posts
- Actual: `Send` remains disabled
- Severity: Critical
- Priority: Highest
- Frequency: Reproducible
- Workaround: None known
- Evidence: `test-results/journeys...TUTOR.../error-context.md`

### QA-2026-004

- Title: Portal shell still causes horizontal overflow at 320px on multiple routes
- Module: responsive layout / portal header shell
- Role: admin, tutor, student, mentor
- Preconditions: signed in on narrow mobile viewport
- Steps:
  1. Open portal at `320px` width
  2. Visit dashboard, classroom, calendar, settings, assignment pages
- Expected: no horizontal scroll
- Actual: repeated `+8px` overflow, offender points to top brand link/image container
- Severity: Major
- Priority: High
- Frequency: Reproducible
- Workaround: none
- Evidence: Playwright responsive logs in timeout output

### QA-2026-005

- Title: Permission-editor E2E case is non-idempotent because persisted override state is not normalized by environment reset
- Module: permissions / test infrastructure
- Role: admin
- Preconditions: prior run already granted `Grading queue`
- Steps:
  1. Re-run `admin-permissions.pw.ts`
  2. Open Sara Student permissions
  3. Click `Default`
- Expected: state returns to clean baseline and label `Not in default` is visible deterministically
- Actual: row is already in granted override state from prior run
- Severity: Major
- Priority: High
- Frequency: Reproducible on reused mock DB
- Workaround: delete `.mock-db.json`
- Evidence: `test-results/admin-permissions.../error-context.md`

### QA-2026-006

- Title: Page-level scoping tests are unstable after repeated re-login in long Playwright run
- Module: E2E harness / authentication regression flow
- Role: student, tutor
- Preconditions: long-running suite with repeated cookie clears and re-logins
- Steps:
  1. Run full Playwright suite
  2. Reach `scoping.pw.ts`
  3. Observe login helper timeout on `/login`
- Expected: login form loads reliably for follow-up persona checks
- Actual: `page.fill('input[name=email]')` times out because login page state is not ready / not present
- Severity: Major
- Priority: Medium
- Frequency: Observed in full suite
- Workaround: isolate scoping suite after environment reset
- Evidence: `test-results/scoping.../error-context.md`

### QA-2026-007

- Title: Portal footer text still appears with mojibake in browser artifacts
- Module: portal shell / encoding
- Role: all portal users
- Preconditions: signed in
- Steps:
  1. Open portal page
  2. Inspect footer text in browser artifact
- Expected: `© 2026 ...`
- Actual: artifact shows `Â© 2026 ...`
- Severity: Minor
- Priority: Medium
- Frequency: Observed in multiple Playwright artifacts
- Workaround: none
- Evidence: multiple `error-context.md` snapshots
- Note: source code currently uses `&copy;`; browser-level confirmation in a non-artifact manual session is still recommended.

## 9. Performance Test Report

### What was actually measured

- Typecheck runtime: pass
- Lint runtime: pass
- Unit runtime: about `17-20s`
- Production build runtime: about `77-83s`
- Browser E2E runtime: exceeded `600s` before full suite completion

### What was **not** fully tested

- concurrent-user load
- stress/spike/soak
- RPS
- P90/P95/P99 API latency
- CPU/memory/DB utilization under load
- large file transfers
- real PDF throughput under concurrent demand

### Performance findings

1. The browser regression suite is too slow and too stateful for stable repeated execution.
2. Browser workflow time is being consumed by repeated failures and persisted mock state, not only by application response time.
3. No production-grade load benchmark exists in the repo.

### Performance verdict

- basic local developer performance: acceptable
- production readiness for concurrency and scale: **not verified**

## 10. Security and Permission Findings

### Positive findings observed

- student admin-finance access was blocked in browser journey coverage
- dedicated mentor was redirected away from class pages
- dashboard role-specific surfaces rendered correctly for student/tutor/sub-admin cases that were reached
- code inspection shows capability-aware gating for resource downloads and report card PDF paths

### Outstanding risk

- full page/API scoping suite did not complete
- messaging access-denial scenario remains blocked by the messaging creation defect
- real RLS behavior was not validated in this local mock-only environment

### Security verdict

- some app-layer permission boundaries are working
- end-to-end security sign-off is **not complete**

## 11. Browser and Device Compatibility Report

### Executed

- Chromium headless
- viewport simulation at `320`, `375`, `430`, `768`, `1280`

### Not executed

- Firefox
- WebKit
- Safari
- iOS Safari
- Android Chrome
- real tablets
- slow network throttling matrix

### Compatibility finding

- narrow-screen responsiveness still fails on core portal pages due to horizontal overflow

## 12. Blocked-Test Report

### Blocked by environment or setup

1. Real password reset and activation emails
2. Real Supabase/RLS behavior
3. Real Google login / Drive integration paths
4. Email, SMS, push, payment, and external calendar callbacks
5. Multi-browser and real-device compatibility
6. Load, stress, spike, and endurance testing

### Blocked by application defects

1. Notification journey blocked by messaging creation defect
2. Messaging authorization journey blocked by messaging creation defect
3. Several tutor/student end-to-end journeys blocked by comment composer defect and state pollution

## 13. Regression Test Suite Recommendation

### Must-run pre-release gate

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run build`
5. Reset mock DB
6. `npx playwright test tests/e2e/journeys.pw.ts`
7. `npx playwright test tests/e2e/messaging.pw.ts`
8. `npx playwright test tests/e2e/scoping.pw.ts`
9. `npx playwright test tests/e2e/responsive.pw.ts`

### Required harness improvement

Add an explicit pre-test reset for:

- `.mock-db.json`
- `.mock-storage/`

without that, repeated E2E runs are not trustworthy.

## 14. Release-Readiness Report

### Summary counts

- Total defined browser E2E tests: `29`
- Browser tests observed before timeout: `23`
- Browser passed: `7`
- Browser failed: `16`
- Browser not reached / incomplete: `6`
- Static/unit/build checks passed: `4 of 4`

### Open defects by severity

- Critical: `2`
- Major: `4`
- Minor: `1`

### Missing configurations

- no automated mock reseed for E2E
- no real integration environment in this audit
- no multi-browser matrix
- no load/perf harness

### Known limitations

- mock mode only
- Chromium only
- partial browser-suite completion
- no real external integrations

## 15. Final QA Sign-Off Recommendation

### Recommendation

**Do not approve for release.**

### Reason

Critical end-to-end workflows remain broken or unverified:

1. direct and group in-app messaging cannot be completed in browser E2E
2. tutor submission-comment workflow cannot be completed in browser E2E
3. mobile horizontal overflow still exists on core portal routes
4. the E2E environment is not deterministic because mock state persists across runs
5. full security/scoping and performance sign-off is incomplete

### Minimum exit criteria before re-audit

1. Add deterministic E2E reset of mock data.
2. Fix messaging composer enablement.
3. Fix comment-thread send enablement on assignment detail.
4. Remove the remaining 320px portal overflow.
5. Re-run the full 29-test Playwright suite to completion with zero critical failures.
6. Execute the scoping suite and messaging suite cleanly after reset.
7. Validate at least one real Supabase environment for auth/RLS-sensitive flows.
