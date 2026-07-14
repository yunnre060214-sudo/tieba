import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config';
import type { Forum } from '../src/domain';
import { runSignIn, type RunnerRuntime } from '../src/signin';
import { TiebaError, type TiebaPort, type TiebaSignResult } from '../src/tieba';

type ScriptStep = 'success' | 'already' | 'transient' | 'captcha' | 'too_fast';

class ScriptedTieba implements TiebaPort {
  readonly calls = { login: 0, listForums: 0, getTbs: 0, signForum: 0 };
  active = 0;
  maxActive = 0;

  constructor(
    private readonly forums: Forum[],
    private readonly scripts: Record<string, ScriptStep[]> = {},
    private readonly loginFailure?: TiebaError,
  ) {}

  async login(): Promise<void> {
    this.calls.login += 1;
    if (this.loginFailure) throw this.loginFailure;
  }

  async listForums(): Promise<Forum[]> {
    this.calls.listForums += 1;
    return this.forums;
  }

  async getTbs(): Promise<string> {
    this.calls.getTbs += 1;
    return 'tbs';
  }

  async signForum(forum: Forum): Promise<TiebaSignResult> {
    this.calls.signForum += 1;
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    await new Promise<void>(resolve => setImmediate(resolve));
    this.active -= 1;

    const step = this.scripts[forum.name]?.shift() ?? 'success';
    if (step === 'transient') throw new TiebaError('transient', '网络繁忙');
    if (step === 'captcha') return { kind: 'permanent_failure', reason: '签到需要验证码' };
    if (step === 'too_fast') return { kind: 'retryable_failure', reason: '签到过快' };
    if (step === 'already') return { kind: 'already_signed' };
    return { kind: 'signed', rank: 8, consecutiveDays: 6 };
  }
}

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    bduss: 'bduss',
    batchSize: 5,
    batchIntervalMs: 1500,
    maxRetries: 3,
    retryBaseDelayMs: 3000,
    requestTimeoutMs: 10000,
    ...overrides,
  };
}

function runtime(): RunnerRuntime & { delays: number[] } {
  const delays: number[] = [];
  const times = [new Date('2026-07-14T00:00:00Z'), new Date('2026-07-14T00:00:01Z')];
  return {
    delays,
    now: () => times.shift() ?? new Date('2026-07-14T00:00:01Z'),
    sleep: async milliseconds => { delays.push(milliseconds); },
    jitter: () => 0,
  };
}

describe('runSignIn', () => {
  it('keeps one final result after a transient failure then success', async () => {
    const tieba = new ScriptedTieba(
      [{ name: '测试吧', isSigned: false }],
      { 测试吧: ['transient', 'success'] },
    );

    const report = await runSignIn(config(), tieba, runtime());

    expect(report.status).toBe('success');
    expect(report.forums).toEqual([
      expect.objectContaining({ name: '测试吧', outcome: 'signed', attempts: 2 }),
    ]);
    expect(report.counts).toEqual({ total: 1, signed: 1, alreadySigned: 0, failed: 0 });
  });

  it('does not retry a permanent business failure', async () => {
    const tieba = new ScriptedTieba(
      [{ name: '测试吧', isSigned: false }],
      { 测试吧: ['captcha'] },
    );

    const report = await runSignIn(config(), tieba, runtime());

    expect(report.status).toBe('partial_failure');
    expect(report.forums[0]).toMatchObject({ outcome: 'failed', attempts: 1, reason: '签到需要验证码' });
    expect(tieba.calls.signForum).toBe(1);
  });

  it('stops after an authentication failure', async () => {
    const tieba = new ScriptedTieba([], {}, new TiebaError('auth', 'BDUSS 已失效'));

    const report = await runSignIn(config(), tieba, runtime());

    expect(report.status).toBe('fatal_failure');
    expect(report.fatalReason).toBe('BDUSS 已失效');
    expect(tieba.calls.listForums).toBe(0);
    expect(tieba.calls.signForum).toBe(0);
  });

  it('treats an empty forum list as success without requesting TBS', async () => {
    const tieba = new ScriptedTieba([]);

    const report = await runSignIn(config(), tieba, runtime());

    expect(report.status).toBe('success');
    expect(report.counts).toEqual({ total: 0, signed: 0, alreadySigned: 0, failed: 0 });
    expect(tieba.calls.getTbs).toBe(0);
  });

  it('does not call the sign endpoint for already-signed forums', async () => {
    const tieba = new ScriptedTieba([{ name: '已签吧', isSigned: true }]);

    const report = await runSignIn(config(), tieba, runtime());

    expect(report.forums).toEqual([{ name: '已签吧', outcome: 'already_signed', attempts: 0 }]);
    expect(tieba.calls.getTbs).toBe(0);
    expect(tieba.calls.signForum).toBe(0);
  });

  it('stops after the configured number of extra attempts', async () => {
    const tieba = new ScriptedTieba(
      [{ name: '繁忙吧', isSigned: false }],
      { 繁忙吧: ['transient', 'too_fast', 'transient', 'success'] },
    );

    const report = await runSignIn(config({ maxRetries: 2 }), tieba, runtime());

    expect(report.status).toBe('partial_failure');
    expect(report.forums[0]).toMatchObject({ outcome: 'failed', attempts: 3 });
    expect(tieba.calls.signForum).toBe(3);
  });

  it('uses exponential retry delays capped at 30 seconds', async () => {
    const tieba = new ScriptedTieba(
      [{ name: '繁忙吧', isSigned: false }],
      { 繁忙吧: ['transient', 'transient', 'transient', 'success'] },
    );
    const testRuntime = runtime();

    await runSignIn(config({ retryBaseDelayMs: 20000 }), tieba, testRuntime);

    expect(testRuntime.delays).toEqual([20000, 30000, 30000]);
  });

  it('never exceeds the configured batch concurrency', async () => {
    const tieba = new ScriptedTieba([
      { name: '一吧', isSigned: false },
      { name: '二吧', isSigned: false },
      { name: '三吧', isSigned: false },
      { name: '四吧', isSigned: false },
    ]);
    const testRuntime = runtime();

    const report = await runSignIn(config({ batchSize: 2, batchIntervalMs: 700 }), tieba, testRuntime);

    expect(report.status).toBe('success');
    expect(tieba.maxActive).toBe(2);
    expect(testRuntime.delays).toEqual([700]);
  });
});
