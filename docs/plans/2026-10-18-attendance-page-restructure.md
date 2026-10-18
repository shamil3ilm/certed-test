# Attendance page: say what happened, once

**Date:** 2026-10-18
**Surface:** `/classroom/[id]/attendance` (staff view)

## Why

The page asks a tutor to do one thing — record what happened in a class — and answers with up to
four stacked forms before any summary. On a two-session day it renders, in order: a times card and
a roster for session one, the same two again for session two, an always-expanded "Record another
session" card, a `SESSION LENGTH` stat card, and then the attendance history.

Three things make it read as clutter rather than density:

1. **A secondary action sits in primary space.** "Record another session" is expanded by default,
   between the sessions and the summary. Recording a second session is the exception; marking the
   roster is the job.
2. **Every session repeats a full times card**, even when its times are already set and nobody is
   editing them. The window — the one fact that identifies which session you are looking at — is
   buried inside the form rather than labelling it.
3. **The one derived number is given the heaviest treatment.** `SESSION LENGTH` is a `StatCard`, the
   component used for headline metrics, and it reads `0m` before anything is entered — which is the
   state the page is in every time you arrive to record.

A fourth problem is in the history: an attendance row shows date, status and learning minutes, but
not WHICH session it belongs to. On a two-session day the row cannot say what it refers to, and the
page compensates by measuring learning time against the day's _overall_ window (earliest start to
latest end) instead of the session's own.

## What changes

1. **Session length moves into the times box, live.** The form already holds `start` and `end` in
   state, so the length renders under the two fields as they are typed, not only after saving:
   `1h 00m - this is what Class hours will bill`. It appears only when both times are set and the
   end follows the start, so it never shows `0m` or a negative. The `StatCard` is removed.
   Catching `16:00-17:00` when `18:00` was meant matters BEFORE the write, because this window is
   what teaching hours bills (`workflow-invariants.md` #1).
2. **A day total in the header** for multi-session days, where the arithmetic is genuinely hard.
   One line beside the date, not a card.
3. **"Record another session" collapses** into a `<details>` row at the end of the session list.
   The page already uses that disclosure for tutor summaries, so this is an existing pattern.
4. **Each session becomes a card titled by its window** - `16:00-17:00 · Tarun Tutor` - with the
   times form collapsed behind it unless the times are unset. The roster is the card's body.
5. **Attendance-details rows carry their session**: its window and tutor. The rows already key on
   `session_id`, so this is a join, not a schema change. A tutor since removed from the class is
   still named, since they taught the sessions recorded against them. The staff table already
   measures time in class per student (join to leave), so its minutes are unchanged; the
   day-window approximation of learning time lives in the student view, which is out of scope.

## Out of scope

- The empty-date path (no session yet, marking records one) keeps its current shape. It is not a
  duplicate of the per-session roster; it only renders when `daySessions.length === 0`.
- The student view (attendance rate card, per-day list) is untouched.
- No change to what is written: `class_sessions.actual_start/actual_end` and `attendance` rows keep
  their current semantics and their current separate write paths.

## How it is verified

- The existing attendance service and page-data tests keep passing unchanged - this is presentation.
- New tests: the length line appears only for a valid window and states the billing link; the
  disclosure is collapsed by default; a details row renders its session's window; a day with two
  sessions totals them in the header.
- Checked in the browser on the running mock server, on a date with two recorded sessions.
