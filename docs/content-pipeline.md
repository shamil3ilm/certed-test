# Marketing content pipeline

**Canonical owner** of how public-site content is authored and rendered: the structured
marketing copy modules and the MDX blog.

Portal (`src/app/(prt)`) content is database-backed and is **not** covered here — see
[schema-reference.md](schema-reference.md).

## Two content systems

| System                    | Lives in                         | Use for                                                     |
| ------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Structured marketing copy | `src/lib/content/marketing-*.ts` | Page copy with a fixed shape (home, about, classes, shared) |
| MDX blog posts            | `src/content/blog/*.mdx`         | Long-form articles with prose + bespoke layout              |

Both are compiled into the bundle — there is no CMS and no runtime content fetch.

## Blog: single source of truth

A post's metadata lives **in the post file**, and one registry validates it:

```
src/content/blog/<slug>.mdx        body + `export const meta`
        |
        v
src/lib/content/blog-posts.ts      registry: validates meta (Zod), attaches slug
        |
        +--> src/lib/content/marketing-blogs.ts  -> /blogs listing cards
        +--> src/app/sitemap.ts                  -> per-post sitemap URLs
        +--> src/app/(mkt)/blogs/[slug]/page.tsx -> the rendered post
```

One dynamic route renders every post (`generateStaticParams` + `dynamicParams = false`,
so an unknown slug 404s). This replaced three hand-written per-post `page.tsx` files
where the post set was maintained in three places at once (post files, a listing array,
and a hard-coded sitemap list) and every post rendered a literal `"Current Date"`.

**The slug is the filename**, supplied by the registry rather than stored in the file, so
a post's URL can never disagree with the metadata describing it.

## Adding a blog post

1. Create `src/content/blog/<slug>.mdx`. The filename becomes the URL: `/blogs/<slug>`.
2. Export `meta` at the top (every field is required — see the contract below).
3. Register it in `src/lib/content/blog-posts.ts` by adding one row to `RAW_POSTS`:
   ```ts
   { slug: '<slug>', meta: <importedMeta> },
   ```
   plus the matching `import { meta as <name> } from '@/content/blog/<slug>.mdx'`.
4. Add the cover image to `public/blogs/`.
5. Run `npx vitest run tests/unit/content/blog-posts.test.ts`.

The listing card, the sitemap entry, and the post route all follow automatically.

### The `meta` contract

Validated by `blogMetaSchema` in `src/lib/content/blog-types.ts`; a malformed post fails
the **build**, not at render time. All fields are required, non-empty strings:

| Field            | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `title`          | Listing-card title (the short form)                    |
| `heading`        | On-page `<h1>` (usually a longer form than `title`)    |
| `excerpt`        | Listing-card summary                                   |
| `image`          | Cover image path under `public/` (e.g. `/blogs/x.svg`) |
| `date`           | Human-readable publish date, e.g. `March 15, 2026`     |
| `category`       | Eyebrow label, e.g. `Exam Prep`                        |
| `seoTitle`       | `<title>` for the post route                           |
| `seoDescription` | `<meta name="description">`                            |
| `cta`            | Trailing call-to-action: `{ heading, body, label }`    |

## Authoring in MDX

MDX is markdown **plus** JSX, so a post mixes both freely.

**Styling model:** markdown elements are styled centrally in `src/mdx-components.tsx`
(the file `@next/mdx` requires in the App Router), which maps `h2`/`h3`/`p`/`ul`/`a`/… to
the site's Tailwind classes. Do **not** wrap post bodies in `prose` classes —
`@tailwindcss/typography` is not installed, so those classes are inert.

Available without importing (provided by the component map):

- `<Lead>…</Lead>` — the oversized opening paragraph.
- `<Callout tone="primary|muted|success|danger|note" title="…">…</Callout>` — the
  recurring tinted emphasis boxes.

For one-off layout (grids, comparison tables, bespoke panels), write inline JSX with
Tailwind classes directly in the `.mdx` file — that is normal MDX, not a workaround.

**Caveat:** GitHub-Flavored Markdown is not enabled (no `remark-gfm`), so markdown pipe
tables do **not** render. Write tables as inline JSX `<table>`. Enabling `remark-gfm`
would require converting `next.config.js` to ESM, since the remark ecosystem is ESM-only.

## Wiring

| Concern           | Where                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| Compile `.mdx`    | `next.config.js` — `withMDX()` + `pageExtensions` including `md`/`mdx`       |
| Component map     | `src/mdx-components.tsx` (**required** by `@next/mdx` in the App Router)     |
| Type declarations | `src/types/mdx.d.ts` — declares the `*.mdx` module and its `meta` export     |
| Shared components | `src/app/components/blog/` — `Callout`, `Lead`, `PostCta`                    |
| Tests             | `vitest.config.ts` loads `@mdx-js/rollup` so the registry can be unit-tested |

## What the tests guard

`tests/unit/content/blog-posts.test.ts` asserts that every registered slug has a matching
`.mdx` file **and vice versa** (so a file added without registering it, or a row left
behind after deleting a post, fails), that every post's `meta` satisfies the schema, that
slugs are unique, that no post reintroduces the old `"Current Date"` placeholder, and that
the listing cards are derived from the registry rather than maintained separately.
