import { normalizeRuntimeDatabaseUrl } from './prisma.service';

describe('normalizeRuntimeDatabaseUrl (Supabase Pooler & Serverless Safety)', () => {
  const originalAllowSession = process.env.PRISMA_ALLOW_SESSION_POOLER;

  afterEach(() => {
    if (originalAllowSession === undefined) {
      delete process.env.PRISMA_ALLOW_SESSION_POOLER;
    } else {
      process.env.PRISMA_ALLOW_SESSION_POOLER = originalAllowSession;
    }
  });

  it('switches Supabase Supavisor Session pooler (port 5432) to Transaction mode (port 6543 + pgbouncer=true + connection_limit=1)', () => {
    const input =
      'postgresql://postgres.projref:p%40ss%2B1@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?connection_limit=5&pool_timeout=60';
    const out = normalizeRuntimeDatabaseUrl(input, false);
    expect(out).toBeDefined();
    const parsed = new URL(out!);
    expect(parsed.port).toBe('6543');
    expect(parsed.searchParams.get('pgbouncer')).toBe('true');
    expect(parsed.searchParams.get('connection_limit')).toBe('1');
    expect(parsed.searchParams.get('pool_timeout')).toBe('60');
    expect(parsed.password).toBe('p%40ss%2B1');
  });

  it('adds pgbouncer=true and connection_limit=1 when Supabase port 6543 is configured without query params', () => {
    const input =
      'postgresql://postgres.projref:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
    const out = normalizeRuntimeDatabaseUrl(input, true);
    const parsed = new URL(out!);
    expect(parsed.port).toBe('6543');
    expect(parsed.searchParams.get('pgbouncer')).toBe('true');
    expect(parsed.searchParams.get('connection_limit')).toBe('1');
    expect(parsed.searchParams.get('pool_timeout')).toBe('60');
  });

  it('forces connection_limit=1 on serverless even when a custom host includes connection_limit=5', () => {
    const input =
      'postgresql://user:pass@custom-pg.example.com:5432/db?connection_limit=5';
    const out = normalizeRuntimeDatabaseUrl(input, true);
    const parsed = new URL(out!);
    expect(parsed.port).toBe('5432');
    expect(parsed.searchParams.get('connection_limit')).toBe('1');
  });

  it('preserves explicit session pooler opt-out when PRISMA_ALLOW_SESSION_POOLER=true', () => {
    process.env.PRISMA_ALLOW_SESSION_POOLER = 'true';
    const input =
      'postgresql://postgres.projref:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';
    const out = normalizeRuntimeDatabaseUrl(input, false);
    const parsed = new URL(out!);
    expect(parsed.port).toBe('5432');
    expect(parsed.searchParams.get('connection_limit')).toBe('1');
  });

  it('preserves localhost ports and explicit connection_limit when not serverless', () => {
    const input =
      'postgresql://postgres@127.0.0.1:55432/grs_test?connection_limit=10';
    const out = normalizeRuntimeDatabaseUrl(input, false);
    const parsed = new URL(out!);
    expect(parsed.port).toBe('55432');
    expect(parsed.searchParams.get('pgbouncer')).toBeNull();
    expect(parsed.searchParams.get('connection_limit')).toBe('10');
  });
});
