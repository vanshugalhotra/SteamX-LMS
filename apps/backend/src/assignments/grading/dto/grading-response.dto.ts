/** Documents the teacher-facing assignment submission review and grade response shapes. */
import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../common/pagination/pagination-response.dto.js';
import { SubmissionStatus } from '../../../generated/prisma/client.js';
import {
  STUDENT_SUBMISSION_STATE,
  type StudentSubmissionState,
} from '../../../learning/assignments/assignment-student-rules.js';
import {
  StudentAssignmentItemDto,
  StudentAssignmentRubricDto,
} from '../../../learning/assignments/dto/student-assignment-response.dto.js';

export class TeacherSubmissionGradeDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  percent!: number;

  @ApiProperty()
  level!: string;

  @ApiProperty()
  letter!: string;
}

export class TeacherSubmissionListItemDto {
  @ApiProperty({ format: 'uuid' })
  studentId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  steamxId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  submissionId!: string | null;

  @ApiProperty({ enum: Object.values(STUDENT_SUBMISSION_STATE) })
  state!: StudentSubmissionState;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  submittedAt!: string | null;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({ type: TeacherSubmissionGradeDto, nullable: true })
  grade!: TeacherSubmissionGradeDto | null;
}

export class TeacherSubmissionListResponseDto extends PaginationResponseDto<TeacherSubmissionListItemDto> {
  @ApiProperty({ type: [TeacherSubmissionListItemDto] })
  override items!: TeacherSubmissionListItemDto[];
}

export class TeacherSubmissionStudentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  steamxId!: string;
}

export class TeacherSubmissionAnswerDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ type: String, nullable: true })
  answerText!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  selectedOptionId!: string | null;
}

export class TeacherSubmissionFileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  sizeBytes!: number;
}

export class TeacherSubmissionGradedByDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class TeacherSubmissionDetailedGradeDto extends TeacherSubmissionGradeDto {
  @ApiProperty({ type: [String], nullable: true })
  rubricLevels!: string[] | null;

  @ApiProperty({ type: String, nullable: true })
  feedback!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  gradedAt!: string;

  @ApiProperty({ type: TeacherSubmissionGradedByDto, nullable: true })
  gradedBy!: TeacherSubmissionGradedByDto | null;
}

export class TeacherSubmissionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: [SubmissionStatus.SUBMITTED, SubmissionStatus.GRADED] })
  state!: SubmissionStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  submittedAt!: string;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({ type: [TeacherSubmissionAnswerDto] })
  answers!: TeacherSubmissionAnswerDto[];

  @ApiProperty({ type: [TeacherSubmissionFileDto] })
  files!: TeacherSubmissionFileDto[];

  @ApiProperty({ type: TeacherSubmissionDetailedGradeDto, nullable: true })
  grade!: TeacherSubmissionDetailedGradeDto | null;
}

export class TeacherSubmissionAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: string | null;

  @ApiProperty({ type: [StudentAssignmentRubricDto], nullable: true })
  rubric!: StudentAssignmentRubricDto[] | null;

  @ApiProperty({ type: [StudentAssignmentItemDto] })
  items!: StudentAssignmentItemDto[];
}

export class TeacherSubmissionDetailResponseDto {
  @ApiProperty({ type: TeacherSubmissionStudentDto })
  student!: TeacherSubmissionStudentDto;

  @ApiProperty({ type: TeacherSubmissionAssignmentDto })
  assignment!: TeacherSubmissionAssignmentDto;

  @ApiProperty({ type: TeacherSubmissionDto })
  submission!: TeacherSubmissionDto;
}
