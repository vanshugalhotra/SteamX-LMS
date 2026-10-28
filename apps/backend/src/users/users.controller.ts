import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { PERMISSION } from '../auth/permissions.js';
import type { AuthContext } from '../auth/types/auth-context.js';
import { ApiProtectedController } from '../common/decorators/api-protected-controller.decorator.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { UserListQueryDto } from './dto/user-list-query.dto.js';
import { UserListResponseDto } from './dto/user-list-response.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';
import { RenameSteamxIdDto } from './dto/rename-steamx-id.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

/** Declares user-management routes; business rules and visibility checks live in UsersService. */
@ApiTags('Users')
@ApiProtectedController()
@ApiForbiddenResponse({
  description: 'The required permission is missing, or Origin is invalid.',
})
@Controller({ path: 'users' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ─────────────────────────────────────────
  // POST /users/teachers — Create a teacher
  // ─────────────────────────────────────────

  /** Creates a teacher from the request body and returns its public profile; invalid input or conflicts are rejected. */
  @RequirePermission(PERMISSION.USER_CREATE_TEACHER)
  @Post('teachers')
  @ApiOperation({ summary: 'Create a teacher' })
  @ApiCreatedResponse({ description: 'Teacher created.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Teacher details are invalid.' })
  @ApiConflictResponse({
    description:
      'School is inactive, a unique user value conflicts, or a SteamX ID could not be allocated.',
  })
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

  /** Creates a student from the request body and returns its public profile; section ownership is checked. */
  @RequirePermission(PERMISSION.USER_CREATE_STUDENT)
  @Post('students')
  @ApiOperation({ summary: 'Create a student' })
  @ApiCreatedResponse({ description: 'Student created.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Student details are invalid.' })
  @ApiConflictResponse({
    description:
      'School is inactive, a unique user value conflicts, or a SteamX ID could not be allocated.',
  })
  @ApiNotFoundResponse({
    description: 'School or class section not found.',
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

  /** Returns a paginated user list filtered by the query, caller visibility, and school scope. */
  @RequirePermission(PERMISSION.USER_READ)
  @Get()
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({ description: 'Paginated users.', type: UserListResponseDto })
  @ApiBadRequestResponse({
    description: 'Query parameters are invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Requested school is not visible to the caller.',
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

  /** Returns one visible user; foreign and nonexistent IDs share the same 404 response. */
  @RequirePermission(PERMISSION.USER_READ)
  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  @ApiOkResponse({ description: 'User details.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'The user ID is not a UUID.' })
  @ApiNotFoundResponse({ description: 'User not found or not visible.' })
  findById(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.users.findById(actor, id);
  }

  // ─────────────────────────────────────────
  // PATCH /users/:id — Update a user
  // ─────────────────────────────────────────

  /** Updates supported account/profile fields and returns the profile; invalid fields or IDs are rejected. */
  @RequirePermission(PERMISSION.USER_UPDATE)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiOkResponse({ description: 'User updated.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'The update is invalid or a field does not apply.' })
  @ApiConflictResponse({ description: 'Email address is already in use.' })
  @ApiNotFoundResponse({ description: 'User not found or not visible.' })
  update(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.users.update(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /users/:id/status — Change user status
  // ─────────────────────────────────────────

  /** Changes a visible school user's status and returns the profile; self-deactivation is rejected. */
  @RequirePermission(PERMISSION.USER_DEACTIVATE)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Change a user status' })
  @ApiOkResponse({ description: 'User status updated.', type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'The user ID or status is invalid.' })
  @ApiNotFoundResponse({ description: 'User not found or not visible.' })
  updateStatus(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.users.updateStatus(actor, id, body);
  }

  // ─────────────────────────────────────────
  // PATCH /users/:id/steamx-id — Rename a user's SteamX ID
  // ─────────────────────────────────────────

  /** Renames a visible school user's login ID and returns the profile; invalid or duplicate IDs are rejected. */
  @RequirePermission(PERMISSION.USER_STEAMX_ID_UPDATE)
  @Patch(':id/steamx-id')
  @ApiOperation({ summary: "Rename a user's SteamX ID" })
  @ApiOkResponse({ description: "User's SteamX ID updated.", type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'The user ID or SteamX ID is invalid.' })
  @ApiConflictResponse({ description: 'The SteamX ID is already in use.' })
  @ApiNotFoundResponse({ description: 'User not found or not visible.' })
  renameSteamxId(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameSteamxIdDto,
  ): Promise<UserResponseDto> {
    return this.users.renameSteamxId(actor, id, body);
  }

  // ─────────────────────────────────────────
  // POST /users/:id/reset-password — Reset a user password
  // ─────────────────────────────────────────

  /** Resets another visible user's password; returns no content and rejects self-reset. */
  @RequirePermission(PERMISSION.USER_PASSWORD_RESET)
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reset a user password' })
  @ApiNoContentResponse({ description: 'Password reset; the user must change it after login.' })
  @ApiBadRequestResponse({
    description: 'The user ID or password is invalid, or this is a self-reset.',
  })
  @ApiNotFoundResponse({ description: 'User not found or not visible.' })
  resetPassword(
    @CurrentAuth() actor: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
  ): Promise<void> {
    return this.users.resetPassword(actor, id, body.newPassword);
  }
}
