# Design system

The visual design system — tokens, typography, and shared UI primitives — and how to build UI consistently with them. Code style and naming live in [application-standards.md](application-standards.md); layering and imports in [architecture-rules.md](architecture-rules.md).

The system has three layers: **tokens** (CSS custom properties surfaced as Tailwind utilities), **primitives** (`@/lib/ui` components + `(prt)/form` inputs), and **conventions** (rules a linter or reviewer enforces). Prefer a token over a literal, and a primitive over a hand-rolled element.

The app is **light-theme only** — there is no `dark:` variant in use. Do not add `dark:` classes ad hoc; if dark mode is wanted, it is a deliberate, system-wide project.

---

## 1. Tokens — `@theme` in `src/app/globals.css`

Tailwind v4 turns each `--*` in the `@theme` block into a utility. Change a value in one place; every utility follows.

| Token(s)                                                         | Utilities                                | Notes                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--color-primary`, `--color-primary-strong`, `--color-secondary` | `text-primary`, `bg-primary`, …          | Brand blues. Also `--color-background`/`foreground`.                                                                                                                                                                                                                                                                     |
| `--color-secondary-ink`                                          | `text-secondary-ink`, `bg-secondary-ink` | The brand sky blue darkened to pass WCAG AA. `--color-secondary` (#50b5e1) is 2.32:1 on white, so it fails as TEXT and as a solid button behind white text; `secondary-ink` (#15719b) is the same 199° hue at 5.43:1. Use `secondary` for decorative fills, tints and icons; `secondary-ink` for text and solid buttons. |
| `--font-sans`, `--font-display`, `--font-mono`                   | `font-sans`, `font-display`, …           | Brand sans everywhere today (display == sans).                                                                                                                                                                                                                                                                           |
| `--text-micro` (10px), `--text-meta` (11px)                      | `text-micro`, `text-meta`                | The two steps **below** Tailwind's `text-xs`.                                                                                                                                                                                                                                                                            |

Raw brand hexes live on `:root` and are aliased into `@theme` — edit `:root` to re-brand.

## 2. Typography scale

Never write an arbitrary font size (`text-[13px]`). It is **eslint-blocked** (see §4). Pick a step; if none fits, add one to `@theme`.

| Utility                | Size  | Use for                                                                            |
| ---------------------- | ----- | ---------------------------------------------------------------------------------- |
| `text-micro`           | 10px  | Decorative labels in **fixed circles** — avatar initials, count badges.            |
| `text-meta`            | 11px  | The smallest **readable** text — timestamps, status pills, captions, chart labels. |
| `text-xs`              | 12px  | Secondary meta, dense table cells, hints.                                          |
| `text-sm`              | 14px  | Default body / descriptions / form text.                                           |
| `text-base`            | 16px  | Emphasised body.                                                                   |
| `text-lg` … `text-3xl` | 18px+ | Headings (`PageHeader` handles the responsive `h1`).                               |

Rule of thumb: **anything a user reads is ≥ `text-meta` (11px)**; only `text-micro` is allowed, and only inside a fixed-size chip/avatar where 11px would overflow.

## 3. Components — import from `@/lib/ui` (never a route folder)

`src/lib/ui` is the portal design system: presentation only, no domain/data imports.

- **Layout & surfaces:** `Card`, `Panel`, `PageHeader`, `EmptyState`, `AlertBanner`, `BackLink`, `StatGrid`, `StatCard`, `PaginationBar`; the `CARD` surface class + `cx()` class-merge helper.
- **Lists:** `ListRow`, `RowChevron`, `ArchivedList`. On the dashboard, `widget-shared` adds `WIDGET_ROW_LINK` (label ↔ meta side-by-side) and `WIDGET_ROW_STACK` (label on top, full width, meta beneath) — **use `_STACK` when the meta is long** (a full date/time) so the label isn't squeezed to a few characters in a narrow column.
- **Labels & badges:** `Badge`, `SectionLabel`, `roleLabel`, `statusLabel`, `staffRoleLabel`, `personaLabel`.
- **Identity:** `Avatar`, `initials`, `roleTone`, `classBanner`.
- **Filters:** `FilterBar`, `SearchFilterField`, `SelectFilterField`, `DateFilterField`, `FilterField`.
- **Toggles:** `SEGMENTED_GROUP` + `segmentedButtonClass`, `pillButtonClass`.
- **Charts:** `ColumnChart`, `LineChart`, `MiniBars`, `LegendDot` (dependency-free SVG/CSS).
- **Nav:** `SectionJumpNav`, `ExternalActionLink`.

### Forms — `src/app/(prt)/form.tsx`

`Field` (labelled wrapper), `Input`, `PasswordInput`, `Select`, `Textarea`, `SubmitButton` (pending-aware). Use these instead of bare `<input>`/`<button>` so styling + disabled/pending states stay uniform.

> These form primitives still live under `(prt)/` rather than `src/lib/ui` — a known pending migration (see [architecture-rules.md](architecture-rules.md) §7).

### Buttons — the `.btn` system (`globals.css`, `.prt-scope`)

`btn` + a variant: `btn-primary`, `btn-ghost`, `btn-soft`, `btn-danger`, `btn-success`, `btn-warning`, plus the `btn-sm` size. Focus ring, hover, and disabled states come for free — don't restyle a button by hand.

## 4. Conventions (what a reviewer / the linter checks)

1. **No arbitrary font sizes.** `text-[Npx|rem|em]` is an eslint error (`no-restricted-syntax` in `eslint.config.mjs`). Use a scale step or add one to `@theme`.
2. **Import UI primitives from `@/lib/ui`**, never from a route folder. _Exception:_ a page may deep-import a specific sub-module (e.g. `@/lib/ui/layout`) when importing through the barrel triggers the webpack client-reference-manifest omission — a commented, guarded workaround enforced by `scripts/check-client-manifest.mjs` (see `src/app/(prt)/messages/[id]/page.tsx`).
3. **Reach for a primitive before a `<div>`.** New surface → `Card`/`Panel`; new list → `ListRow`; new page → `PageHeader`.
4. **Merge classes with `cx()`**, not string concatenation.
5. **Responsive:** every page must survive 320px with no horizontal overflow (`html` clips stray overflow; verify at mobile width — see application-standards §12).
6. **Colours** come from the brand tokens; avoid one-off hexes in `className`. Muted text
   is `text-slate-600`: `slate-400` is 2.56:1 on white and `slate-500` drops to 4.34:1 on
   `bg-slate-100`, so both fail AA where they carry real text. `tests/e2e/a11y.pw.ts`
   enforces contrast with an empty baseline — a regression fails CI rather than accruing.

## 5. Extending the system

- **A new size/colour/spacing value used more than once** → add a token to `@theme` (a `--text-*` step, a `--color-*`) and use the generated utility.
- **A repeated markup pattern** → add a component to `src/lib/ui` and export it from the barrel; delete the duplicates.
- Keep `@/lib/ui` presentation-only (no domain, data, or Supabase imports).
