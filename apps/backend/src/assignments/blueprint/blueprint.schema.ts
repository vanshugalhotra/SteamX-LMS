/** Canonical assignment blueprint schema and types used for writes and stored JSON reads. */
import { z } from 'zod';
import {
  ASSIGNMENT_ITEM_TYPE,
  ASSIGNMENT_LIMITS,
  FILE_UPLOAD_TYPE,
  RUBRIC_SIZE,
} from './constants.js';

const HTML_TAG_PATTERN = /^(?![\s\S]*<\/?[a-z][^>]*>)[\s\S]*$/i;

const plainText = (maxLength: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} cannot be empty`)
    .max(maxLength, `${label} cannot be longer than ${maxLength} characters`)
    .regex(HTML_TAG_PATTERN, `${label} must be plain text, not HTML`);

export const AssignmentBlueprintOptionSchema = z
  .object({
    text: plainText(ASSIGNMENT_LIMITS.options.textMaxLength, 'Option text'),
    isCorrect: z.boolean(),
  })
  .strict();

const TextConfigSchema = z
  .object({
    maxLength: z.number().int().min(1).max(ASSIGNMENT_LIMITS.text.maxLength),
  })
  .strict();

const FileUploadTypeSchema = z.enum(FILE_UPLOAD_TYPE);

const FileUploadConfigSchema = z
  .object({
    maxFiles: z
      .number()
      .int()
      .min(ASSIGNMENT_LIMITS.fileUpload.minFiles)
      .max(ASSIGNMENT_LIMITS.fileUpload.maxFiles),
    maxSizeMb: z
      .number()
      .int()
      .min(ASSIGNMENT_LIMITS.fileUpload.minSizeMb)
      .max(ASSIGNMENT_LIMITS.fileUpload.maxSizeMb),
    allowedTypes: z.array(FileUploadTypeSchema).min(1),
  })
  .strict();

const SharedItemShape = {
  prompt: plainText(ASSIGNMENT_LIMITS.promptMaxLength, 'Prompt'),
};

const SingleChoiceOptionsSchema = z
  .array(AssignmentBlueprintOptionSchema)
  .min(ASSIGNMENT_LIMITS.options.min)
  .max(ASSIGNMENT_LIMITS.options.max)
  .superRefine((options, context) => {
    if (options.filter((option) => option.isCorrect).length > 1) {
      context.addIssue({
        code: 'custom',
        message: 'At most one option may be marked correct',
      });
    }
  });

const SingleChoiceItemSchema = z
  .object({
    type: z.literal(ASSIGNMENT_ITEM_TYPE.SINGLE_CHOICE),
    ...SharedItemShape,
    config: z.never().optional(),
    options: SingleChoiceOptionsSchema,
  })
  .strict();

const TextItemSchema = z
  .object({
    type: z.literal(ASSIGNMENT_ITEM_TYPE.TEXT),
    ...SharedItemShape,
    config: TextConfigSchema.optional(),
    options: z.never().optional(),
  })
  .strict();

const FileUploadItemSchema = z
  .object({
    type: z.literal(ASSIGNMENT_ITEM_TYPE.FILE_UPLOAD),
    ...SharedItemShape,
    config: FileUploadConfigSchema,
    options: z.never().optional(),
  })
  .strict();

export const AssignmentBlueprintItemSchema = z.discriminatedUnion('type', [
  SingleChoiceItemSchema,
  TextItemSchema,
  FileUploadItemSchema,
]);

export const AssignmentRubricItemSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Rubric name cannot be empty')
      .max(ASSIGNMENT_LIMITS.rubric.nameMaxLength),
    description: z
      .string()
      .trim()
      .max(ASSIGNMENT_LIMITS.rubric.descriptionMaxLength)
      .nullable()
      .optional(),
  })
  .strict();

export const AssignmentBlueprintSchema = z
  .object({
    items: z.array(AssignmentBlueprintItemSchema).max(ASSIGNMENT_LIMITS.maxItems),
    rubric: z.array(AssignmentRubricItemSchema).length(RUBRIC_SIZE).nullable(),
    allowResubmission: z.boolean().default(false),
  })
  .strict();

export type AssignmentBlueprint = z.infer<typeof AssignmentBlueprintSchema>;
export type AssignmentBlueprintInput = z.input<typeof AssignmentBlueprintSchema>;
export type AssignmentBlueprintItem = z.infer<typeof AssignmentBlueprintItemSchema>;
export type AssignmentBlueprintItemInput = z.input<typeof AssignmentBlueprintItemSchema>;
export type AssignmentBlueprintOption = z.infer<typeof AssignmentBlueprintOptionSchema>;
export type AssignmentRubricItem = z.infer<typeof AssignmentRubricItemSchema>;
export type AssignmentTextConfig = z.infer<typeof TextConfigSchema>;
export type AssignmentFileUploadConfig = z.infer<typeof FileUploadConfigSchema>;
export type AssignmentItemType = AssignmentBlueprintItem['type'];
export type FileUploadType = z.infer<typeof FileUploadTypeSchema>;
