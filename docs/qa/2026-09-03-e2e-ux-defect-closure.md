# Cert-Ed Academia — E2E UX Defect Closure

- **Date:** 2026-09-03 · **Branch:** `feature/cert-ed-academia-app`
- **Source:** the live per-persona E2E UI/UX pass against `staging.certedacademia.com` (marketing) and
  `app.staging.certedacademia.com` (portal), driven as each of the five personas
  (superadmin · subadmin · tutor · mentor · student) through read AND write journeys.
- **Scope of this document:** the defects that pass surfaced, and what was done about each.

---

## 0. Summary

Seven defects were found and fixed. Two items are **not** code and are recorded as open at the bottom.

| #   | Defect                                                        | Impact                                      | Status        |
| --- | ------------------------------------------------------------- | ------------------------------------------- | ------------- |
| 1   | Calendar always opened in the desktop month grid on a phone   | HIGH — calendar unreadable on mobile        | Fixed         |
| 2   | Denied capability bounced to `/dashboard` with no explanation | MEDIUM — looked like a broken link          | Fixed         |
| 3   | Graded submission still badged only "Submitted"               | MEDIUM — tutors could not see what was done | Fixed         |
| 4   | `color-contrast` — muted text below AA on every route         | SERIOUS (a11y)                              | Fixed + gated |
| 5   | `aria-prohibited-attr` on the loading skeleton                | SERIOUS (a11y)                              | Fixed         |
| 6   | `aria-allowed-attr` / `role-img-alt` inside FullCalendar      | SERIOUS (a11y)                              | Fixed         |
| 7   | `link-in-text-block` on Terms/Privacy prose links             | SERIOUS (a11y)                              | Fixed         |

---

## 1. Calendar opened in the desktop month grid on mobile

`CalendarView` seeded its layout with `useState(isMobile ? 'agenda' : 'normal')`. `useMediaQuery`
reports `false` during SSR and on the first client render, so the initializer — which runs exactly
once, before the query resolves — **never took the mobile branch**. A phone got the 7-column month
grid: seven columns inside ~390px wraps event titles to roughly one character per line.

The fix does not add an effect (an effect that calls `setState` synchronously is banned by lint, and
would still flash the wrong layout first). It stores only the user's _explicit_ choice and derives
the rest, so the responsive default is re-evaluated on every render:

```tsx
const [modeChoice, setModeChoice] = useState<CalendarMode | null>(null)
const mode: CalendarMode = modeChoice ?? (isMobile ? 'agenda' : 'normal')
```

## 2. Denied capability gave no reason

`requireCapability` already redirected to `/dashboard?denied=1`, and the dashboard renders an
explanatory banner for that flag. `requireRole` redirected to a bare `/dashboard` — so a persona
hitting a route it lacks was silently teleported home with nothing to read. Both guards now use the
same `?denied=1`.

## 3. Graded submissions still read "Submitted"

The submission badge rendered delivery status (on time / late) only, which does not change when a
mark is recorded. Grading worked correctly — the mark saved, and the student's My Grades showed
17/20 (85%) — but the tutor's own view gave no sign of it. A `Graded` badge now renders alongside
the delivery badge when `score` and `graded_at` are both set, keeping the late signal, which stays
relevant after grading.

## 4. Colour contrast — the whole muted-text palette

This was the largest finding: `color-contrast` failed on 100 of 100 routes scanned. Three separate
causes, all now fixed, with measured ratios:

**(a) Muted text tokens.** `text-slate-400` is 2.56:1 on white — it fails everywhere it carries real
text (169 usages / 79 files). `text-slate-500` passes on white (4.76:1) but **fails on the app's own
tinted surfaces** — 4.34:1 on `bg-slate-100`, which is exactly how the dashboard chart toggle failed.
Both collapsed into `text-slate-600` (7.58:1 on white, 6.92:1 on `bg-slate-100`), the only muted
value that is safe on every surface the app paints. `text-gray-500` in the marketing pages went to
`text-gray-600` to stay in that file's own colour family.

`placeholder:text-slate-400` was deliberately left alone: a placeholder rendered as dark as a real
value is its own usability problem, and axe does not treat it as body text.

