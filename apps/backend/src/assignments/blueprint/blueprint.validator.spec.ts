/** Covers blueprint shape validation on save and complete validation before activation. */
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { AssignmentBlueprintDto } from './blueprint.dto.js';
import type { AssignmentBlueprint } from './constants.js';
import { assertPublishableBlueprint } from './blueprint.validator.js';

const textItem = (overrides: Record<string, unknown> = {}) => ({
  type: 'TEXT',
  prompt: 'Explain your answer.',
  ...overrides,
});

const choiceItem = (
  options: Array<{ text: string; isCorrect: boolean }> = [
    { text: 'Correct', isCorrect: true },
    { text: 'Incorrect', isCorrect: false },
  ],
  overrides: Record<string, unknown> = {},
) => ({
  type: 'SINGLE_CHOICE',
  prompt: 'Choose an answer.',
  options,
  ...overrides,
});

const blueprint = (items: unknown[] = [textItem()], overrides: Record<string, unknown> = {}) => ({
  items,
  rubric: null,
  allowResubmission: false,
  ...overrides,
});

function shapeErrors(value: unknown): string[] {
  const instance = plainToInstance(AssignmentBlueprintDto, value);
  return validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  }).flatMap((error) => flattenErrors(error));
}

function flattenErrors(error: ValidationError, parent = ''): string[] {
  const path = parent ? `${parent}.${error.property}` : error.property;
  return [
    ...Object.keys(error.constraints ?? {}).map((key) => `${path}:${key}`),
    ...(error.children ?? []).flatMap((child) => flattenErrors(child, path)),
  ];
}

