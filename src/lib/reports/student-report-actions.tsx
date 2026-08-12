import { STUDENT_REPORTS } from './registry'

export function StudentReportActions({ studentId, className = '' }: { studentId: string; className?: string }) {
  return (
    <div className={className || 'flex flex-wrap gap-2'}>
      {STUDENT_REPORTS.map((report) => (
        <a
          key={report.type}
          href={report.pdfPath(studentId)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm btn-soft"
        >
          {report.label}
        </a>
      ))}
    </div>
  )
}
