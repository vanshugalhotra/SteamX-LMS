import { ApiProperty } from '@nestjs/swagger';

export class StudentAssignmentGradesGradeDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  percent!: number;

  @ApiProperty()
  level!: string;

  @ApiProperty()
  letter!: string;

  @ApiProperty({ type: [String], nullable: true })
  rubricLevels!: string[] | null;

  @ApiProperty({ type: String, nullable: true })
  feedback!: string | null;

  @ApiProperty({ format: 'date-time' })
  gradedAt!: Date;
}

export class StudentAssignmentGradeAverageDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  percent!: number;

  @ApiProperty()
  level!: string;

  @ApiProperty()
  letter!: string;

  @ApiProperty({ minimum: 1 })
  gradedCount!: number;
}

export class StudentAssignmentGradeItemDto {
  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt!: Date | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  moduleId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  lessonId!: string | null;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: Date;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({ type: StudentAssignmentGradesGradeDto })
  grade!: StudentAssignmentGradesGradeDto;
}

export class StudentAssignmentGradesResponseDto {
  @ApiProperty({ type: StudentAssignmentGradeAverageDto, nullable: true })
  average!: StudentAssignmentGradeAverageDto | null;

  @ApiProperty({ type: [StudentAssignmentGradeItemDto] })
  items!: StudentAssignmentGradeItemDto[];
}
