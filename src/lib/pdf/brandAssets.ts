import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function base64(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath)).toString('base64')
}

let cached: { daggerSquare: string; louisGeorge: string; logo: string } | null = null

/** Base64-encoded brand fonts + logo, inlined into the PDF HTML (self-contained). */
export function brandAssets() {
  if (!cached) {
    cached = {
      daggerSquare: base64('public/fonts/DAGGERSQUARE.otf'),
      louisGeorge: base64('public/fonts/louis-george-cafe.regular.ttf'),
      logo: base64('public/lockups/logo_h.png'),
    }
  }
  return cached
}
