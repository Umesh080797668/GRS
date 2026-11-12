import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { ExportJobService } from './export-job.service';

/**
 * Standalone long-running export worker per Spike S7.
 * Claims queued export jobs, streams Excel/CSV rows using keyset cursors into temp files,
 * and uploads them to private Supabase Storage without holding HTTP connections open.
 *
 * Usage:
 *   node dist/jobs/export-worker.js [--job-id=<uuid>] [--max-jobs=<n>]
 */
async function main() {
  const logger = new Logger('ExportWorker');
  const args = process.argv.slice(2);
  const jobIdArg = args
    .find((a) => a.startsWith('--job-id='))
    ?.split('=')[1]
    ?.trim();
  const maxJobsArg = Number(
    args.find((a) => a.startsWith('--max-jobs='))?.split('=')[1] || 20,
  );
  const maxJobs =
    Number.isFinite(maxJobsArg) && maxJobsArg > 0 ? Math.floor(maxJobsArg) : 20;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const exportJobService = app.get(ExportJobService);
    let processed = 0;

    if (jobIdArg) {
      const ok = await exportJobService.claimAndProcessNextJob(jobIdArg);
      processed = ok ? 1 : 0;
    } else {
      while (processed < maxJobs) {
        const claimed = await exportJobService.claimAndProcessNextJob();
        if (!claimed) break;
        processed += 1;
      }
    }

    logger.log(`ExportWorker completed: processedJobs=${processed}`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ExportWorker failed:', err);
    process.exit(1);
  });
}

