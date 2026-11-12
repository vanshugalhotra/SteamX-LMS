/** Response DTOs for the authenticated student's assignment reads. */
import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../common/pagination/pagination-response.dto.js';
import { SubmissionStatus } from '../../../generated/prisma/client.js';
import {
  STUDENT_SUBMISSION_STATE,
  type StudentSubmissionState,
} from '../assignment-student-rules.js';

export class StudentAssignmentGradeDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  percent!: number;

  @ApiProperty()
  level!: string;

  @ApiProperty()
  letter!: string;
}

export class StudentAssignmentDetailedGradeDto extends StudentAssignmentGradeDto {
  @ApiProperty({ type: [String], nullable: true })
  rubricLevels!: string[] | null;

  @ApiProperty({ type: String, nullable: true })
  feedback!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  gradedAt!: Date | null;
}

export class StudentAssignmentSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  moduleId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  lessonId!: string | null;

  @ApiProperty()
  allowResubmission!: boolean;

  @ApiProperty()
  canSubmit!: boolean;

  @ApiProperty({ enum: Object.values(STUDENT_SUBMISSION_STATE) })
  submissionState!: StudentSubmissionState;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: Date | null;

  @ApiProperty({
    description: 'For a not-submitted assignment, true means a submission made now would be late.',
  })
  isLate!: boolean;

  @ApiProperty({ type: StudentAssignmentGradeDto, nullable: true })
  grade!: StudentAssignmentGradeDto | null;
}

export class StudentAssignmentListResponseDto extends PaginationResponseDto<StudentAssignmentSummaryDto> {
  @ApiProperty({ type: [StudentAssignmentSummaryDto] })
  override items!: StudentAssignmentSummaryDto[];
}

export class StudentAssignmentRubricDto {
  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
}

export class StudentAssignmentItemOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty()
  text!: string;
}

export class StudentAssignmentItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ minimum: 1 })
  position!: number;

  @ApiProperty({ enum: ['SINGLE_CHOICE', 'TEXT', 'FILE_UPLOAD'] })
  type!: string;

  @ApiProperty()
  prompt!: string;

  @ApiProperty({ nullable: true })
  config!: unknown;

  @ApiProperty({ type: [StudentAssignmentItemOptionDto] })
  options!: StudentAssignmentItemOptionDto[];
}

export class StudentAssignmentAnswerDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ type: String, nullable: true })
  answerText!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  selectedOptionId!: string | null;
}

export class StudentAssignmentFileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty({ minimum: 1, type: Number })
  sizeBytes!: number;
}

export class StudentAssignmentSubmissionDto {
  @ApiProperty({ enum: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] })
  state!: SubmissionStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  submittedAt!: Date;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({ type: [StudentAssignmentAnswerDto] })
  answers!: StudentAssignmentAnswerDto[];

  @ApiProperty({ type: [StudentAssignmentFileDto] })
  files!: StudentAssignmentFileDto[];

  @ApiProperty({ type: StudentAssignmentDetailedGradeDto, nullable: true })
  grade!: StudentAssignmentDetailedGradeDto | null;
}

export class StudentAssignmentDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  moduleId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  lessonId!: string | null;

  @ApiProperty()
  allowResubmission!: boolean;

  @ApiProperty()
  canSubmit!: boolean;

  @ApiProperty({
    description: 'For a not-submitted assignment, true means a submission made now would be late.',
  })
  isLate!: boolean;

  @ApiProperty({ type: [StudentAssignmentRubricDto], nullable: true })
  rubric!: StudentAssignmentRubricDto[] | null;

  @ApiProperty({ type: [StudentAssignmentItemDto] })
  items!: StudentAssignmentItemDto[];

  @ApiProperty({ type: StudentAssignmentSubmissionDto, nullable: true })
  submission!: StudentAssignmentSubmissionDto | null;
}
