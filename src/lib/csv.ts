/**
 * Single source of truth for CSV escaping and formula injection protection.
 *
 * Spreadsheets (Excel, Google Sheets, LibreOffice) evaluate cells starting with =, +, -, @, or
 * control characters as formulas. Any user-generated string (such as names, notes, codes) exported
 * to CSV must be guarded with a leading single quote if it begins with those characters.
 */
export function escapeCsvField(val: string | number | boolean | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

export function toCsvRow(fields: ReadonlyArray<string | number | boolean | null | undefined>): string {
  return fields.map(escapeCsvField).join(',')
}