describe('assignment blueprint shape validation', () => {
  it.each([
    ['unknown item type', blueprint([textItem({ type: 'ESSAY' })])],
    ['options on TEXT', blueprint([textItem({ options: [] })])],
    ['config on SINGLE_CHOICE', blueprint([choiceItem(undefined, { config: { maxLength: 100 } })])],
    [
      'more than one correct answer',
      blueprint([
        choiceItem([
          { text: 'First', isCorrect: true },
          { text: 'Second', isCorrect: true },
        ]),
      ]),
    ],
    [
      'rubric with three categories',
      blueprint([textItem()], {
        rubric: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }],
      }),
    ],
    [
      'rubric with five categories',
      blueprint([textItem()], {
        rubric: [
          { name: 'One' },
          { name: 'Two' },
          { name: 'Three' },
          { name: 'Four' },
          { name: 'Five' },
        ],
      }),
    ],
    ['empty rubric name', blueprint([textItem()], { rubric: [{ name: '' }, {}, {}, {}] })],
    ['too many items', blueprint(Array.from({ length: 51 }, () => textItem()))],
    ['prompt over limit', blueprint([textItem({ prompt: 'p'.repeat(5001) })])],
    [
      'too few multiple-choice options',
      blueprint([choiceItem([{ text: 'Only option', isCorrect: false }])]),
    ],
    ['missing multiple-choice options', blueprint([choiceItem(undefined, { options: undefined })])],
    [
      'too many multiple-choice options',
      blueprint([
        choiceItem(
          Array.from({ length: 7 }, (_, index) => ({ text: `${index}`, isCorrect: false })),
        ),
      ]),
    ],
    [
      'option text over limit',
      blueprint([
        choiceItem([
          { text: 'x'.repeat(501), isCorrect: true },
          { text: 'Other', isCorrect: false },
        ]),
      ]),
    ],
    [
      'rubric name over limit',
      blueprint([textItem()], {
        rubric: [{ name: 'x'.repeat(61) }, { name: 'Two' }, { name: 'Three' }, { name: 'Four' }],
      }),
    ],
    [
      'rubric description over limit',
      blueprint([textItem()], {
        rubric: [
          { name: 'One', description: 'x'.repeat(501) },
          { name: 'Two' },
          { name: 'Three' },
          { name: 'Four' },
        ],
      }),
    ],
    ['TEXT maxLength over limit', blueprint([textItem({ config: { maxLength: 20001 } })])],
    [
      'FILE_UPLOAD config missing required fields',
      blueprint([
        {
          type: 'FILE_UPLOAD',
          prompt: 'Upload a file.',
          config: { maxFiles: 1, allowedTypes: ['PDF'] },
        },
      ]),
    ],
    [
      'FILE_UPLOAD maxFiles below minimum',
      blueprint([
        {
          type: 'FILE_UPLOAD',
          prompt: 'Upload a file.',
          config: { maxFiles: 0, maxSizeMb: 1, allowedTypes: ['PDF'] },
        },
      ]),
    ],
    [
      'FILE_UPLOAD maxFiles above maximum',
      blueprint([
        {
          type: 'FILE_UPLOAD',
          prompt: 'Upload a file.',
          config: { maxFiles: 6, maxSizeMb: 1, allowedTypes: ['PDF'] },
        },
      ]),
    ],
    [
      'FILE_UPLOAD maxSizeMb below minimum',
      blueprint([
        {
          type: 'FILE_UPLOAD',
          prompt: 'Upload a file.',
          config: { maxFiles: 1, maxSizeMb: 0, allowedTypes: ['PDF'] },
        },
      ]),
    ],
    [
      'FILE_UPLOAD maxSizeMb above maximum',
      blueprint([
        {
          type: 'FILE_UPLOAD',
          prompt: 'Upload a file.',
          config: { maxFiles: 1, maxSizeMb: 26, allowedTypes: ['PDF'] },
        },
      ]),
    ],
    [
      'FILE_UPLOAD without an allowed type',
      blueprint([
        {
          type: 'FILE_UPLOAD',
          prompt: 'Upload a file.',
          config: { maxFiles: 1, maxSizeMb: 1, allowedTypes: [] },
        },
      ]),
    ],
    [
      'unknown allowed file type',
      blueprint([
        {
          type: 'FILE_UPLOAD',
          prompt: 'Upload a file.',
          config: { maxFiles: 1, maxSizeMb: 1, allowedTypes: ['ZIP'] },
        },
      ]),
    ],
    ['HTML in prompt', blueprint([textItem({ prompt: '<p>not plain text</p>' })])],
    [
      'HTML in option text',
      blueprint([
        choiceItem([
          { text: '<em>Correct</em>', isCorrect: true },
          { text: 'Other', isCorrect: false },
        ]),
      ]),
    ],
    ['unknown root field', { ...blueprint(), unknown: true }],
    ['unknown item field', blueprint([textItem({ extra: true })])],
    [
      'unknown config field',
      blueprint([
        {
          type: 'TEXT',
          prompt: 'Write.',
          config: { maxLength: 100, extra: true },
        },
      ]),
    ],
    [
      'unknown option field',
      blueprint([
        choiceItem([
          { text: 'A', isCorrect: true, extra: true } as { text: string; isCorrect: boolean },
          { text: 'B', isCorrect: false },
        ]),
      ]),
    ],
    [
      'unknown rubric field',
      blueprint([textItem()], {
        rubric: [
          { name: 'One', extra: true },
          { name: 'Two' },
          { name: 'Three' },
          { name: 'Four' },
        ],
      }),
    ],
  ])('rejects %s', (_case, input) => {
    expect(shapeErrors(input).length).toBeGreaterThan(0);
  });

  it('trims prompts, option text, rubric names, and rubric descriptions', () => {
    const instance = plainToInstance(
      AssignmentBlueprintDto,
      blueprint(
        [
          choiceItem([
            { text: '  Correct  ', isCorrect: true },
            { text: '  Wrong  ', isCorrect: false },
          ]),
        ],
        {
          rubric: [
            { name: ' One ', description: ' Desc ' },
            { name: ' Two ' },
            { name: ' Three ' },
            { name: ' Four ' },
          ],
        },
      ),
    );
    expect(instance.items[0]?.prompt).toBe('Choose an answer.');
    expect(instance.items[0]?.options?.[0]?.text).toBe('Correct');
    expect(instance.rubric?.[0]?.name).toBe('One');
    expect(instance.rubric?.[0]?.description).toBe('Desc');
    expect(shapeErrors(blueprint([textItem()]))).toEqual([]);
  });

  it('defaults allowResubmission to false when omitted from a supplied blueprint', () => {
    const instance = plainToInstance(AssignmentBlueprintDto, {
      items: [textItem()],
      rubric: null,
    });
    expect(instance.allowResubmission).toBe(false);
    expect(shapeErrors({ items: [textItem()], rubric: null })).toEqual([]);
  });
});

