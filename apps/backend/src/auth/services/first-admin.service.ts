import { Injectable } from '@nestjs/common';
import { Prisma, UserType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isPrismaKnownError } from '../../common/errors/prisma-error.js';
import { PasswordService } from './password.service.js';
import { validatePasswordPolicy } from '../validators/password-policy.js';
import { isValidSteamxId, normalizeSteamxId } from '../validators/steamx-id.js';
import {
  FirstAdminError,
  type FirstAdminInput,
  type FirstAdminResult,
} from '../types/first-admin.js';

const ADMIN_ROLE_KEY = 'admin';
const DEFAULT_ADMIN_NAME = 'Platform Admin';

type NormalizedFirstAdminInput = {
  steamxId: string;
  password: string;
  name: string;
};

@Injectable()
export class FirstAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async create(
    input: FirstAdminInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<FirstAdminResult> {
    const normalized = this.validateInput(input);
    const passwordHash = await this.passwords.hash(normalized.password);

    try {
      if (transaction) {
        return await this.createInTransaction(transaction, normalized, passwordHash);
      }

      return await this.prisma.$transaction(
        (tx) => this.createInTransaction(tx, normalized, passwordHash),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaKnownError(error) && error.code === 'P2021') {
        throw new FirstAdminError('Database migrations have not been applied. Run migrate:deploy.');
      }
      if (isPrismaKnownError(error) && error.code === 'P2034') {
        throw new FirstAdminError(
          'Another process may be creating the admin. Re-run the command to check.',
        );
      }
      if (isPrismaKnownError(error) && error.code === 'P2002') {
        throw new FirstAdminError('ADMIN_STEAMX_ID is already in use by another account.');
      }
      throw error;
    }
  }

  private validateInput(input: FirstAdminInput): NormalizedFirstAdminInput {
    const steamxId = normalizeSteamxId(input.steamxId);
    if (!isValidSteamxId(steamxId)) {
      throw new FirstAdminError(
        'ADMIN_STEAMX_ID must be 3–32 characters: letters, numbers, dot, underscore, or hyphen.',
      );
    }

    const passwordErrors = validatePasswordPolicy(input.password, steamxId);
    if (passwordErrors.length > 0) {
      throw new FirstAdminError(passwordErrors.join(' '));
    }

    const name = input.name === undefined ? DEFAULT_ADMIN_NAME : input.name.trim();
    if (name.length === 0) {
      throw new FirstAdminError('ADMIN_NAME must not be blank.');
    }

    return { steamxId, password: input.password, name };
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    input: NormalizedFirstAdminInput,
    passwordHash: string,
  ): Promise<FirstAdminResult> {
    const adminRole = await tx.role.findUnique({
      where: { key: ADMIN_ROLE_KEY },
      select: { id: true, userType: true },
    });

    if (!adminRole || adminRole.userType !== UserType.PLATFORM_STAFF) {
      throw new FirstAdminError(
        'Admin reference data is missing or invalid. Run database migrations first.',
      );
    }

    const existingAdmin = await tx.user.findFirst({
      where: { roleId: adminRole.id, userType: UserType.PLATFORM_STAFF },
      select: { steamxId: true },
    });

    if (existingAdmin) {
      return { created: false, steamxId: existingAdmin.steamxId };
    }

    await tx.user.create({
      data: {
        steamxId: input.steamxId,
        name: input.name,
        passwordHash,
        roleId: adminRole.id,
        userType: UserType.PLATFORM_STAFF,
        schoolId: null,
        mustChangePassword: true,
      },
    });

    return { created: true, steamxId: input.steamxId };
  }
}
