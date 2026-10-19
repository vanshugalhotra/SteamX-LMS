import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersRepository } from './users.repository.js';

describe('UsersRepository', () => {
  it('rejects a profile update when the requested profile row does not exist', async () => {
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: {
          findFirst: vi.fn().mockResolvedValue({ id: 'user-id' }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        studentProfile: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      }),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersRepository,
        { provide: PrismaService, useValue: { $transaction: transaction } },
      ],
    }).compile();
    const repository = moduleRef.get(UsersRepository);

    await expect(
      repository.update('user-id', { id: 'user-id' }, { name: 'Updated name' }, 'school-id', {
        student: { guardianName: 'Guardian' },
      }),
    ).rejects.toThrow('Expected student profile update to affect one row');
    await moduleRef.close();
  });
});
