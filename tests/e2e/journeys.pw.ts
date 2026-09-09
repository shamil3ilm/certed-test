import { test, expect } from '@playwright/test'
import { SEED, attemptName, loginAs, submitAndReload } from './support'

// Full-browser end-to-end journeys per persona, exercising the 'use server'
// FORM submissions that HTTP-level tests can't reach (create class, enrol, post
// announcement, issue receipt, add user, create assignment, comment, submit).
// Runs against the production build in MOCK mode (seed reset before the run).

test('ADMIN -- create class (as a student subject) -> announce -> issue receipt -> add user', async ({
  page,
}, testInfo) => {
  // Names this attempt creates rows under, so a retry never collides with the rows the
  // previous attempt left in the (run-scoped) mock database.
  const announcement = attemptName('Welcome to Physics', testInfo)
  const newbieEmail = attemptName('e2e-newbie', testInfo).replace(' ', '-') + '@mock.test'
  await loginAs(page, 'admin@mock.test')

  // A class is created only as a student's SUBJECT: adding "Physics" to Sara creates
  // the class AND enrols her AND assigns the tutor in one step (the subject-as-class model).
  await page.goto(`/admin/users/${SEED.sara}`)
  // Scoped to the ADD form: a student who also has a subject-less class gets a second
  // subject input on this page, the one that repairs that class.
  await page.locator('form:has(button:has-text("Add subject")) input[name=subject]').fill('Physics')
  // By VALUE, not by label: the option text carries the person's role ("Tarun Tutor - Tutor")
  // so an admin can tell a tutor from a mentor in one list, and that wording is presentation
  // this test should not pin down. The id is what the form actually submits.
  await page.locator('form:has(button:has-text("Add subject")) select[name=tutor_id]').selectOption(SEED.tutor)
  await submitAndReload(page, () => page.getByRole('button', { name: 'Add subject' }).click())

  // Open the new class from the list (named "Sara Student - Physics").
  await page.goto('/classroom')
  await page
    .getByRole('link', { name: /Physics/ })
    .first()
    .click()
  await page.waitForURL(/\/classroom\/[0-9a-f-]{36}/)
  const classId = page.url().split('/classroom/')[1].split(/[/?#]/)[0]

  // Sara is already a member (the subject flow enrolled her).
  await page.goto(`/classroom/${classId}/people`)
  await expect(page.getByText('Sara Student').first()).toBeVisible()

  // Post an announcement to the class Stream
  await page.goto(`/classroom/${classId}`)
  const post = page.locator('form:has-text("Post to the class")')
  await post.getByPlaceholder('Title').fill(announcement)
  await post.getByPlaceholder(/Share something/).fill('First class Monday.')
  await submitAndReload(page, () => post.getByRole('button', { name: 'Post', exact: true }).click())
  await expect(page.getByRole('heading', { name: announcement })).toBeVisible()

  // Issue a receipt (8h x Rs 600 = Rs 4,800) for Sara
  await page.goto('/admin/finance')
  const rec = page.locator('section:has-text("Issue fee receipt")').locator('form', {
    has: page.getByRole('button', { name: 'Issue', exact: true }),
  })
  // The receipt student picker is a typeahead that searches parties by name/email.
  await rec.getByPlaceholder('Search by name or email...').fill('Sara')
  await rec
    .getByRole('option', { name: /Sara Student/ })
    .first()
    .click()
  // The line-item inputs are label-based (aria-label), not placeholder-based.
  await rec
    .getByLabel(/Subject for line/)
    .first()
    .fill('Physics tuition')
  await rec
    .getByLabel(/Hours for line/)
    .first()
    .fill('8')
  await rec
    .getByLabel(/Rate per hour for line/)
    .first()
    .fill('600')
  await rec.getByRole('button', { name: 'Issue', exact: true }).click()
  await expect(page.getByText(/4,800/).first()).toBeVisible()
  await page.waitForLoadState('networkidle').catch(() => null) // let IssueForm's location.reload() settle

  // Add a new user
  await page.goto('/admin/users')
  const add = page.locator('form', { has: page.getByRole('button', { name: 'Add user' }) })
  await add.locator('input[name=email]').fill(newbieEmail)
  await add.locator('input[name=full_name]').fill('Eve Newbie')
  await add.locator('select[name=role]').selectOption('student')
  // A student is role-aware: class/grade and country are required to add one.
  await add.locator('input[name=class_level]').fill('Grade 10')
  await add.locator('input[name=country]').fill('India')
  await submitAndReload(page, () => add.getByRole('button', { name: 'Add user' }).click())
  await expect(page.getByText(newbieEmail)).toBeVisible()

  // The activity log renders the audited actions just performed.
  await page.goto('/admin/history')
  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  await expect(page.locator('table.data-table tbody tr').first()).toBeVisible()
})

test('TUTOR -- create assignment + comment on a student submission', async ({ page }, testInfo) => {
  const assignment = attemptName('E2E Trigonometry HW', testInfo)
  await loginAs(page, 'tutor@mock.test')

  // Create an assignment in the Math classwork tab
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const af = page.locator('form:has-text("Create assignment")')
  await af.getByPlaceholder('e.g. Chapter 4 worksheet').fill(assignment)
  await af.locator('input[type=datetime-local]').fill('2026-12-01T10:00')
  await af.getByPlaceholder('e.g. 20').fill('20') // max marks is required
  await af.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByRole('heading', { name: assignment })).toBeVisible()

  // Comment on Sara's seeded submission via the review page
  await page.goto(`/assignments/${SEED.asgMath}`)
  const thread = page.locator('form', { has: page.getByRole('button', { name: 'Send' }) }).first()
  await thread.locator('textarea').fill('Great work, Sara!')
  await thread.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Great work, Sara!')).toBeVisible()
})

test('TUTOR -- create an EXAM (in-person) + record a mark from the roster', async ({ page }, testInfo) => {
  const exam = attemptName('E2E Midterm Exam', testInfo)
  await loginAs(page, 'tutor@mock.test')

  // Create an EXAM-type classwork in the Math classwork tab. Scoped by the form's own
  // "Create ..." heading rather than by "the form containing a select with an exam option":
  // the assignments list gained a TYPE FILTER whose select offers the same options, so that
  // structural locator now matches two forms. The heading text flips to "Create exam" once
  // the type changes, hence the prefix match.
  await page.goto(`/classroom/${SEED.math}/classwork`)
  const af = page.locator('form').filter({ has: page.getByRole('heading', { name: /^Create / }) })
  await af.locator('select').first().selectOption('exam')
  await af.getByPlaceholder('e.g. Chapter 4 worksheet').fill(exam)
  // Exam shows a "Starts" datetime (first) + an optional "Ends"; fill just the start.
  await af.locator('input[type=datetime-local]').first().fill('2026-12-05T10:00')
  await af.getByPlaceholder('e.g. 20').fill('50') // max marks is required
  // Exam defaults to in-person (the "submit online" box is unchecked), so no upload.
  await af.getByRole('button', { name: 'Create', exact: true }).click()

  // It appears in the list with the Exam type badge.
  await expect(page.getByRole('heading', { name: exam })).toBeVisible()
  const card = page.locator(`li:has-text("${exam}")`)
  await expect(card.getByText('Exam', { exact: true })).toBeVisible()

  // An in-person exam shows the enrolled roster to mark directly (no submissions list).
  await card.getByRole('link', { name: 'View submissions' }).click()
  await page.waitForURL(/\/assignments\/[0-9a-f-]{36}/)
  await expect(page.getByText('Not yet marked').first()).toBeVisible()

  // Record a mark for the enrolled student straight from the roster.
  await page.locator('input[type=number]').first().fill('45')
  await page.getByRole('button', { name: 'Save mark' }).first().click()
  await expect(page.getByText(/Marked - 45\/50/).first()).toBeVisible()
})

test('STUDENT -- submit an assignment (custodial file upload)', async ({ page }) => {
  await loginAs(page, 'student@mock.test')

  // Submit to the Science assignment (Sara enrolled, not yet submitted)
  await page.goto(`/classroom/${SEED.science}/classwork`)
  // Custodial upload is the primary submit path now: attach a real file, which the
  // academy keeps (no public Drive share). setInputFiles fires the upload directly.
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'e2e-sub.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
    })
  // Anchored to the submission line, not a bare status word: "Late" alone appears elsewhere
  // on this page, and the point of the assertion is that THIS submission was accepted and
  // is now reported back with its delivery status.
  await expect(page.getByText(/Your submission: (On time|Late)/).first()).toBeVisible()
})

