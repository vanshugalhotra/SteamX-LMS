import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../auth/permissions.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { UserListQueryDto } from './dto/user-list-query.dto.js';
import { UserListResponseDto } from './dto/user-list-response.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto.js';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';

@ApiTags('Users')
@ApiCookieAuth('cookieAuth')
@ApiUnauthorizedResponse({
  description: 'Session is invalid or missing.',
  type: ApiErrorResponseDto,
})
@ApiForbiddenResponse({
  description: 'Permission is missing or this action is blocked by Origin protection.',
  type: ApiErrorResponseDto,
})
@ApiInternalServerErrorResponse({
  description: 'An unexpected server error occurred.',
  type: ApiErrorResponseDto,
})
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ─────────────────────────────────────────
  // POST /users/teachers — Create a teacher
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.USER_CREATE_TEACHER)
  @Post('teachers')
  @ApiOperation({ summary: 'Create a teacher' })
  @ApiCreatedResponse({ description: 'Teacher created.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Teacher details are invalid.', type: ApiErrorResponseDto })
  @ApiConflictResponse({
    description: 'School is inactive or a unique user value conflicts.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({ description: 'School not found.', type: ApiErrorResponseDto })
  createTeacher(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateTeacherDto,
  ): Promise<UserResponseDto> {
    return this.users.createTeacher(actor, body);
  }

  // ─────────────────────────────────────────
  // POST /users/students — Create a student
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.USER_CREATE_STUDENT)
  @Post('students')
  @ApiOperation({ summary: 'Create a student' })
  @ApiCreatedResponse({ description: 'Student created.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Student details are invalid.', type: ApiErrorResponseDto })
  @ApiConflictResponse({
    description: 'School is inactive or a unique user value conflicts.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'School or class section not found.',
    type: ApiErrorResponseDto,
  })
  createStudent(
    @CurrentAuth() actor: AuthContext,
    @Body() body: CreateStudentDto,
  ): Promise<UserResponseDto> {
    return this.users.createStudent(actor, body);
  }

  // ─────────────────────────────────────────
  // GET /users — List users
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.USER_READ)
  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({ description: 'Paginated users.', type: UserListResponseDto })
  @ApiBadRequestResponse({
    description: 'Query parameters are invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Requested school is not visible to the caller.',
    type: ApiErrorResponseDto,
  })
  findMany(
    @CurrentAuth() actor: AuthContext,
    @Query() query: UserListQueryDto,
  ): Promise<UserListResponseDto> {
    return this.users.findMany(actor, query);
  }

  // ─────────────────────────────────────────
  // GET /users/:id — Get a user
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.USER_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  @ApiOkResponse({ description: 'User details.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'The user ID is not a UUID.', type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ description: 'User not found or not visible.', type: ApiErrorResponseDto })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.users.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // POST /users/:id/reset-password — Reset a user password
  // ─────────────────────────────────────────

  @RequirePermission(PERMISSION.USER_PASSWORD_RESET)
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a user password' })
  @ApiNoContentResponse({ description: 'Password reset; the user must change it after login.' })
  @ApiBadRequestResponse({
    description: 'The user ID or password is invalid, or this is a self-reset.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found.', type: ApiErrorResponseDto })
  resetPassword(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    return this.users.resetPassword(actor, id, body.newPassword);
  }
}
