import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Local-filesystem file store for MOCK MODE — the Drive stand-in. Uploaded bytes
 * are written to `.mock-storage/<id>` with a `<id>.json` metadata sidecar, so an
 * upload can be streamed back on download. Server-side only (dev server has fs).
 */
const DIR = join(process.cwd(), '.mock-storage')

export type MockFileMeta = { mimeType: string; name: string; size: number }

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}

export function writeMockFile(buffer: Buffer, meta: MockFileMeta, id: string = randomUUID()): string {
  ensureDir()
  writeFileSync(join(DIR, id), buffer)
  writeFileSync(join(DIR, `${id}.json`), JSON.stringify(meta))
  return id
}

export function readMockFile(id: string): { buffer: Buffer; meta: MockFileMeta } | null {
  const path = join(DIR, id)
  if (!existsSync(path)) return null
  const buffer = readFileSync(path)
  let meta: MockFileMeta = { mimeType: 'application/octet-stream', name: id, size: buffer.length }
  const metaPath = join(DIR, `${id}.json`)
  if (existsSync(metaPath)) {
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')) as MockFileMeta } catch { /* keep default */ }
  }
  return { buffer, meta }
}

export function deleteMockFile(id: string): void {
  try { rmSync(join(DIR, id)) } catch { /* ignore */ }
  try { rmSync(join(DIR, `${id}.json`)) } catch { /* ignore */ }
}

/** Builds a minimal but valid one-page PDF with a line of text (correct xref offsets). */
export function placeholderPdf(text: string): Buffer {
  const esc = text.replace(/([()\\])/g, '\\$1')
  const stream = `BT /F1 18 Tf 72 760 Td (${esc}) Tj ET`
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, '0')} 00000 n \n` })
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}
