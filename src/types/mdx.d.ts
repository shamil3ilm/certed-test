// Ambient module declaration for MDX imports. We deliberately do NOT depend on
// `@types/mdx` (whose wildcard `*.mdx` declaration would collide with this one and
// types `meta` as unknown anyway). A post's default export is its rendered component;
// its `meta` export is typed as `unknown` here on purpose - the blog registry runs
// every `meta` through `blogMetaSchema` (Zod) before use, so validation lives in one
// place rather than being asserted by an ambient type the compiler can't enforce.
declare module '*.mdx' {
  import type { ComponentType } from 'react'
  const MDXComponent: ComponentType<Record<string, unknown>>
  export default MDXComponent
  export const meta: unknown
}
