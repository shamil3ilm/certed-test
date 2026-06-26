import { NextResponse } from 'next/server'
import { isMock } from '@/lib/mock/env'
import { writeMockFile } from '@/lib/mock/storage'

/**
 * Dev-only stand-in for the Google Drive resumable PUT endpoint. The browser
 * uploads the file bytes here; we persist them to local storage under the file
 * id supplied by initResumableSession() and echo `{ id }` like Drive does.
 */
export async function PUT(request: Request) {
  if (!isMock()) return new NextResponse('Not found', { status: 404 })
  const url = new URL(request.url)
  const id = url.searchParams.get('fileId') ?? crypto.randomUUID()
  const name = url.searchParams.get('name') ?? id
  const mimeType = url.searchParams.get('mime') ?? 'application/octet-stream'
  const buffer = Buffer.from(await request.arrayBuffer())
  writeMockFile(buffer, { mimeType, name, size: buffer.length }, id)
  return NextResponse.json({ id })
}
