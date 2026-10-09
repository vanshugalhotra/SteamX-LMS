import { Injectable } from '@nestjs/common';
import { Prisma, UserType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isPrismaKnownError } from '../common/errors/prisma-error.js';
import { PasswordService } from './password.service.js';
import { validatePasswordPolicy } from './password-policy.js';

const ADMIN_ROLE_KEY = 'admin';
const DEFAULT_ADMIN_NAME = 'Platform Admin';
const STEAMX_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,31}$/;

export type FirstAdminInput = {
  steamxId: string;
  password: string;
  name?: string;
};

export type FirstAdminResult = {
  created: boolean;
  steamxId: string;
};

export class FirstAdminError extends Error {}

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

    if (transaction) {
      return this.createInTransaction(transaction, normalized);
    }

    return this.prisma.$transaction((tx) => this.createInTransaction(tx, normalized), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private validateInput(input: FirstAdminInput): NormalizedFirstAdminInput {
    const steamxId = input.steamxId.trim().toUpperCase();
    if (!STEAMX_ID_PATTERN.test(steamxId)) {
      throw new FirstAdminError('ADMIN_STEAMX_ID must be 3–32 valid SteamX ID characters.');
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
  ): Promise<FirstAdminResult> {
    let adminRole: { id: number; userType: UserType } | null;
    try {
      adminRole = await tx.role.findUnique({
        where: { key: ADMIN_ROLE_KEY },
        select: { id: true, userType: true },
      });
    } catch (error) {
      if (isPrismaKnownError(error) && error.code === 'P2021') {
        throw new FirstAdminError('Database migrations have not been applied. Run migrate:deploy.');
      }
      throw error;
    }

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
        passwordHash: await this.passwords.hash(input.password),
        roleId: adminRole.id,
        userType: UserType.PLATFORM_STAFF,
        schoolId: null,
        mustChangePassword: true,
      },
    });

    return { created: true, steamxId: input.steamxId };
  }
}
