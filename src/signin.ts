import type { AppConfig } from './config';
import type { Forum, ForumResult, RunCounts, RunReport } from './domain';
import { TiebaError, type TiebaPort, type TiebaSignResult } from './tieba';

export interface RunnerRuntime {
  now(): Date;
  sleep(milliseconds: number): Promise<void>;
  jitter(): number;
}

const defaultRuntime: RunnerRuntime = {
  now: () => new Date(),
  sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  jitter: () => Math.floor(Math.random() * 251),
};

function retryDelay(config: AppConfig, failedAttempt: number, runtime: RunnerRuntime): number {
  return Math.min(config.retryBaseDelayMs * 2 ** (failedAttempt - 1) + runtime.jitter(), 30000);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof TiebaError ? error.message : '发生未知错误';
}

async function runSetupStep<T>(
  operation: () => Promise<T>,
  config: AppConfig,
  runtime: RunnerRuntime,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const canRetry = error instanceof TiebaError
        && error.kind === 'transient'
        && attempt <= config.maxRetries;
      if (!canRetry) {
        throw error;
      }
      await runtime.sleep(retryDelay(config, attempt, runtime));
    }
  }
}

function failedResult(forum: Forum, attempts: number, reason: string): ForumResult {
  return { name: forum.name, outcome: 'failed', attempts, reason };
}

async function signOneForum(
  forum: Forum,
  tbs: string,
  config: AppConfig,
  tieba: TiebaPort,
  runtime: RunnerRuntime,
): Promise<ForumResult> {
  for (let attempt = 1; ; attempt += 1) {
    let result: TiebaSignResult;
    try {
      result = await tieba.signForum(forum, tbs);
    } catch (error) {
      if (error instanceof TiebaError && error.kind === 'auth') {
        throw error;
      }
      const canRetry = error instanceof TiebaError
        && error.kind === 'transient'
        && attempt <= config.maxRetries;
      if (!canRetry) {
        return failedResult(forum, attempt, safeErrorMessage(error));
      }
      await runtime.sleep(retryDelay(config, attempt, runtime));
      continue;
    }

    if (result.kind === 'signed') {
      return {
        name: forum.name,
        outcome: 'signed',
        attempts: attempt,
        rank: result.rank,
        consecutiveDays: result.consecutiveDays,
      };
    }
    if (result.kind === 'already_signed') {
      return { name: forum.name, outcome: 'already_signed', attempts: attempt };
    }
    if (result.kind === 'permanent_failure') {
      return failedResult(forum, attempt, result.reason);
    }
    if (attempt > config.maxRetries) {
      return failedResult(forum, attempt, result.reason);
    }
    await runtime.sleep(retryDelay(config, attempt, runtime));
  }
}

function countResults(forums: ForumResult[]): RunCounts {
  return forums.reduce<RunCounts>((counts, forum) => {
    counts.total += 1;
    if (forum.outcome === 'signed') counts.signed += 1;
    if (forum.outcome === 'already_signed') counts.alreadySigned += 1;
    if (forum.outcome === 'failed') counts.failed += 1;
    return counts;
  }, { total: 0, signed: 0, alreadySigned: 0, failed: 0 });
}

function finishReport(
  startedAt: Date,
  runtime: RunnerRuntime,
  forums: ForumResult[],
  fatalReason?: string,
): RunReport {
  const finishedAt = runtime.now();
  const counts = countResults(forums);
  const status = fatalReason
    ? 'fatal_failure'
    : counts.failed > 0
      ? 'partial_failure'
      : 'success';

  return {
    status,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    forums,
    counts,
    ...(fatalReason ? { fatalReason } : {}),
  };
}

export async function runSignIn(
  config: AppConfig,
  tieba: TiebaPort,
  runtime: RunnerRuntime = defaultRuntime,
): Promise<RunReport> {
  const startedAt = runtime.now();
  const completed = new Map<string, ForumResult>();
  let forums: Forum[] = [];

  try {
    await runSetupStep(() => tieba.login(), config, runtime);
    forums = await runSetupStep(() => tieba.listForums(), config, runtime);

    for (const forum of forums) {
      if (forum.isSigned) {
        completed.set(forum.name, { name: forum.name, outcome: 'already_signed', attempts: 0 });
      }
    }

    const pending = forums.filter(forum => !forum.isSigned);
    if (pending.length > 0) {
      const tbs = await runSetupStep(() => tieba.getTbs(), config, runtime);
      for (let offset = 0; offset < pending.length; offset += config.batchSize) {
        const batch = pending.slice(offset, offset + config.batchSize);
        const results = await Promise.all(
          batch.map(forum => signOneForum(forum, tbs, config, tieba, runtime)),
        );
        for (const result of results) {
          completed.set(result.name, result);
        }
        if (offset + config.batchSize < pending.length) {
          await runtime.sleep(config.batchIntervalMs);
        }
      }
    }

    const orderedResults = forums.flatMap(forum => {
      const result = completed.get(forum.name);
      return result ? [result] : [];
    });
    return finishReport(startedAt, runtime, orderedResults);
  } catch (error) {
    const orderedResults = forums.flatMap(forum => {
      const result = completed.get(forum.name);
      return result ? [result] : [];
    });
    return finishReport(startedAt, runtime, orderedResults, safeErrorMessage(error));
  }
}
