import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController (Spike S1 / Health & Payload)', () => {
  let appController: AppController;

  const mockPrisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return app identity', () => {
      expect(appController.getHello()).toContain(
        'Global Research & Survey API',
      );
    });
  });

  describe('/health (Spike S1)', () => {
    it('returns ok status and DB round-trip latency', async () => {
      const health = await appController.getHealth();
      expect(health.status).toBe('ok');
      expect(health.database.status).toBe('up');
      expect(health.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.memory.heapUsedMb).toBeGreaterThan(0);
    });
  });

  describe('/v1/test/payload (Spike S1)', () => {
    it('accepts and measures large payload byte size', () => {
      const payload = { data: 'x'.repeat(10000) };
      const res = appController.testPayload(payload);
      expect(res.status).toBe('accepted');
      expect(res.receivedBytes).toBeGreaterThanOrEqual(10000);
    });
  });
});
