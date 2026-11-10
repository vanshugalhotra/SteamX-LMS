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
