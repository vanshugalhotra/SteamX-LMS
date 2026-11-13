import {
  computeMcqGrade,
  isSameSubmissionContent,
  validateSubmissionPayload,
} from './submission-rules.js';
import type { SubmissionItem } from './submission-rules.js';

const choiceItem = {
  id: 'choice',
  type: 'SINGLE_CHOICE',
  position: 1,
  prompt: 'Choose one.',
  config: null,
  options: [
    { id: 'choice-a', text: 'A', position: 1 },
    { id: 'choice-b', text: 'B', position: 2 },
  ],
} as SubmissionItem;

const textItem = {
  id: 'text',
  type: 'TEXT',
  position: 1,
  prompt: 'Write.',
  config: { maxLength: 5 },
  options: [],
} as SubmissionItem;

describe('validateSubmissionPayload', () => {
  it('normalizes option answers and trims text answers', () => {
    expect(
      validateSubmissionPayload(
        [choiceItem, textItem],
        [
          { itemId: 'text', answerText: '  hello  ' },
          { itemId: 'choice', selectedOptionId: 'choice-a' },
        ],
      ),
    ).toEqual({
      answers: [
        { itemId: 'choice', selectedOptionId: 'choice-a', answerText: null },
        { itemId: 'text', selectedOptionId: null, answerText: 'hello' },
      ],
      problems: [],
    });
  });

  it.each([
    ['missing choice option', [{ itemId: 'choice' }], 'selectedOptionRequired'],
    [
      'option from another item',
      [{ itemId: 'choice', selectedOptionId: 'foreign-option' }],
      'selectedOptionInvalid',
    ],
    [
      'text on a choice item',
      [{ itemId: 'choice', selectedOptionId: 'choice-a', answerText: 'no' }],
      'answerTextNotAllowed',
    ],
    ['empty text', [{ itemId: 'text', answerText: '  ' }], 'answerTextRequired'],
    ['long text', [{ itemId: 'text', answerText: '123456' }], 'answerTextTooLong'],
  ])('reports %s', (_case, answers, rule) => {
    expect(validateSubmissionPayload([choiceItem, textItem], answers).problems).toContainEqual({
      itemId:
        rule === 'selectedOptionRequired' ||
        rule === 'selectedOptionInvalid' ||
        rule === 'answerTextNotAllowed'
          ? 'choice'
          : 'text',
      rule,
    });
  });

  it('rejects HTML in an otherwise valid plain-text response', () => {
    const longTextItem = { ...textItem, config: { maxLength: 20 } } as SubmissionItem;
    expect(
      validateSubmissionPayload([longTextItem], [{ itemId: 'text', answerText: '<p>x</p>' }])
        .problems,
    ).toContainEqual({ itemId: 'text', rule: 'answerTextMustBePlainText' });
  });

  it('collects several invalid item problems together with their item IDs', () => {
    const result = validateSubmissionPayload(
      [choiceItem, textItem],
      [
        { itemId: 'foreign', answerText: 'x' },
        { itemId: 'choice', selectedOptionId: 'wrong' },
        { itemId: 'choice', selectedOptionId: 'choice-a' },
        { itemId: 'text', answerText: '' },
      ],
    );

    expect(result.problems).toEqual(
      expect.arrayContaining([
        { itemId: 'foreign', rule: 'unknownItem' },
        { itemId: 'choice', rule: 'duplicateItem' },
        { itemId: 'choice', rule: 'selectedOptionInvalid' },
        { itemId: 'text', rule: 'answerTextRequired' },
      ]),
    );
  });

  it('requires every assignment item and rejects answer selection for TEXT items', () => {
    expect(validateSubmissionPayload([choiceItem, textItem], []).problems).toEqual([
      { itemId: 'choice', rule: 'required' },
      { itemId: 'text', rule: 'required' },
    ]);
    expect(
      validateSubmissionPayload(
        [textItem],
        [{ itemId: 'text', answerText: 'ok', selectedOptionId: 'choice-a' }],
      ).problems,
    ).toContainEqual({ itemId: 'text', rule: 'selectedOptionNotAllowed' });
  });
});

describe('isSameSubmissionContent', () => {
  const answers = [
    { itemId: 'text', selectedOptionId: null, answerText: 'hello' },
    { itemId: 'choice', selectedOptionId: 'choice-a', answerText: null },
  ];

  it('ignores order and surrounding text whitespace', () => {
    expect(
      isSameSubmissionContent([{ ...answers[0]!, answerText: ' hello ' }, answers[1]!], answers),
    ).toBe(true);
  });

  it('detects an option change', () => {
    expect(
      isSameSubmissionContent(answers, [
        answers[0]!,
        { ...answers[1]!, selectedOptionId: 'choice-b' },
      ]),
    ).toBe(false);
  });
});

describe('computeMcqGrade', () => {
  it.each([
    [3, 3, { percent: 100, level: '4+', letter: 'A+' }],
    [2, 3, { percent: 66.67, level: '2', letter: 'C' }],
    [0, 4, { percent: 0, level: 'R', letter: 'F' }],
  ])('maps %s of %s correctly', (correct, total, expected) => {
    expect(computeMcqGrade(correct, total)).toEqual(expected);
  });
});
