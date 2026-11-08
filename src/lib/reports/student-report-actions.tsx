import { ChevronDown, FileText } from 'lucide-react'
import { STUDENT_REPORTS } from './registry'

export function StudentReportActions({ studentId, className = '' }: { studentId: string; className?: string }) {
  return (
    <div className={className}>
      <details className="group relative inline-block text-xs">
        <summary className="cursor-pointer btn btn-sm btn-soft inline-flex items-center gap-1.5 list-none select-none">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reports</span>
          <ChevronDown className="h-3 w-3 text-slate-500 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="absolute right-0 z-20 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <div className="px-2 py-1 text-meta font-semibold uppercase tracking-wider text-slate-500">
            Available Reports (PDF)
          </div>
          {STUDENT_REPORTS.map((report) => (
            <a
              key={report.type}
              href={report.pdfPath(studentId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-primary"
            >
              <span>{report.label}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-meta font-medium text-slate-600">PDF</span>
            </a>
          ))}
        </div>
      </details>
    </div>
  )
}