describe('assertPublishableBlueprint', () => {
  it('requires at least one item', () => {
    expectProblems(blueprint([]), ['items']);
  });

  it.each([
    ['one option', [{ text: 'Only', isCorrect: true }], ['items.0.options']],
    ['zero options', [], ['items.0.options', 'items.0.options']],
    [
      'two correct options',
      [
        { text: 'First', isCorrect: true },
        { text: 'Second', isCorrect: true },
      ],
      ['items.0.options'],
    ],
  ])('rejects a SINGLE_CHOICE item with %s', (_case, options, expectedPaths) => {
    expectProblems(
      blueprint([choiceItem(options as Array<{ text: string; isCorrect: boolean }>)]),
      expectedPaths,
    );
  });

  it('rejects a mixture of SINGLE_CHOICE and TEXT items', () => {
    expectProblems(blueprint([choiceItem(), textItem()]), ['items']);
  });

  it('rejects a rubric on a SINGLE_CHOICE blueprint', () => {
    expectProblems(
      blueprint([choiceItem()], {
        rubric: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }, { name: 'Four' }],
      }),
      ['rubric'],
    );
  });

  it('collects all complete-rule problems with exact paths', () => {
    const error = getBlueprintError(
      blueprint([choiceItem([{ text: 'Only', isCorrect: false }]), textItem()], {
        rubric: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }, { name: 'Four' }],
      }),
    );
    expect(error.details).toEqual([
      {
        path: 'items.0.options',
        rule: 'minOptions',
        message: 'A single-choice item requires at least two options',
      },
      {
        path: 'items.0.options',
        rule: 'exactlyOneCorrect',
        message: 'A single-choice item requires exactly one correct option',
      },
      {
        path: 'items',
        rule: 'homogeneousTypes',
        message: 'A blueprint must contain only single-choice items or no single-choice items',
      },
      {
        path: 'rubric',
        rule: 'rubricNotAllowed',
        message: 'Rubrics are not allowed when the blueprint contains single-choice items',
      },
    ]);
  });

  it('accepts valid single-choice and text blueprints', () => {
    expect(() =>
      assertPublishableBlueprint(blueprint([choiceItem()]) as AssignmentBlueprint),
    ).not.toThrow();
    expect(() =>
      assertPublishableBlueprint(
        blueprint([textItem()], {
          rubric: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }, { name: 'Four' }],
        }) as AssignmentBlueprint,
      ),
    ).not.toThrow();
  });
});

function expectProblems(input: unknown, paths: string[]): void {
  expect(getBlueprintError(input).details.map((problem) => problem.path)).toEqual(paths);
}

function getBlueprintError(input: unknown): {
  details: Array<{ path: string; rule: string; message: string }>;
} {
  try {
    assertPublishableBlueprint(input as AssignmentBlueprint);
  } catch (error) {
    const response = (error as { getResponse(): unknown }).getResponse();
    if (typeof response === 'object' && response !== null && 'details' in response) {
      return response as { details: Array<{ path: string; rule: string; message: string }> };
    }
  }
  throw new Error('Expected blueprint validation to fail');
}
