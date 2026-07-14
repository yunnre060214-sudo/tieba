import { loadConfig, type AppConfig, type MailConfig } from './config';
import type { RunReport } from './domain';
import { QqEmailNotifier, type EmailPort } from './email';
import { renderConsoleReport, renderEmailReport } from './report';
import { runSignIn, type RunnerRuntime } from './signin';
import { AxiosTiebaClient, type TiebaPort } from './tieba';

export interface AppLogger {
  log(message: string): void;
  error(message: string): void;
}

export interface AppDependencies {
  createTieba(config: AppConfig): TiebaPort;
  createEmail(config: MailConfig): EmailPort;
  logger: AppLogger;
  runnerRuntime?: RunnerRuntime;
  now?: () => Date;
}

function fatalReport(reason: string, now: () => Date): RunReport {
  const startedAt = now();
  const finishedAt = now();
  return {
    status: 'fatal_failure',
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    forums: [],
    counts: { total: 0, signed: 0, alreadySigned: 0, failed: 0 },
    fatalReason: reason,
  };
}

export function createProductionDependencies(): AppDependencies {
  return {
    createTieba: config => new AxiosTiebaClient(config.bduss, config.requestTimeoutMs),
    createEmail: config => new QqEmailNotifier(config),
    logger: console,
  };
}

export async function runApp(
  env: NodeJS.ProcessEnv,
  dependencies: AppDependencies,
): Promise<0 | 1> {
  const loaded = loadConfig(env);
  const now = dependencies.now ?? (() => new Date());

  let report: RunReport;
  if (loaded.errors.length > 0 || !loaded.app || !loaded.mail) {
    report = fatalReport(loaded.errors.join('；') || '应用配置无效', now);
  } else {
    try {
      const tieba = dependencies.createTieba(loaded.app);
      report = await runSignIn(loaded.app, tieba, dependencies.runnerRuntime);
    } catch {
      report = fatalReport('应用初始化失败', now);
    }
  }

  dependencies.logger.log(renderConsoleReport(report));

  if (!loaded.mail) {
    dependencies.logger.error('QQ 邮件配置无效，无法发送结果邮件');
    return 1;
  }

  try {
    const email = dependencies.createEmail(loaded.mail);
    await email.send(renderEmailReport(report));
  } catch {
    dependencies.logger.error('QQ 邮件发送失败');
    return 1;
  }

  return report.status === 'success' ? 0 : 1;
}
