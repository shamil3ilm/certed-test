export type PickedFile = {
  id: string
  url: string
  name: string
  mimeType: string
  sizeBytes: number | null
}

type RawPickerDoc = {
  id?: unknown
  url?: unknown
  name?: unknown
  mimeType?: unknown
  sizeBytes?: unknown
}

function toSize(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

/** Normalize a Google Picker document into our own shape, or null if unusable. */
export function parsePickerDoc(raw: RawPickerDoc | null | undefined): PickedFile | null {
  if (!raw) return null
  const id = typeof raw.id === 'string' ? raw.id : ''
  const url = typeof raw.url === 'string' ? raw.url : ''
  if (!id || !url) return null
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name : 'Untitled'
  return {
    id,
    url,
    name,
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : '',
    sizeBytes: toSize(raw.sizeBytes),
  }
}
