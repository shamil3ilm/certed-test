/**
 * The canonical key identifying a 1:1 conversation between two people.
 *
 * Shared deliberately. It is WRITTEN when a direct conversation is created and READ to find
 * an existing one, and `conversations_direct_key_uniq` (0023) enforces that those two agree
 * - so if the two sides ever computed it differently, dedupe would stop finding the existing
 * thread and the unique index would start rejecting the insert instead. Sorting is what
 * makes the pair order-independent.
 *
 * Lives outside services/ so the data layer can use it without importing upwards
 * (docs/architecture-rules.md: app -> services -> data).
 */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':')
}
