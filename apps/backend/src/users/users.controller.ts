import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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

@ApiTags('Users')
@ApiCookieAuth('cookieAuth')
@ApiUnauthorizedResponse({ description: 'Session is invalid or missing.' })
@ApiForbiddenResponse({ description: 'The caller lacks the required permission.' })
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
  @ApiBadRequestResponse({ description: 'Teacher details are invalid.' })
  @ApiConflictResponse({ description: 'School is inactive or a user key conflicts.' })
  @ApiNotFoundResponse({ description: 'School not found.' })
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
  @ApiBadRequestResponse({ description: 'Student details are invalid.' })
  @ApiConflictResponse({ description: 'School is inactive or a user key conflicts.' })
  @ApiNotFoundResponse({ description: 'School or class section not found.' })
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
  @ApiBadRequestResponse({ description: 'Query parameters are invalid.' })
  @ApiNotFoundResponse({ description: 'School not found.' })
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
  @ApiNotFoundResponse({ description: 'User not found.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.users.findById(actor, id);
  }
}
