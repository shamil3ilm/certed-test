# Foreign-key and cascade inventory

The complete inventory of foreign keys and their `ON DELETE` behaviour, generated from a database built by applying the migration chain to its head — NOT from `supabase/rebuild/0000_full_rebuild.sql`, which is a schema-only dump and can lag the chain. It exists so that the delete-time blast radius of any row is reviewable without reading every migration — see [schema-reference.md](./schema-reference.md#foreign-keys-and-cascade-behaviour) for the summary. Regenerate this table whenever a migration adds or changes a foreign key.

At the current chain head (0105) there are **73 foreign keys** across the public schema — 39 CASCADE, 31 SET NULL, 1 RESTRICT, 2 NO ACTION. One of them, `profiles.id`, points out of the schema at `auth.users`.

This table is generated, not hand-maintained: it drifted ~30 migrations behind once (missing `subjects`, `consents`, `guardians`, `mentee_notes` and `billing_rates` entirely), which is the failure mode this file exists to prevent — a delete blast-radius review that silently omits four PII tables is worse than no review.

## The four behaviours and when each is used

| `ON DELETE`                        | Meaning                            | Used for                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CASCADE**                        | Delete the child with the parent   | Rows that are meaningless without their parent — a class's enrollments/assignments/attendance/resources/timetable, an assignment's submissions, a submission's comments and attachments, a conversation's participants and messages, and everything owned by a person that is purely _their_ participation (their enrollments, personas, overrides, mentorships, notifications, reminders).   |
| **SET NULL**                       | Keep the child, null the reference | Authorship / actor references where the record must outlive the person — `created_by`, `author_id`, `marked_by`, `graded_by`, `actor_id`, `sender_id`, and the **financial** party links (`receipts`/`payslips` → student/tutor, `fx_rate_id`). A deleted staff member must never erase the receipts, payslips or audit trail they touched. The FK column is nullable in every SET-NULL case. |
| **RESTRICT**                       | Block the parent delete            | `attachments.uploaded_by` → `profiles`. A profile that still owns custodial file records cannot be deleted out from under them — the [§7 custodial-storage](./adr/0006-custodial-attachment-storage.md) integrity guarantee.                                                                                                                                                                  |
| **NO ACTION** (default, no clause) | Block at commit                    | Two columns carry no explicit rule and therefore fall back to NO ACTION — see the note below.                                                                                                                                                                                                                                                                                                 |

## Full inventory

Grouped by parent table. `→` reads "references". Regenerated from the fully-migrated schema at chain head 0105.

### → `profiles` (the actor/owner hub)

| Child table.column                     | On delete     |
| -------------------------------------- | ------------- |
| `announcements.author_id`              | SET NULL      |
| `assignments.created_by`               | SET NULL      |
| `attachments.uploaded_by`              | **RESTRICT**  |
| `attendance.marked_by`                 | SET NULL      |
| `attendance.student_id`                | CASCADE       |
| `audit_log.actor_id`                   | SET NULL      |
| `billing_rates.profile_id`             | CASCADE       |
| `billing_rates.updated_by`             | SET NULL      |
| `calendar_events.created_by`           | **NO ACTION** |
| `capability_overrides.created_by`      | SET NULL      |
| `capability_overrides.profile_id`      | CASCADE       |
| `class_sessions.hours_recorded_by`     | SET NULL      |
| `class_sessions.tutor_id`              | SET NULL      |
| `class_tutors.tutor_id`                | CASCADE       |
| `comments.author_id`                   | CASCADE       |
| `consents.profile_id`                  | CASCADE       |
| `conversation_participants.profile_id` | CASCADE       |
| `conversations.created_by`             | SET NULL      |
| `conversations.last_message_sender_id` | SET NULL      |
| `enrollments.student_id`               | CASCADE       |
| `entity_tags.created_by`               | SET NULL      |
| `exchange_rates.created_by`            | SET NULL      |
| `guardians.student_id`                 | CASCADE       |
| `meet_links.created_by`                | SET NULL      |
| `mentee_notes.author_id`               | SET NULL      |
| `mentee_notes.student_id`              | CASCADE       |
| `mentorships.mentor_id`                | CASCADE       |
| `mentorships.student_id`               | CASCADE       |
| `messages.sender_id`                   | SET NULL      |
| `notifications.profile_id`             | CASCADE       |
| `payslips.created_by`                  | SET NULL      |
| `payslips.tutor_id`                    | SET NULL      |
| `persona_assignments.profile_id`       | CASCADE       |
| `receipts.created_by`                  | SET NULL      |
| `receipts.student_id`                  | SET NULL      |
| `reminders.created_by`                 | CASCADE       |
| `reminders.user_id`                    | CASCADE       |
| `resource_versions.created_by`         | SET NULL      |
| `resources.uploaded_by`                | SET NULL      |
| `subjects.created_by`                  | SET NULL      |
| `submissions.graded_by`                | SET NULL      |
| `submissions.student_id`               | CASCADE       |
| `tags.created_by`                      | SET NULL      |
| `timetable_slots.tutor_id`             | **NO ACTION** |

### → `classes`

| Child table.column         | On delete |
| -------------------------- | --------- |
| `announcements.class_id`   | CASCADE   |
| `assignments.class_id`     | CASCADE   |
| `attendance.class_id`      | CASCADE   |
| `calendar_events.class_id` | CASCADE   |
| `class_sessions.class_id`  | CASCADE   |
| `class_tutors.class_id`    | CASCADE   |
| `enrollments.class_id`     | CASCADE   |
| `meet_links.class_id`      | CASCADE   |
| `reminders.class_id`       | SET NULL  |
| `resources.class_id`       | CASCADE   |
| `timetable_slots.class_id` | CASCADE   |

### → other parents

| Child table.column                            | Parent            | On delete |
| --------------------------------------------- | ----------------- | --------- |
| `attachments.announcement_id`                 | `announcements`   | CASCADE   |
| `attachments.assignment_id`                   | `assignments`     | CASCADE   |
| `attachments.resource_id`                     | `resources`       | CASCADE   |
| `attachments.submission_id`                   | `submissions`     | CASCADE   |
| `attendance.session_id+class_id+session_date` | `class_sessions`  | CASCADE   |
| `calendar_events.slot_id`                     | `timetable_slots` | SET NULL  |
| `class_sessions.subject_id`                   | `subjects`        | SET NULL  |
| `classes.subject_id`                          | `subjects`        | SET NULL  |
| `conversation_participants.conversation_id`   | `conversations`   | CASCADE   |
| `entity_tags.tag_id`                          | `tags`            | CASCADE   |
| `messages.conversation_id`                    | `conversations`   | CASCADE   |
| `payslip_lines.payslip_id`                    | `payslips`        | CASCADE   |
| `payslips.fx_rate_id`                         | `exchange_rates`  | SET NULL  |
| `profiles.auth_user_id`                       | `auth.users`      | SET NULL  |
| `receipt_lines.receipt_id`                    | `receipts`        | CASCADE   |
| `receipts.fx_rate_id`                         | `exchange_rates`  | SET NULL  |
| `resource_versions.resource_id`               | `resources`       | CASCADE   |
| `submissions.assignment_id`                   | `assignments`     | CASCADE   |

## Notes and review items

- **The `student_id` split is deliberate.** Enrollment, attendance and submission rows CASCADE with the student (they _are_ the student's participation), but `receipts.student_id` is SET NULL — a financial document must survive the party it names. The same split applies to tutors: `class_tutors.tutor_id` CASCADEs, while `payslips.tutor_id` and `class_sessions.tutor_id` SET NULL.
- **`profiles.auth_user_id` is SET NULL, not CASCADE.** Deleting the Supabase Auth user detaches the login but preserves the domain profile and everything hanging off it — profiles are the durable identity, auth users are the credential.
- **`comments` has no owner foreign key** and so does not appear above. It is the one polymorphic relationship in the schema — an `entity_type` (`submission`/`resource`/ `meet`/`announcement`) plus `entity_id`, guarded by a CHECK, with no cascade. This is exactly the pattern the `attachments` table deliberately rejected (§7.4 chose separate FK columns for integrity), so a deleted submission leaves its comments behind; RLS still hides them because the parent-visibility check fails.
- **Two columns default to NO ACTION** and are worth a deliberate decision: `calendar_events.created_by` and `timetable_slots.tutor_id` carry no `ON DELETE` clause, so a profile still referenced by either blocks its own deletion. Every other `created_by` / `tutor_id` reference is SET NULL. This is most likely an omission rather than an intent; aligning both to SET NULL would make staff deletion behave consistently. Flagged, not changed — it is a schema decision, not a documentation one.
