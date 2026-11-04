import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from './account.service';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialService } from '../auth/credential.service';
import { ScopeService } from '../common/scope/scope.service';
import { ScopeContext, UserRole } from '../common/scope/scope.types';

describe('Account Keyset Pagination & Shared Timestamp Tiebreaker (M5.2)', () => {
  let service: AccountService;
  let mockPrisma: any;

  const superAdminScope: ScopeContext = {
    userId: 'admin-1',
    role: UserRole.super_admin,
  };

  beforeEach(async () => {
    mockPrisma = {
      profile: {
        findMany: jest.fn(),
      },
      team: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: CredentialService,
          useValue: {},
        },
        {
          provide: ScopeService,
          useValue: new ScopeService(),
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  it('pages through 250 bulk-created accounts sharing an identical createdAt timestamp with limit 100, verifying every id appears exactly once', async () => {
    // 1. Create 250 accounts sharing the exact same timestamp (as generated during M5.2 bulk account creation)
    const sharedCreatedAt = new Date('2026-11-01T08:00:00.000Z');
    const totalRows = 250;
    const all250Accounts = Array.from({ length: totalRows }, (_, i) => {
      const pad = String(i + 1).padStart(3, '0');
      return {
        id: `user-${pad}`,
        userCode: `GRS${pad}`,
        fullName: `Bulk User ${pad}`,
        role: UserRole.team_member,
        phoneE164: null,
        preferredLanguage: 'si',
        teamId: 'team-1',
        gnId: 'gn-1',
        isActive: true,
        createdAt: sharedCreatedAt,
      };
    });

    // 2. Mock Prisma findMany to simulate real keyset pagination ordering by createdAt DESC, id ASC
    mockPrisma.profile.findMany.mockImplementation((args: any) => {
      // Verify tiebreaker is enforced in query args
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);

      let startIndex = 0;
      if (args.cursor) {
        const cursorIndex = all250Accounts.findIndex(
          (u) => u.id === args.cursor.id,
        );
        expect(cursorIndex).toBeGreaterThanOrEqual(0);
        startIndex = cursorIndex + (args.skip ?? 0);
      }

      return Promise.resolve(
        all250Accounts.slice(startIndex, startIndex + args.take),
      );
    });

    // 3. Paginate through all records using limit 100
    const collectedIds: string[] = [];
    let currentCursor: string | undefined = undefined;
    let pageCount = 0;

    do {
      pageCount++;
      const res = await service.findAccounts(superAdminScope, {
        take: 100,
        cursor: currentCursor,
      });

      for (const item of res.items) {
        collectedIds.push(item.id);
      }

      currentCursor = res.nextCursor;
    } while (currentCursor);

    // 4. Assert pagination mechanics and integrity
    // Page 1: 100 rows, nextCursor is user-100 (item at index 99)
    // Page 2: 100 rows, nextCursor is user-200 (item at index 199)
    // Page 3: 50 rows, nextCursor is undefined
    expect(pageCount).toBe(3);
    expect(collectedIds.length).toBe(250);

    // 5. Verify every id appears EXACTLY ONCE (no skipped rows at boundaries, no duplicate rows)
    const uniqueIds = new Set(collectedIds);
    expect(uniqueIds.size).toBe(250);

    for (let i = 1; i <= 250; i++) {
      const expectedId = `user-${String(i).padStart(3, '0')}`;
      expect(uniqueIds.has(expectedId)).toBe(true);
    }

    // Explicitly verify boundary items at positions 100, 101, 200, 201
    expect(collectedIds[99]).toBe('user-100');
    expect(collectedIds[100]).toBe('user-101');
    expect(collectedIds[199]).toBe('user-200');
    expect(collectedIds[200]).toBe('user-201');
  });
});
