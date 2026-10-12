'use client'
import { useState } from 'react'
import { ClipboardCopy, Download } from 'lucide-react'
import { AlertBanner, cx, roleLabel } from '@/lib/ui'
import type { BatchCreated, BatchOutcome } from '@/lib/services/user-invites'

/**
 * The result of adding several people - the one and only sighting of their setup codes.
 *
 * Only a hash of each code is stored (ADR-0008), so this panel is not a convenience view of
 * data that exists elsewhere: it IS the data. Everything here exists to get the codes off the
 * screen and into the admin's hands before it goes - a table to read, text to copy, a CSV to
 * keep, and a ready-worded invite per person to send on.
 *
 * `failed` rows sit in their own block below. They created nothing, so they are the rows to add
 * again - mixing them into the table of successes is how an admin resubmits an account that
 * already exists, or worse, skips one that does not.
 */

/** The wording AddUserForm and SetupCodePanel use. It is a promise about the credential. */
const EXPIRY_NOTE = 'Valid 7 days - shown once'

const HEADERS = ['Name', 'Email', 'Role', 'Setup code']

const cellsOf = (row: BatchCreated): string[] => [row.full_name ?? '', row.email, roleLabel(row.role), row.code]

/** The invite an admin sends on, worded as SetupCodePanel words it for a single account. */
const inviteMessage = (row: BatchCreated): string =>
  `Hello${row.full_name ? ` ${row.full_name}` : ''},\n\n` +
  `Your Cert-Ed Academia account is ready. Go to /register and sign in with:\n\n` +
  `Email: ${row.email}\nSetup code: ${row.code}\n\n` +
  `The code is valid for 7 days. You can also sign in with Google using this email.`

type CopyNote = { tone: 'success' | 'warning'; message: string }

export function BatchResults({ outcome }: { outcome: BatchOutcome }) {
  const [note, setNote] = useState<CopyNote | null>(null)

  // Tab-separated so a paste lands in a spreadsheet's columns, not one cell.
  const asText = [HEADERS.join('\t'), ...outcome.created.map((row) => cellsOf(row).join('\t'))].join('\n')

  const copyAll = async () => {
    // Clipboard access can be refused outright (an insecure origin has no navigator.clipboard
    // at all, and a permission prompt can be denied). An unhandled rejection here would read
    // as a dead button, with the codes still on screen and no hint of what to do instead.
    try {
      await navigator.clipboard.writeText(asText)
      setNote({ tone: 'success', message: `Copied ${outcome.created.length} rows.` })
    } catch {
      setNote({
        tone: 'warning',
        message: 'The browser refused clipboard access. Download the CSV, or select the table and copy it by hand.',
      })
    }
  }

  const downloadCsv = () => {
    // The codes exist ONLY in this result. They are never stored - just a hash (ADR-0008) - so
    // no server route could produce this file, and round-tripping them to build one would put
    // 25 plaintext credentials through a request log for nothing.
    //
    // Every cell is quoted and inner quotes doubled: a name holding a comma would otherwise
    // shift the code into the wrong column, which is a credential silently mis-filed.
    const csv = [HEADERS, ...outcome.created.map(cellsOf)]
      .map((cells) => cells.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'setup-codes.csv'
    // In the document before the click: Firefox ignores a click on a detached anchor.
    document.body.append(link)
    link.click()
    link.remove()
    // Revoked on the next tick rather than inline. The download is handed off asynchronously,
    // and tearing the blob down in the same task can cancel it; leaving it alive would keep up
    // to 25 plaintext codes in memory for as long as the page is open.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <>
      {outcome.created.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-success-border bg-success-surface p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-success-ink">
              Added {outcome.created.length} {outcome.created.length === 1 ? 'person' : 'people'}
            </h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyAll} className="btn btn-sm btn-soft">
                <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
                Copy all
              </button>
              <button type="button" onClick={downloadCsv} className="btn btn-sm btn-soft">
                <Download className="h-4 w-4" aria-hidden="true" />
                Download CSV
              </button>
            </div>
          </div>

          <p className="mt-1 text-xs text-success-ink">
            {EXPIRY_NOTE}. Copy or download these before you close this window - a code cannot be read back, only
            replaced.
          </p>

          {note && (
            <AlertBanner tone={note.tone} className="mt-2">
              {note.message}
            </AlertBanner>
          )}

          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {HEADERS.map((header) => (
                    <th key={header} className="px-2 py-1 text-xs font-semibold text-success-ink">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outcome.created.map((row) => (
                  <tr key={row.index} className="border-t border-success-border">
                    <td className="px-2 py-1 text-slate-800">{row.full_name ?? '-'}</td>
                    <td className="break-all px-2 py-1 text-slate-800">{row.email}</td>
                    <td className="px-2 py-1 text-slate-800">{roleLabel(row.role)}</td>
                    <td className="px-2 py-1">
                      <code className="rounded bg-white px-2 py-0.5 font-bold tracking-widest text-success-ink ring-1 ring-success-border">
                        {row.code}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-1">
            {outcome.created.map((row) => (
              <li key={row.index}>
                {/* Collapsed by default: 25 open invites would bury the table above, and the
                    table is what an admin reads first. */}
                <details className="rounded-lg border border-success-border bg-white px-2 py-1">
                  <summary className="cursor-pointer text-xs font-medium text-success-ink">
                    Invite message for {row.email}
                  </summary>
                  <textarea
                    readOnly
                    rows={8}
                    value={inviteMessage(row)}
                    aria-label={`Invite message for ${row.email}`}
                    className="mt-1 w-full rounded border border-success-border bg-white p-2 font-mono text-xs text-slate-800"
                  />
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome.failed.length > 0 && (
        <div
          className={cx(
            'rounded-xl border border-danger-border bg-danger-surface p-3',
            outcome.created.length > 0 && 'mt-3',
          )}
        >
          <h3 className="text-sm font-semibold text-danger-ink">
            {outcome.failed.length} {outcome.failed.length === 1 ? 'person was' : 'people were'} not added
          </h3>
          <p className="mt-0.5 text-xs text-danger-ink">
            Nothing was created for these - usually the email was taken between the check and the write. Add them again;
            the accounts above are already done.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-danger-ink">
            {outcome.failed.map((row) => (
              <li key={row.index}>
                <span className="font-medium">Person {row.index + 1}</span> - {row.email}: {row.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
