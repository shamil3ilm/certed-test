/**
 * Canonical Operational Limits and UI Ceilings
 *
 * Centralized configuration module for all capacity limits, anti-abuse ceilings,
 * file upload bounds, and UI disclosure thresholds across the application.
 *
 * Edits made here propagate universally across services, data-layer query
 * guards, UI forms, and unit test suites.
 */

// ---------------------------------------------------------------------------
// 1. Dashboard & UI Disclosure Limits
// ---------------------------------------------------------------------------

/** Maximum number of rows initially displayed in dashboard widgets before truncation
 *  or progressive disclosure ("Show {N} more" / "View all ({count})"). */
export const DASHBOARD_ENTITY_PREVIEW_LIMIT = 5

// ---------------------------------------------------------------------------
// 2. Reminders Capacity Ceilings
// ---------------------------------------------------------------------------

/** Maximum active upcoming (remind_at >= now and is_sent = false) reminders per user.
 *  Historical/expired reminders are excluded from this count. */
export const MAX_ACTIVE_REMINDERS_PER_USER = 10

// ---------------------------------------------------------------------------
// 3. Timetable & Calendar Capacity Ceilings
// ---------------------------------------------------------------------------

/** Maximum active recurring timetable slots per class. Inactive/paused slots are excluded. */
export const MAX_SLOTS_PER_CLASS = 15

/** Maximum calendar events allowed on a single calendar day within the same scope. */
export const MAX_EVENTS_PER_SCOPE_DAY = 10

// ---------------------------------------------------------------------------
// 4. Video Meeting Links (Meet) Capacity Ceilings
// ---------------------------------------------------------------------------

/** Maximum active video meeting links per individual class. */
export const MAX_ACTIVE_MEETS_PER_CLASS = 15

/** Maximum active academy-wide (global) meeting links. */
export const MAX_ACTIVE_GLOBAL_MEETS = 50

// ---------------------------------------------------------------------------
// 5. Staffing & Class Membership
// ---------------------------------------------------------------------------

/** Maximum active teaching staff (lead, co-tutor, substitutes) assigned to a single class. */
export const MAX_ACTIVE_TUTORS_PER_CLASS = 5

/** Each class adheres to the strict 1-to-1 learner enrollment model (at most 1 active student). */
export const MAX_ACTIVE_STUDENTS_PER_CLASS = 1

// ---------------------------------------------------------------------------
// 6. Attachments & Custodial Storage
// ---------------------------------------------------------------------------

/** Maximum file size in bytes for a single attachment (25 MB). */
export const MAX_ATTACHMENT_BYTES = 26_214_400

/** Maximum number of file attachments per owner/entity. */
export const MAX_ATTACHMENTS_PER_OWNER = 5

/** Maximum filename character length. */
export const MAX_FILENAME_LENGTH = 200

// ---------------------------------------------------------------------------
// 7. Onboarding & Batch Operations
// ---------------------------------------------------------------------------

/** Maximum number of users that can be invited or added in a single batch. */
export const MAX_BATCH_INVITE_ROWS = 25

// ---------------------------------------------------------------------------
// 8. Communications & Messaging
// ---------------------------------------------------------------------------

/** Maximum number of recipient profiles in a single group conversation. */
export const MAX_CONVERSATION_RECIPIENTS = 25

/** Maximum length in minutes for a recorded session window (24 hours). */
export const MAX_SESSION_MINUTES = 24 * 60

// ---------------------------------------------------------------------------
// 9. Pagination & Table Page Sizes
// ---------------------------------------------------------------------------

/** Standard pagination size for tabular data (finance, users, inbox, notes, attendance history, assignments). */
export const DEFAULT_PAGE_SIZE = 20

/** Standard pagination size for card grid views (classrooms, staff roster cards). */
export const CARD_GRID_PAGE_SIZE = 12

/** Standard pagination size for class announcement activity streams. */
export const ACTIVITY_STREAM_PAGE_SIZE = 10

/** Standard pagination size for notifications history list. */
export const NOTIFICATIONS_PAGE_SIZE = 30

/** Standard pagination size for administrative system audit history. */
export const AUDIT_PAGE_SIZE = 25

/** Standard pagination size for bulk archived documents and resources. */
export const ARCHIVED_RESOURCES_PAGE_SIZE = 50

// ---------------------------------------------------------------------------
// 10. Rate Limiting & Abuse Throttle Budgets
// ---------------------------------------------------------------------------

/** Standard write mutation throttle: maximum write operations per minute per actor. */
export const THROTTLE_WRITE_LIMIT_PER_MINUTE = 60

/** Standard write mutation window duration in milliseconds (1 minute). */
export const THROTTLE_WRITE_WINDOW_MS = 60_000

/** Rate limit for new message conversation creation per actor per minute. */
export const RATE_LIMIT_MESSAGE_CONVERSATION_PER_MINUTE = 15

/** Rate limit for sending messages within conversations per actor per minute. */
export const RATE_LIMIT_MESSAGE_SEND_PER_MINUTE = 30

/** Rate limit for posting contextual comments per actor per minute. */
export const RATE_LIMIT_COMMENT_CREATE_PER_MINUTE = 20

/** Rate limit for heavy report and PDF generation per actor per minute. */
export const RATE_LIMIT_REPORT_PDF_PER_MINUTE = 20

/** Rate limit for bulk data exports (financial, teaching hours) per actor per minute. */
export const RATE_LIMIT_EXPORT_PER_MINUTE = 10

/** Rate limit for contact form submissions per IP per 10-minute window. */
export const RATE_LIMIT_CONTACT_FORM = 5
export const RATE_LIMIT_CONTACT_FORM_WINDOW_SECONDS = 10 * 60
