type SectionJumpItem = {
  href: string
  label: string
}

export const SECTION_JUMP_LINK =
  'inline-flex min-h-9 items-center rounded-full bg-slate-100 px-3.5 font-medium text-slate-600 transition hover:bg-primary/10 hover:text-primary'

export function SectionJumpNav({
  label,
  items,
  trailing,
}: {
  label: string
  items: readonly SectionJumpItem[]
  trailing?: React.ReactNode
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3 text-sm">
      {items.map((item) => (
        <a key={item.href} href={item.href} className={SECTION_JUMP_LINK}>
          {item.label}
        </a>
      ))}
      {trailing}
    </nav>
  )
}