Before swapping, every file carrying a dark surface was checked — `text-slate-400` on a dark ground
is _good_ contrast and darkening it would have broken it. The app turned out to have no dark text
surfaces at all: all three `bg-slate-900`/`bg-black` hits are scrims and hover tints.

**(b) The brand secondary.** `--secondary: #50b5e1` is 2.32:1 against white, so it failed both as
small text (`text-secondary`) and as a solid button carrying white text (`bg-secondary text-white`).
Rather than restyle the brand, a second token was added — `--secondary-ink: #15719b`, the same hue
(199°) darkened to 5.43:1. One token covers both uses because both need the same thing: enough
contrast against white. `secondary` stays the decorative fill/tint/icon colour.

**(c) The footer.** `text-slate-300/75` and `/70` on the dark `bg-primary` blended toward the ground
and measured 4.06:1 and 3.74:1. Dropping the opacity modifiers gives 5.92:1. The footer link hover
also moved from `hover:text-secondary` (3.78:1 on that ground) to `hover:text-white`, matching the
hover the email link in the same component already used.

**The gate is now on.** `BASELINED_RULES` in `tests/e2e/a11y.pw.ts` is empty — `color-contrast` was
the last entry — so contrast regressions now fail CI rather than being tracked as debt.

## 5. `aria-prohibited-attr` on the loading skeleton

`PageSkeleton` was a bare `<div>` with `aria-busy` and `aria-label`. A bare `div` is `role=generic`,
and `aria-label` is _prohibited_ on generic — the name was discarded, so the skeleton announced as
nothing. It is now `role="status"`, which both permits the name and makes it a polite live region.

This is why the finding looked irreproducible on a re-scan: the skeleton only exists while a route
is still streaming, so it is present in one scan and gone from the next.

## 6 & 7. FullCalendar ARIA, and prose links

FullCalendar emits `aria-controls=""` on its "+N more" link and `role="img"` on decorative icons
with no accessible name. Two mount hooks (`moreLinkDidMount`, `viewDidMount`) strip the empty
attribute and mark the icons `aria-hidden`. Separately, the Terms/Privacy links inside the register
and settings prose were distinguished by colour alone; they now carry a persistent underline
(`underline hover:no-underline`), matching the marketing site's convention.

---

## 8. Not code — open

- **Test data in user-facing lists.** Staging carries records like "E2E Slot" and "Diag" users that
  appear in ordinary staff-facing lists. This is data hygiene on the staging database, not an
  application defect.
- **Artefacts left by this pass.** The write journeys created `UXTEST-948958` (assignment +
  submission + grade), `UXTEST-ann-09215`, `UXTEST-rem-88847`, a `UXTEST message 07171`, and an
  attendance session dated 2026-09-03. These are additions and are left in place pending a decision
  to remove them. The one change this pass made to _pre-existing_ data — a mentor session start time
  moved 10:00 → 09:15 — **has been reverted**; the row reads 10:00 again and the teaching-hours total
  is back to 1h from the inflated 1h 45m.

## 9. Product decisions confirmed, no action

Students are denied `/receipts` and tutors are denied `/payslips`. Confirmed intentional for now.

---

## 10. Verification

| Gate                                                                    | Result                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| `tsc --noEmit`                                                          | 0 errors                                                      |
| `eslint src tests`                                                      | 0 problems                                                    |
| `vitest run`                                                            | **1302 / 1302** across 169 files                              |
| `playwright test a11y` (contrast **enforced**, `BASELINED_RULES` empty) | **7 / 7**                                                     |
| `playwright test` (full suite, chromium)                                | **76 / 76**                                                   |
| `--secondary-ink` present in the built CSS                              | `.text-secondary-ink{color:var(--secondary-ink)}` → `#15719b` |

The last row is not ceremony. A colour utility that fails to generate produces no rule at all, the
element quietly inherits its parent's colour, and the contrast gate can pass _because the class did
nothing_. The token was therefore confirmed in `.next/static/css` rather than inferred from a green
test.

The contrast fix is verified against a **local production build**, not staging — staging serves the
previously deployed bundle, so it cannot confirm a change that has not shipped.

One build failure was seen mid-pass (`ENOENT … proxy.js.nft.json`) and did **not** reproduce: two
consecutive clean builds and the gate run all succeeded afterwards. It was a collision with a
concurrent process on this shared working tree, not a regression.
