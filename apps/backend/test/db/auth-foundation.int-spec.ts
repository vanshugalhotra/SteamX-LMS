import { readFile, readdir } from 'node:fs/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, UserType } from '../../src/generated/prisma/client.js';
import { AppModule } from '../../src/app.module.js';
import { FirstAdminService } from '../../src/auth/services/first-admin.service.js';
import { PasswordService } from '../../src/auth/services/password.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestUser } from '../factories/fixtures.js';
import { withRollback } from '../setup/with-rollback.js';

const ADMIN_INPUT = {
  steamxId: '  adm123 ',
  password: 'very strong phrase 24',
  name: '  First Admin  ',
};
const REFERENCE_MIGRATION_SUFFIX = '_reference_data';

type ReferenceDataSnapshot = {
  roles: Array<{ key: string; userType: UserType }>;
  permissions: string[];
  rolePermissions: Array<{ role: string; permission: string }>;
  migrations: string[];
};

describe('Authentication foundation reference data', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let firstAdmin: FirstAdminService;
  let passwords: PasswordService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    firstAdmin = app.get(FirstAdminService);
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function snapshotReferenceData(
    database: Prisma.TransactionClient | PrismaService,
  ): Promise<ReferenceDataSnapshot> {
    const [roles, permissions, rolePermissions, migrations] = await Promise.all([
      database.role.findMany({
        orderBy: { key: 'asc' },
        select: { key: true, userType: true },
      }),
      database.permission.findMany({
        orderBy: { key: 'asc' },
        select: { key: true },
      }),
      database.rolePermission.findMany({
        orderBy: [{ role: { key: 'asc' } }, { permission: { key: 'asc' } }],
        select: { role: { select: { key: true } }, permission: { select: { key: true } } },
      }),
      database.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ORDER BY migration_name
      `,
    ]);

    return {
      roles,
      permissions: permissions.map(({ key }) => key),
      rolePermissions: rolePermissions.map(({ role, permission }) => ({
        role: role.key,
        permission: permission.key,
      })),
      migrations: migrations.map(({ migration_name }) => migration_name),
    };
  }

  it('seeds permissions for Admin only', async () => {
    const snapshot = await snapshotReferenceData(prisma);

    expect(snapshot.roles).toEqual([
      { key: 'admin', userType: UserType.PLATFORM_STAFF },
      { key: 'student', userType: UserType.STUDENT },
      { key: 'teacher', userType: UserType.SCHOOL_STAFF },
    ]);
    expect(snapshot.permissions).toEqual([
      'classsection.manage',
      'classsection.read',
      'school.manage',
      'school.read',
      'user.create.student',
      'user.create.teacher',
      'user.deactivate',
      'user.password.reset',
      'user.read',
      'user.steamx-id.update',
      'user.update',
    ]);
    expect(snapshot.rolePermissions).toEqual([
      { role: 'admin', permission: 'classsection.manage' },
      { role: 'admin', permission: 'classsection.read' },
      { role: 'admin', permission: 'school.manage' },
      { role: 'admin', permission: 'school.read' },
      { role: 'admin', permission: 'user.create.student' },
      { role: 'admin', permission: 'user.create.teacher' },
      { role: 'admin', permission: 'user.deactivate' },
      { role: 'admin', permission: 'user.password.reset' },
      { role: 'admin', permission: 'user.read' },
      { role: 'admin', permission: 'user.steamx-id.update' },
      { role: 'admin', permission: 'user.update' },
    ]);
  });

  it('replays the reference migration idempotently without changing migration history', async () => {
    const before = await snapshotReferenceData(prisma);
    const migrationDirectories = await readdir(
      new URL('../../prisma/migrations/', import.meta.url),
      {
        withFileTypes: true,
      },
    );
    const migrationDirectory = migrationDirectories.find(
      (entry) => entry.isDirectory() && entry.name.endsWith(REFERENCE_MIGRATION_SUFFIX),
    );

    if (!migrationDirectory) {
      throw new Error('Reference-data migration directory was not found.');
    }

    const migrationSql = await readFile(
      new URL(`../../prisma/migrations/${migrationDirectory.name}/migration.sql`, import.meta.url),
      'utf8',
    );
    const statements = migrationSql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    await withRollback(prisma, async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }

      expect(await snapshotReferenceData(tx)).toEqual(before);
    });

    expect(await snapshotReferenceData(prisma)).toEqual(before);
  });

  it('creates one normalized first Admin, returns existing on repeat, and rolls cleanup back', async () => {
    const before = await snapshotReferenceData(prisma);

    await withRollback(prisma, async (tx) => {
      const created = await firstAdmin.create(ADMIN_INPUT, tx);
      const repeated = await firstAdmin.create(
        {
          steamxId: 'OTHER123',
          password: 'another strong phrase 25',
        },
        tx,
      );
      const user = await tx.user.findUniqueOrThrow({
        where: { steamxId: 'ADM123' },
        include: { role: true },
      });

      expect(created).toEqual({ created: true, steamxId: 'ADM123' });
      expect(repeated).toEqual({ created: false, steamxId: 'ADM123' });
      expect(user).toMatchObject({
        steamxId: 'ADM123',
        name: 'First Admin',
        userType: UserType.PLATFORM_STAFF,
        schoolId: null,
        mustChangePassword: true,
        role: { key: 'admin' },
      });
      expect(await passwords.verify(user.passwordHash, ADMIN_INPUT.password)).toBe(true);
    });

    expect(await snapshotReferenceData(prisma)).toEqual(before);
    await expect(prisma.user.findUnique({ where: { steamxId: 'ADM123' } })).resolves.toBeNull();
  });

  it('rejects first-Admin creation when the password violates policy', async () => {
    await expect(
      firstAdmin.create({
        steamxId: 'ADM123',
        password: 'admin123',
      }),
    ).rejects.toThrow('Password is too common.');
  });

  it('reports when the requested SteamX ID is already used by a non-admin', async () => {
    await withRollback(prisma, async (tx) => {
      await createTestUser(tx, {
        steamxId: 'ADM123',
        name: 'Existing Teacher',
        passwordHash: 'test-only-password-hash',
        userType: UserType.SCHOOL_STAFF,
      });

      await expect(firstAdmin.create(ADMIN_INPUT, tx)).rejects.toThrow(
        'ADMIN_STEAMX_ID is already in use by another account.',
      );
    });
  });

  it('reports a serialization conflict as another process creating the Admin', async () => {
    const transaction = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );

    try {
      await expect(firstAdmin.create(ADMIN_INPUT)).rejects.toThrow(
        'Another process may be creating the admin. Re-run the command to check.',
      );
    } finally {
      transaction.mockRestore();
    }
  });
});
