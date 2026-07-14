import { describe, expect, it } from 'vitest';
import type { RunReport } from '../src/domain';
import { renderConsoleReport, renderEmailReport } from '../src/report';

function partialFailureReport(): RunReport {
  return {
    status: 'partial_failure',
    startedAt: new Date('2026-07-14T00:00:00Z'),
    finishedAt: new Date('2026-07-14T00:00:02Z'),
    durationMs: 2000,
    forums: [
      { name: '成功贴吧', outcome: 'signed', attempts: 1 },
      { name: '测试贴吧', outcome: 'failed', attempts: 4, reason: '签到需要验证码' },
    ],
    counts: { total: 2, signed: 1, alreadySigned: 0, failed: 1 },
  };
}

describe('report rendering', () => {
  it('masks forum names in console but shows failed names in email', () => {
    const report = partialFailureReport();

    const consoleText = renderConsoleReport(report);
    const email = renderEmailReport(report);

    expect(consoleText).not.toContain('测试贴吧');
    expect(consoleText).toContain('测**吧');
    expect(email.body).toContain('测试贴吧');
  });

  it('renders accurate status, counts, time, and duration', () => {
    const email = renderEmailReport(partialFailureReport());

    expect(email.subject).toContain('部分失败');
    expect(email.body).toContain('北京时间：2026/07/14 08:00:02');
    expect(email.body).toContain('总计：2');
    expect(email.body).toContain('失败：1');
    expect(email.body).toContain('执行耗时：2.00 秒');
  });

  it('renders a fatal reason without serializing unrelated data', () => {
    const report: RunReport = {
      status: 'fatal_failure',
      startedAt: new Date('2026-07-14T00:00:00Z'),
      finishedAt: new Date('2026-07-14T00:00:01Z'),
      durationMs: 1000,
      forums: [],
      counts: { total: 0, signed: 0, alreadySigned: 0, failed: 0 },
      fatalReason: 'BDUSS 已失效',
    };

    const email = renderEmailReport(report);

    expect(email.subject).toContain('执行失败');
    expect(email.body).toContain('BDUSS 已失效');
    expect(email.body).not.toContain('undefined');
  });
});
