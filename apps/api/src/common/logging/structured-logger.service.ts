import { Injectable, LoggerService } from '@nestjs/common';
import { PiiScrubber } from './pii-scrubber';

export interface StructuredLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'verbose';
  context?: string;
  message: string;
  data?: any;
  traceId?: string;
  userId?: string;
  error?: string;
  stack?: string;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private logSink: (entry: StructuredLogEntry) => void = (entry) => {
    // Outputs single-line NDJSON to stdout/stderr
    const line = JSON.stringify(entry);
    if (entry.level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  };

  /**
   * Overrides log sink for testing assertions or capturing logs.
   */
  setSink(sink: (entry: StructuredLogEntry) => void) {
    this.logSink = sink;
  }

  private createEntry(
    level: StructuredLogEntry['level'],
    message: any,
    context?: string,
    data?: any,
  ): StructuredLogEntry {
    const scrubbedMessage = typeof message === 'string'
      ? PiiScrubber.scrubString(message)
      : PiiScrubber.scrub(message);

    const scrubbedData = data ? PiiScrubber.scrub(data) : undefined;

    return {
      timestamp: new Date().toISOString(),
      level,
      context,
      message: typeof scrubbedMessage === 'string' ? scrubbedMessage : JSON.stringify(scrubbedMessage),
      data: scrubbedData,
    };
  }

  log(message: any, context?: string, data?: any) {
    const entry = this.createEntry('info', message, context, data);
    this.logSink(entry);
  }

  error(message: any, trace?: string, context?: string, data?: any) {
    const entry = this.createEntry('error', message, context, data);
    if (trace) {
      entry.stack = PiiScrubber.scrubString(trace);
    }
    this.logSink(entry);
  }

  warn(message: any, context?: string, data?: any) {
    const entry = this.createEntry('warn', message, context, data);
    this.logSink(entry);
  }

  debug(message: any, context?: string, data?: any) {
    const entry = this.createEntry('debug', message, context, data);
    this.logSink(entry);
  }

  verbose(message: any, context?: string, data?: any) {
    const entry = this.createEntry('verbose', message, context, data);
    this.logSink(entry);
  }
}
