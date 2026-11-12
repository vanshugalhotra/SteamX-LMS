/** Validates and compares student answers without persistence or framework dependencies. */
import { ASSIGNMENT_ITEM_TYPE, ASSIGNMENT_LIMITS } from '../../assignments/blueprint/constants.js';
import { gradeFromPercent, mcqPercent } from '../../grading/grade-scale.js';
import type { StudentAssignmentDetailRecord } from '../../assignments/delivery/delivery-assignments.service.js';

export type SubmissionAnswerInput = {
  itemId: string;
  selectedOptionId?: string;
  answerText?: string;
};

export type NormalizedSubmissionAnswer = {
  itemId: string;
  selectedOptionId: string | null;
  answerText: string | null;
};

export type SubmissionValidationProblem = { itemId: string; rule: string };
export type SubmissionItem = StudentAssignmentDetailRecord['items'][number];

const HTML_TAG_PATTERN = /^(?![\s\S]*<\/?[a-z][^>]*>)[\s\S]*$/i;

/** Collects every missing, duplicate, foreign, or incorrectly shaped item answer. */
export function validateSubmissionPayload(
  items: SubmissionItem[],
  answers: SubmissionAnswerInput[],
): { answers: NormalizedSubmissionAnswer[]; problems: SubmissionValidationProblem[] } {
  const problems: SubmissionValidationProblem[] = [];
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const answersByItem = new Map<string, SubmissionAnswerInput[]>();

  for (const answer of answers) {
    const matches = answersByItem.get(answer.itemId) ?? [];
    matches.push(answer);
    answersByItem.set(answer.itemId, matches);
    if (!itemsById.has(answer.itemId)) {
      problems.push({ itemId: answer.itemId, rule: 'unknownItem' });
    }
  }
  for (const [itemId, itemAnswers] of answersByItem) {
    if (itemAnswers.length > 1) {
      problems.push({ itemId, rule: 'duplicateItem' });
    }
  }

  const normalized: NormalizedSubmissionAnswer[] = [];
  for (const item of items) {
    const itemAnswers = answersByItem.get(item.id) ?? [];
    if (itemAnswers.length === 0) {
      problems.push({ itemId: item.id, rule: 'required' });
      continue;
    }
    for (const answer of itemAnswers) {
      if (item.type === ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE) {
        if (answer.selectedOptionId === undefined) {
          problems.push({ itemId: item.id, rule: 'selectedOptionRequired' });
        } else if (!item.options.some((option) => option.id === answer.selectedOptionId)) {
          problems.push({ itemId: item.id, rule: 'selectedOptionInvalid' });
        }
        if (answer.answerText !== undefined) {
          problems.push({ itemId: item.id, rule: 'answerTextNotAllowed' });
        }
        normalized.push({
          itemId: item.id,
          selectedOptionId: answer.selectedOptionId ?? null,
          answerText: null,
        });
      } else if (item.type === ASSIGNMENT_ITEM_TYPE.TEXT) {
        const answerText = answer.answerText?.trim();
        if (!answerText) {
          problems.push({ itemId: item.id, rule: 'answerTextRequired' });
        } else {
          const maxLength = textMaxLength(item.config);
          if (answerText.length > maxLength) {
            problems.push({ itemId: item.id, rule: 'answerTextTooLong' });
          }
          if (!HTML_TAG_PATTERN.test(answerText)) {
            problems.push({ itemId: item.id, rule: 'answerTextMustBePlainText' });
          }
        }
        if (answer.selectedOptionId !== undefined) {
          problems.push({ itemId: item.id, rule: 'selectedOptionNotAllowed' });
        }
        normalized.push({
          itemId: item.id,
          selectedOptionId: null,
          answerText: answerText ?? null,
        });
      } else {
        problems.push({ itemId: item.id, rule: 'fileUploadNotSupported' });
      }
    }
  }

  return { answers: normalized, problems };
}

/** Compares answer content by item ID, ignoring order and surrounding text whitespace. */
export function isSameSubmissionContent(
  existing: Array<Pick<NormalizedSubmissionAnswer, 'itemId' | 'selectedOptionId' | 'answerText'>>,
  submitted: NormalizedSubmissionAnswer[],
): boolean {
  if (existing.length !== submitted.length) {
    return false;
  }
  const existingByItem = new Map(existing.map((answer) => [answer.itemId, answer]));
  if (existingByItem.size !== existing.length) {
    return false;
  }
  return submitted.every((answer) => {
    const previous = existingByItem.get(answer.itemId);
    return (
      previous !== undefined &&
      previous.selectedOptionId === answer.selectedOptionId &&
      (previous.answerText?.trim() ?? null) === (answer.answerText?.trim() ?? null)
    );
  });
}

/** Computes the auto-grade percentage and mapped grade-scale level for an MCQ assignment. */
export function computeMcqGrade(correctAnswers: number, totalAnswers: number) {
  return gradeFromPercent(mcqPercent(correctAnswers, totalAnswers));
}

function textMaxLength(config: StudentAssignmentDetailRecord['items'][number]['config']): number {
  if (
    config !== null &&
    typeof config === 'object' &&
    !Array.isArray(config) &&
    'maxLength' in config &&
    typeof config.maxLength === 'number'
  ) {
    return config.maxLength;
  }
  return ASSIGNMENT_LIMITS.text.maxLength;
}