test('MENTOR -- sees assigned mentees and can reach their classes', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')
  await page.goto('/students')
  await expect(page.getByText('Sara Student').first()).toBeVisible()
  await expect(page.getByText('Sam Student').first()).toBeVisible()
  // A mentor holds scoped access to the classes their mentees are enrolled in, so
  // /classroom loads for them rather than redirecting to the dashboard.
  await page.goto('/classroom')
  await expect(page).not.toHaveURL(/\/dashboard/)
})

test('SCOPING -- student is blocked from admin finance', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/admin/finance')
  await expect(page.getByText('Issue fee receipt')).toHaveCount(0)
})

test('SCOPING -- a mentor can reach a class their mentee is enrolled in', async ({ page }) => {
  await loginAs(page, 'mentor@mock.test')
  // Sara (a mentee) is enrolled in Math, so the mentor has scoped access to it.
  await page.goto(`/classroom/${SEED.math}`)
  await expect(page).not.toHaveURL(/\/dashboard/)
})

// The actionable dashboard lead widgets render per persona: student "Due work",
// tutor "Submissions to review".
test('DASHBOARD -- student "Due work" + tutor "Submissions to review" panels render', async ({ page }) => {
  await loginAs(page, 'student@mock.test')
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Due work' })).toBeVisible()

  await page.goto('/api/dev/logout')
  await loginAs(page, 'tutor@mock.test')
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Submissions to review' })).toBeVisible()
})

test('ADMIN -- finds a class with no subject, names it, and labels its history', async ({ page }) => {
  // A class fixes its subject at creation and sessions copy it when recorded, so a class
  // that never had one records sessions no subject filter can reach - and no screen could
  // set it afterwards. Both halves of the repair are covered here, because the flag is
  // useless without the fix and the fix is unreachable without the flag.
  await loginAs(page, 'admin@mock.test', { clearCookies: true })

  // FOUND: the class list is where you learn which classes need this. Without the flag it
  // means opening students one at a time and guessing.
  await page.goto('/classroom')
  await expect(page.getByText('No subject set').first()).toBeVisible()

  // FIXED: the repair lives with the student's subjects, because a subject IS one of their
  // classes.
  await page.goto(`/admin/users/${SEED.sara}`)
  const repair = page.locator('form:has(button:has-text("Set subject"))')
  await expect(repair).toBeVisible()
  await repair.locator('input[name=subject]').fill('Chemistry')
  await repair.getByRole('button', { name: 'Set subject' }).click()

  // The class now names a subject, so the repair form is gone and nothing on the page still
  // reports it as unset.
  await expect(page.locator('form:has(button:has-text("Set subject"))')).toHaveCount(0)
  await expect(page.getByText('No subject set')).toHaveCount(0)
})
