import type { Profile } from '@/lib/auth/profile'
import {
  ASSIGNMENT_PARAM_KEYS,
  classworkParams,
  classworkUrl,
  DOCUMENT_PARAM_KEYS,
  loadClassworkPageData,
  type ClassworkUrlState,
} from '@/lib/services/page-data/classwork'
import { AlertBanner, EmptyState, FilterBar, PaginationBar, SectionLabel, SelectFilterField } from '@/lib/ui'
import { AssignmentForm } from '../../../assignments/AssignmentForm'
import { CLASSWORK_TYPES } from '../../../assignments/classwork-types'
import { AssignmentCard } from './assignment-card'
import { MaterialsSection as MaterialsSectionContent } from './materials-section'

type ClassworkPageData = Awaited<ReturnType<typeof loadClassworkPageData>>

export function AssignmentsSection({ data, me, courseId }: { data: ClassworkPageData; me: Profile; courseId: string }) {
  return (
    <section id="assignments" className="scroll-mt-20 space-y-4">
      <SectionLabel>Assignments</SectionLabel>
      {data.isArchived && data.canManage && (
        <AlertBanner>
          This class is archived. Existing assignments and materials remain visible, but classwork changes are disabled
          until the class is restored.
        </AlertBanner>
      )}
      {data.canManageContent && <AssignmentForm classes={data.classList} />}

      {/* A class accumulates every kind of work over years, so "show me the exams" is the
          question a reader arrives with. Same FilterBar the materials below it use. */}
      <FilterBar
        clearHref={classworkUrl(data, { assignmentType: '', assignmentPage: 1 }, 'assignments')}
        showClear={Boolean(data.assignmentType)}
      >
        <SelectFilterField label="Type" name="aType" defaultValue={data.assignmentType}>
          <option value="">All types</option>
          {CLASSWORK_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectFilterField>
        {/* A GET form submits only its OWN fields, so without these the document filters
            below would be wiped by changing the assignment type. Choosing a type also
            returns to page 1, which is why aPage is deliberately absent. */}
        <DocumentFilterFields state={data} />
      </FilterBar>

      <ul className="space-y-3">
        {data.assignmentViews.map((view) => (
          <AssignmentCard key={view.assignment.id} view={view} data={data} me={me} courseId={courseId} />
        ))}
        {data.assignmentTotal === 0 && (
          <EmptyState as="li">
            {data.assignmentType ? 'No assignments of this type.' : 'No assignments yet.'}
          </EmptyState>
        )}
      </ul>

      {/* A class accumulates assignments for as long as it runs, so the list is paged
          rather than rendered whole. The pager keeps the document filters above it. */}
      <PaginationBar
        page={data.assignmentPage}
        totalPages={data.assignmentTotalPages}
        total={data.assignmentTotal}
        label="assignments"
        previousHref={
          data.assignmentPage > 1
            ? classworkUrl(data, { assignmentPage: data.assignmentPage - 1 }, 'assignments')
            : undefined
        }
        nextHref={
          data.assignmentPage < data.assignmentTotalPages
            ? classworkUrl(data, { assignmentPage: data.assignmentPage + 1 }, 'assignments')
            : undefined
        }
      />
    </section>
  )
}

/**
 * State this form does NOT own, carried as hidden fields.
 *
 * The two sections share one URL but sit in separate GET forms, and a GET form submits only
 * the fields it contains - so each has to carry the other's or silently discard it. The
 * pairs come from `classworkParams`, the same enumeration the links are built from, so a
 * key can never be serialized in one and forgotten in the other.
 */
function CarriedState({ state, keys }: { state: ClassworkUrlState; keys: readonly string[] }) {
  const carried = classworkParams(state).filter(([key]) => keys.includes(key))
  return (
    <>
      {carried.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
    </>
  )
}

/** The document filters, for the ASSIGNMENTS form. */
export function DocumentFilterFields({ state }: { state: ClassworkUrlState }) {
  return <CarriedState state={state} keys={DOCUMENT_PARAM_KEYS} />
}

/** The assignment list's page and type, for the MATERIALS form - the mirror. */
export function AssignmentStateFields({ state }: { state: ClassworkUrlState }) {
  return <CarriedState state={state} keys={ASSIGNMENT_PARAM_KEYS} />
}

export function MaterialsSection({ data, me, courseId }: { data: ClassworkPageData; me: Profile; courseId: string }) {
  return <MaterialsSectionContent data={data} me={me} courseId={courseId} />
}
