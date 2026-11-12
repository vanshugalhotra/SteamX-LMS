/** Applies learning access rules and maps the authenticated student's assignment reads. */
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryAssignmentsService } from '../../assignments/delivery/delivery-assignments.service.js';
import type { AuthContext } from '../../auth/types/auth-context.js';
import { API_ERROR } from '../../common/errors/api-errors.js';
import { paginate } from '../../common/pagination/paginate.js';
import type { PaginationResponseDto } from '../../common/pagination/pagination-response.dto.js';
import { LearningAccessService } from '../learning-access.service.js';
import {
  toStudentAssignmentDetail,
  toStudentAssignmentSummary,
} from './student-assignments.mapper.js';
import type { StudentAssignmentListQueryDto } from './dto/student-assignment-list-query.dto.js';
import type {
  StudentAssignmentDetailResponseDto,
  StudentAssignmentSummaryDto,
} from './dto/student-assignment-response.dto.js';

/** Provides access-checked student assignment list and detail reads. */
@Injectable()
export class StudentAssignmentsService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly assignments: DeliveryAssignmentsService,
  ) {}

  /** Lists published visible assignments and only the authenticated student's submission state. */
  async findMany(
    auth: AuthContext,
    deliveryId: string,
    query: StudentAssignmentListQueryDto,
  ): Promise<PaginationResponseDto<StudentAssignmentSummaryDto>> {
    const access = await this.access.assertDeliveryAccess(auth, deliveryId);
    if (access.studentId === undefined) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }

    const page = await this.assignments.findStudentAssignments(
      access.deliveryId,
      access.studentId,
      query,
    );
    const now = new Date();
    return paginate(
      page.items.map((assignment) => toStudentAssignmentSummary(assignment, now)),
      query.page,
      query.limit,
      page.total,
    );
  }

  /** Reads a published visible assignment and this student's private submission metadata. */
  async findById(
    auth: AuthContext,
    deliveryId: string,
    assignmentId: string,
  ): Promise<StudentAssignmentDetailResponseDto> {
    const access = await this.access.assertDeliveryAccess(auth, deliveryId);
    if (access.studentId === undefined) {
      throw new ForbiddenException(API_ERROR.FORBIDDEN);
    }

    const assignment = await this.assignments.findStudentAssignmentById(
      access.deliveryId,
      access.studentId,
      assignmentId,
    );
    if (!assignment) {
      throw new NotFoundException(API_ERROR.NOT_FOUND);
    }
    return toStudentAssignmentDetail(assignment, new Date());
  }
}
