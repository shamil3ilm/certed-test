/** Maps a tag's colour keyword to chip classes. Plain module (no client/server
 *  boundary) so both the display chips and the editor share one palette. */
const TONE: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-600',
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  sky: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
}

export function tagToneClass(color: string | null | undefined): string {
  return TONE[color ?? 'slate'] ?? TONE.slate
}
