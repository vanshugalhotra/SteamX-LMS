# Assignment templates

Assignment templates are global curriculum content managed by platform admins with
`assignment.template.manage`. A template starts as `DRAFT`. Admins can activate it after its
blueprint passes complete validation, archive it, and reactivate an archived active template.
Archived templates cannot be edited, and no template can return to `DRAFT`. A template with
assignment copies cannot be deleted.

The shared blueprint shape is:

```json
{
  "items": [
    {
      "type": "SINGLE_CHOICE",
      "prompt": "Which answer is correct?",
      "options": [
        { "text": "Correct answer", "isCorrect": true },
        { "text": "Another answer", "isCorrect": false }
      ]
    }
  ],
  "rubric": null,
  "allowResubmission": false
}
```

Items are ordered by their array position. Supported item types are `SINGLE_CHOICE`, `TEXT`, and
`FILE_UPLOAD`; prompts and option text are trimmed plain text, never HTML. A TEXT item may configure
`maxLength`. A FILE_UPLOAD item configures `maxFiles`, `maxSizeMb`, and one or more `allowedTypes`
(`PDF`, `IMAGE`, or `PRESENTATION`). Rubrics are either `null` or four categories with a name and
optional description; the default names are Knowledge, Thinking, Application, and Communication.

Every save enforces blueprint shape and field limits, while allowing drafts to be incomplete.
Activation applies the complete rules: at least one item, every single-choice item has at least two
options and exactly one correct answer, item types are all single-choice or none are, and a
single-choice blueprint has no rubric. The same complete validator is intended for assignment
publishing.

The current limits are provided by `GET /api/v1/assignments/defaults`; clients should not duplicate
them. Blueprint answer keys are returned only by `GET /api/v1/assignment-templates/:id`. List,
create, update, and status responses contain summary metadata, not `isCorrect`.

## Delivery assignment lifecycle

Teachers with `assignment.manage` can manage every assignment in a delivery where they have an
active teacher assignment. A DRAFT has never been published; PUBLISHED assignments are visible to
students; UNPUBLISHED assignments were published and hidden again. Publishing and unpublishing can
be safely retried.

Title, description, due date, and resubmission setting can always be edited. Items and options can
be edited only while the assignment is not PUBLISHED and has no submissions. Rubric content follows
the same lock; on a template copy only the rubric text may change, and its presence and four entries
stay fixed. Template-copy items are never editable. Replacing an item's list deletes and recreates
all item and option rows, so item IDs change. Anchors are immutable.

Publishing checks, in order: ACTIVE delivery, current course subscription, due date present, a
publishable blueprint, and a student-facing lesson if anchored. A template copy requires an ACTIVE
template from the delivery's course and can be created only once in each delivery. Its answer-key
fields are never included in teacher responses.

## Student view

Students read published assignments through the learning API. Course-level and module-anchored
assignments are visible in an active enrolled delivery. A lesson-anchored assignment is visible only
while its lesson is ACTIVE or ARCHIVED, has STUDENT audience, and is released to that delivery.
DRAFT and UNPUBLISHED assignments are hidden.

The list reports `NOT_SUBMITTED`, `SUBMITTED`, or `GRADED` for the student's own submission.
`canSubmit` is true when no submission exists or resubmission is enabled. For a submission,
`isLate` compares its submitted time with the due date captured for that submission; without a
submission, `isLate` predicts whether submitting now would be late. A null due date is not late.

`GET /api/v1/learning/deliveries/:id/grades` returns the student's graded submissions for visible
published assignments in that delivery, newest grade first. It is not paginated; the result is
bounded by the assignments in one delivery. Its average gives every graded assignment equal weight
and uses the shared grade-scale rounding rule. Unsubmitted and ungraded work is excluded.

`GET /api/v1/learning/deliveries/:id/progress` also returns visible assignment counts. `pending`
means there is no submission; ASG-4 calls this `NOT_SUBMITTED`. `submitted` and `graded` match the
student assignment states, and the three states sum to `total`.

Student responses omit answer keys, template and teacher details, storage keys, and file URLs.
Only assignment detail may include `isCorrect` on the student's own SINGLE_CHOICE answers, and
only for a graded submission when resubmission is disabled or the assignment deadline has passed.
With resubmission enabled before or at the deadline, correctness remains hidden. TEXT answers and
all other cases return `isCorrect: null`. Correctness is never included in the assignment list or
grades response. File metadata is available in assignment detail; file downloads are a separate
workflow.

## Review and grading

Teachers with `submission.grade` can review submissions for a delivery where they are actively
assigned. The paginated submission list has one row per ACTIVE enrollment and reports `NOT_SUBMITTED`,
`SUBMITTED`, or `GRADED`; removed enrollments are not included. For `NOT_SUBMITTED`, `isLate` predicts
whether a submission now would be late.

The grading mode is derived from the assignment, never from the request. A rubric requires one valid
grade-level code per rubric category. An assignment without a rubric uses one overall grade level,
except all-multiple-choice assignments, which are auto-graded and cannot be manually graded.
Teachers can regrade; a new grade replaces the prior grade and grader without keeping history.

The detail response includes student name and SteamX ID, student-safe items and option text, answers,
file metadata, and the current grade. It never includes option-level correctness, answer keys,
student email, or file storage keys/URLs. Per-answer correctness follows the student-view reveal
rule above. Before grading, the client must echo `submittedAt` exactly as returned by detail
(including milliseconds). A changed timestamp means the student resubmitted and the work must be
reviewed again. Grade feedback is plain text; blank feedback is stored as null.
Feedback is limited to 5,000 characters.

## Submitting

Students submit one answer for every item. The PUT replaces the complete answer set when
`allowResubmission` is enabled; a changed submission clears any existing teacher grade before
multiple-choice assignments are auto-graded again. A repeated identical answer set is a no-op, even
when resubmission is disabled, so it does not change `submittedAt`, lateness, or the grade. Late
submissions are accepted; `isLate` compares `submittedAt` with the due date captured for that
submission. Text answers are trimmed plain text, and file-upload items are not yet supported.
