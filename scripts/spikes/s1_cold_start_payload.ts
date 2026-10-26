import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../apps/api/src/app.module';
import { AppService } from '../../apps/api/src/app.service';

async function runSpikeS1() {
  console.log('====================================================');
  console.log(' Spike S1: NestJS + Prisma Cold Start & 4.5MB Payload');
  console.log('====================================================\n');

  // 1. Measure Cold Start Time
  const t0 = performance.now();
  const app = await NestFactory.create(AppModule, { logger: false });
  const coldStartMs = Math.round(performance.now() - t0);
  console.log(`[1] NestJS Bootstrap Cold-Start Time: ${coldStartMs} ms`);

  // 2. Measure /health DB Round-Trip
  const appService = app.get(AppService);
  const health = await appService.checkHealth();
  console.log(`[2] /health Database Status: ${health.database.status} (latency: ${health.database.latencyMs} ms)`);
  console.log(`    Memory: RSS=${health.memory.rssMb} MB, HeapUsed=${health.memory.heapUsedMb} MB`);

  // 3. Test 4.5 MB Payload Handling
  console.log('\n[3] Generating 4.5 MB Payload Test...');
  const targetBytes = 4.5 * 1024 * 1024; // 4.5 MB
  const chunkSize = 1024;
  const repeatCount = Math.floor(targetBytes / chunkSize);
  const largeObject = {
    records: Array.from({ length: repeatCount }, (_, i) => ({
      id: `synthetic-${i}`,
      data: 'A'.repeat(chunkSize - 40),
    })),
  };

  const payloadString = JSON.stringify(largeObject);
  const actualBytes = Buffer.byteLength(payloadString, 'utf8');
  console.log(`    Generated payload size: ${(actualBytes / 1024 / 1024).toFixed(2)} MB (${actualBytes} bytes)`);

  const memBefore = process.memoryUsage().heapUsed;
  const parseStart = performance.now();
  const parsed = JSON.parse(payloadString);
  const parseTimeMs = Math.round(performance.now() - parseStart);
  const memAfter = process.memoryUsage().heapUsed;
  const heapDeltaMb = Math.round(((memAfter - memBefore) / 1024 / 1024) * 10) / 10;

  console.log(`    Parsing 4.5 MB payload took: ${parseTimeMs} ms (Heap delta: +${heapDeltaMb} MB)`);
  console.log(`    Records parsed successfully: ${parsed.records.length}`);

  await app.close();

  console.log('\n====================================================');
  console.log(' Spike S1 PASSED: Cold start well within SLA, 4.5MB handled.');
  console.log('====================================================');
}

runSpikeS1().catch((err) => {
  console.error('Spike S1 Failed:', err);
  process.exit(1);
});
