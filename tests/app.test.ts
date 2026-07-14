import { describe, expect, it } from 'vitest';
import type { AppConfig, MailConfig } from '../src/config';
import type { EmailMessage, Forum, RunStatus } from '../src/domain';
import { runApp, type AppDependencies } from '../src/app';
import type { EmailPort } from '../src/email';
import { TiebaError, type TiebaPort, type TiebaSignResult } from '../src/tieba';

const validEnv = {
  BDUSS: 'bduss-value',
  MAIL_USERNAME: 'sender@qq.com',
  MAIL_PASSWORD: 'smtp-code',
  MAIL_TO: 'receiver@example.com',
};

class RecordingEmail implements EmailPort {
  readonly messages: EmailMessage[] = [];

  constructor(private readonly reject = false) {}

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
    if (this.reject) throw new Error('SMTP failed');
  }
}

function tiebaFor(status: RunStatus): TiebaPort {
  const forums: Forum[] = status === 'partial_failure'
    ? [{ name: '失败吧', isSigned: false }]
    : [];
  return {
    async login() {
      if (status === 'fatal_failure') throw new TiebaError('auth', 'BDUSS 已失效');
    },
    async listForums() { return forums; },
    async getTbs() { return 'tbs'; },
    async signForum(): Promise<TiebaSignResult> {
      return { kind: 'permanent_failure', reason: '签到需要验证码' };
    },
  };
}

function dependencies(
  status: RunStatus,
  email: RecordingEmail,
  counters = { tiebaFactories: 0, emailFactories: 0 },
): AppDependencies {
  return {
    createTieba(_config: AppConfig) {
      counters.tiebaFactories += 1;
      return tiebaFor(status);
    },
    createEmail(_config: MailConfig) {
      counters.emailFactories += 1;
      return email;
    },
    logger: { log() {}, error() {} },
    runnerRuntime: {
      now: () => new Date('2026-07-14T00:00:00Z'),
      sleep: async () => {},
      jitter: () => 0,
    },
    now: () => new Date('2026-07-14T00:00:00Z'),
  };
}

describe('runApp', () => {
  it.each([
    ['success', false, 0],
    ['partial_failure', false, 1],
    ['fatal_failure', false, 1],
    ['success', true, 1],
  ] as const)('maps %s with mailFailure=%s to exit %s', async (status, mailFailure, expected) => {
    const email = new RecordingEmail(mailFailure);

    const exitCode = await runApp(validEnv, dependencies(status, email));

    expect(email.messages).toHaveLength(1);
    expect(exitCode).toBe(expected);
  });

  it('emails a fatal configuration report when BDUSS is missing', async () => {
    const email = new RecordingEmail();
    const counters = { tiebaFactories: 0, emailFactories: 0 };
    const { BDUSS: _, ...withoutBduss } = validEnv;

    const exitCode = await runApp(withoutBduss, dependencies('success', email, counters));

    expect(exitCode).toBe(1);
    expect(counters.tiebaFactories).toBe(0);
    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]?.subject).toContain('执行失败');
    expect(email.messages[0]?.body).toContain('BDUSS is required');
  });

  it('does not access Tieba or email when mail configuration is invalid', async () => {
    const email = new RecordingEmail();
    const counters = { tiebaFactories: 0, emailFactories: 0 };
    const errors: string[] = [];
    const deps = dependencies('success', email, counters);
    deps.logger = { log() {}, error(message) { errors.push(message); } };

    const exitCode = await runApp({ BDUSS: 'secret-bduss' }, deps);

    expect(exitCode).toBe(1);
    expect(counters.tiebaFactories).toBe(0);
    expect(counters.emailFactories).toBe(0);
    expect(errors.join('\n')).not.toContain('secret-bduss');
  });
});
