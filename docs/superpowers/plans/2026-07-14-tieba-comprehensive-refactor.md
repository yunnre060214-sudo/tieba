# Tieba Comprehensive Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current coupled script with a tested single-account GitHub Actions sign-in application that sends an accurate QQ SMTP email on every run and fails the workflow whenever sign-in or email delivery fails.

**Architecture:** A small production entrypoint composes configuration, a Tieba adapter, the sign-in runner, report rendering, and a QQ SMTP adapter. The sign-in runner owns batching and retry behavior behind one interface; production uses Axios and Nodemailer adapters while tests use in-memory adapters.

**Tech Stack:** Node.js 22, TypeScript, Axios, Nodemailer, dotenv, Vitest, GitHub Actions.

## Global Constraints

- Support one BDUSS account only.
- Run automatically every day at UTC 00:00 / Asia/Shanghai 08:00 and allow manual dispatch.
- Send one QQ SMTP email for success, partial failure, or fatal failure.
- Exit successfully only when every forum is signed or already signed and the email was delivered.
- Use HTTPS for every Tieba endpoint and never log BDUSS or SMTP credentials.
- Keep local execution and diagnostics; automated tests must not use live credentials or external networks.
- Remove upstream sync, keep-alive commits, old notification channels, tracked `dist/`, and `js-backup/`.
- Do not add multi-account support, a web UI, storage, captcha solving, or anti-risk-control behavior.

---

## File Structure

- `src/config.ts`: parse and validate environment configuration once.
- `src/domain.ts`: shared run status, forum result, report, and error types.
- `src/tieba.ts`: Tieba interface plus Axios production adapter.
- `src/signin.ts`: batching, retry policy, and final report creation.
- `src/report.ts`: safe console output and plain-text email rendering.
- `src/email.ts`: email interface plus Nodemailer QQ SMTP adapter.
- `src/app.ts`: application orchestration and exit-code decision.
- `src/index.ts`: dotenv loading and production dependency composition only.
- `tests/*.test.ts`: interface-level tests with in-memory adapters.
- `.github/workflows/tieba-signin.yml`: the only remaining workflow.

### Task 1: Establish domain types, validated configuration, and toolchain

**Files:**
- Create: `src/domain.ts`
- Create: `src/config.ts`
- Create: `tests/config.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `loadConfig(env: NodeJS.ProcessEnv): ConfigLoadResult`
- Produces: `AppConfig`, `MailConfig`, `Forum`, `ForumResult`, `RunReport`, and `RunStatus`

- [ ] **Step 1: Replace package scripts and install exact dependencies**

Set scripts to:

```json
{
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "tsx src/index.ts",
  "check": "npm run typecheck && npm test && npm run build"
}
```

Set `engines.node` to `>=22`. Install production dependencies `axios`, `dotenv`, and `nodemailer`, and development dependencies `@types/node`, `@types/nodemailer`, `tsx`, `typescript`, and `vitest`, using exact versions and updating `package-lock.json`.

- [ ] **Step 2: Write failing configuration tests**

Create `tests/config.test.ts` with these assertions:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const validEnv = {
  BDUSS: 'bduss-value',
  MAIL_USERNAME: 'sender@qq.com',
  MAIL_PASSWORD: 'smtp-code',
  MAIL_TO: 'receiver@example.com',
};

describe('loadConfig', () => {
  it('applies bounded defaults', () => {
    const result = loadConfig(validEnv);
    expect(result.errors).toEqual([]);
    expect(result.app).toMatchObject({
      batchSize: 5,
      batchIntervalMs: 1500,
      maxRetries: 3,
      retryBaseDelayMs: 3000,
      requestTimeoutMs: 10000,
    });
    expect(result.mail?.host).toBe('smtp.qq.com');
    expect(result.mail?.port).toBe(465);
  });

  it('returns every validation error at once', () => {
    const result = loadConfig({ BATCH_SIZE: '0', MAX_RETRIES: 'six' });
    expect(result.app).toBeUndefined();
    expect(result.mail).toBeUndefined();
    expect(result.errors).toEqual(expect.arrayContaining([
      'BDUSS is required',
      'MAIL_USERNAME is required',
      'MAIL_PASSWORD is required',
      'MAIL_TO is required',
      'BATCH_SIZE must be an integer between 1 and 20',
      'MAX_RETRIES must be an integer between 0 and 5',
    ]));
  });

  it('keeps valid mail config when only app config is invalid', () => {
    const { BDUSS: _, ...withoutBduss } = validEnv;
    const result = loadConfig(withoutBduss);
    expect(result.app).toBeUndefined();
    expect(result.mail?.username).toBe('sender@qq.com');
  });
});
```

- [ ] **Step 3: Run the test and verify the red state**

Run: `npm test -- tests/config.test.ts`

Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 4: Implement domain and configuration types**

Create `src/domain.ts` with discriminated types for `success`, `partial_failure`, and `fatal_failure`; `ForumResult` must contain exactly one final result per forum and an `attempts` count. Create `src/config.ts` so `loadConfig` returns:

```ts
export interface ConfigLoadResult {
  app?: Readonly<AppConfig>;
  mail?: Readonly<MailConfig>;
  errors: string[];
}
```

Parse each optional integer once, enforce the exact ranges from the design, and never include secret values in error messages.

- [ ] **Step 5: Run configuration tests and the type checker**

Run: `npm test -- tests/config.test.ts && npm run typecheck`

Expected: all configuration tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the configuration slice**

```bash
git add package.json package-lock.json tsconfig.json .gitignore src/domain.ts src/config.ts tests/config.test.ts
git commit -m "refactor: add validated application configuration"
```

### Task 2: Build the HTTPS Tieba adapter and error classification

**Files:**
- Create: `src/tieba.ts`
- Create: `tests/tieba.test.ts`

**Interfaces:**
- Consumes: `Forum`, `AppConfig` from Task 1.
- Produces: `TiebaPort` with `login()`, `listForums()`, `getTbs()`, and `signForum()`.
- Produces: `TiebaError` with `kind: 'transient' | 'auth' | 'permanent'`.

- [ ] **Step 1: Write failing response and security tests**

Test an injected Axios-compatible transport instead of the network:

```ts
it('uses HTTPS for every endpoint and applies the configured timeout', async () => {
  const transport = createRecordingTransport(successResponses);
  const client = new AxiosTiebaClient('secret', 12345, transport);
  await client.login();
  await client.listForums();
  await client.getTbs();
  await client.signForum({ name: '测试吧', isSigned: false }, 'tbs');
  expect(transport.urls.every(url => url.startsWith('https://'))).toBe(true);
  expect(transport.timeouts).toEqual([12345, 12345, 12345, 12345]);
});

it.each([
  [429, 'transient'],
  [500, 'transient'],
  [401, 'auth'],
  [403, 'auth'],
])('classifies HTTP %s as %s', async (status, kind) => {
  const client = clientThatRejectsWithStatus(status);
  await expect(client.login()).rejects.toMatchObject({ kind });
});
```

Also assert that serialized errors do not contain the BDUSS value.

- [ ] **Step 2: Run the Tieba tests and verify failure**

Run: `npm test -- tests/tieba.test.ts`

Expected: FAIL because the adapter and its interfaces do not exist.

- [ ] **Step 3: Implement the Tieba port and Axios adapter**

Use only these endpoints:

```ts
const endpoints = {
  login: 'https://tieba.baidu.com/mo/q/sync',
  forums: 'https://tieba.baidu.com/mo/q/newmoindex',
  tbs: 'https://tieba.baidu.com/dc/common/tbs',
  sign: 'https://tieba.baidu.com/sign/add',
} as const;
```

Pass `timeout: requestTimeoutMs` on every request. Convert network errors, timeouts, 429, and 5xx to transient errors; convert 401/403 and invalid login responses to auth errors; convert malformed responses to permanent errors. Keep Cookie creation private and return normalized domain objects rather than raw Axios responses.

- [ ] **Step 4: Run adapter tests and type checking**

Run: `npm test -- tests/tieba.test.ts && npm run typecheck`

Expected: all Tieba adapter tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the Tieba adapter**

```bash
git add src/tieba.ts tests/tieba.test.ts
git commit -m "refactor: isolate secure tieba client"
```

### Task 3: Implement deterministic sign-in orchestration and reports

**Files:**
- Create: `src/signin.ts`
- Create: `src/report.ts`
- Create: `tests/signin.test.ts`
- Create: `tests/report.test.ts`

**Interfaces:**
- Consumes: `AppConfig`, `TiebaPort`, and domain types.
- Produces: `runSignIn(config, tieba, runtime?): Promise<RunReport>`.
- Produces: `renderConsoleReport(report)` and `renderEmailReport(report)`.

- [ ] **Step 1: Write failing runner tests with an in-memory adapter**

Cover the interface rather than internal helper functions:

```ts
it('returns one final result after a transient failure then success', async () => {
  const tieba = scriptedTieba({ 测试吧: ['transient', 'success'] });
  const report = await runSignIn(config({ maxRetries: 3 }), tieba, noWaitRuntime);
  expect(report.status).toBe('success');
  expect(report.forums).toEqual([
    expect.objectContaining({ name: '测试吧', outcome: 'signed', attempts: 2 }),
  ]);
});

it('does not retry a permanent business failure', async () => {
  const tieba = scriptedTieba({ 测试吧: ['captcha'] });
  const report = await runSignIn(config(), tieba, noWaitRuntime);
  expect(report.status).toBe('partial_failure');
  expect(report.forums[0]).toMatchObject({ outcome: 'failed', attempts: 1 });
});

it('stops after an authentication failure', async () => {
  const tieba = authFailureTieba();
  const report = await runSignIn(config(), tieba, noWaitRuntime);
  expect(report.status).toBe('fatal_failure');
  expect(tieba.calls.listForums).toBe(0);
  expect(tieba.calls.signForum).toBe(0);
});
```

Also test empty forum lists, already-signed forums, retry exhaustion, batch concurrency limits, exponential delays capped at 30000 ms, and accurate counts after retries.

- [ ] **Step 2: Run runner tests and verify failure**

Run: `npm test -- tests/signin.test.ts`

Expected: FAIL because `runSignIn` does not exist.

- [ ] **Step 3: Implement the runner**

Use one retry loop per forum. Retry only transient errors and the normalized `too_fast` business result. Calculate delay as:

```ts
Math.min(config.retryBaseDelayMs * 2 ** (attempt - 1) + runtime.jitter(), 30000)
```

Process at most `batchSize` forums concurrently and wait `batchIntervalMs` only between batches. Derive counts and `success` versus `partial_failure` from the final forum array; do not maintain separate mutable counters.

- [ ] **Step 4: Write failing report tests**

```ts
it('masks forum names in console but shows failed names in email', () => {
  const report = partialFailureReport('测试贴吧');
  expect(renderConsoleReport(report)).not.toContain('测试贴吧');
  expect(renderEmailReport(report).body).toContain('测试贴吧');
});

it('does not render secrets present in an error cause', () => {
  const report = fatalReport('request failed', { BDUSS: 'secret-value' });
  expect(renderConsoleReport(report)).not.toContain('secret-value');
  expect(renderEmailReport(report).body).not.toContain('secret-value');
});
```

- [ ] **Step 5: Implement report rendering and run both suites**

Render titles containing exactly one of `签到成功`, `部分失败`, or `执行失败`. Include Asia/Shanghai time, duration, counts, and final failure reasons. Use sanitized domain error messages only; never stringify raw error objects.

Run: `npm test -- tests/signin.test.ts tests/report.test.ts && npm run typecheck`

Expected: both suites PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the core behavior**

```bash
git add src/signin.ts src/report.ts tests/signin.test.ts tests/report.test.ts
git commit -m "refactor: add reliable sign-in runner and reports"
```

### Task 4: Add QQ SMTP delivery and application orchestration

**Files:**
- Create: `src/email.ts`
- Create: `src/app.ts`
- Replace: `src/index.ts`
- Create: `tests/app.test.ts`
- Create: `tests/email.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `runSignIn`, report rendering, `MailConfig`.
- Produces: `EmailPort.send(message): Promise<void>`.
- Produces: `runApp(env, dependencies): Promise<0 | 1>`.

- [ ] **Step 1: Write failing application outcome tests**

```ts
it.each([
  ['success', false, 0],
  ['partial_failure', false, 1],
  ['fatal_failure', false, 1],
  ['success', true, 1],
])('maps %s with mailFailure=%s to exit %s', async (status, mailFailure, expected) => {
  const email = recordingEmail({ reject: mailFailure });
  const exitCode = await runApp(validEnv, dependenciesFor(status, email));
  expect(email.messages).toHaveLength(1);
  expect(exitCode).toBe(expected);
});
```

Add a test showing that missing BDUSS still sends a fatal email when the three mail settings are valid, and a test showing invalid mail configuration safely logs the configuration error without attempting delivery.

- [ ] **Step 2: Run application tests and verify failure**

Run: `npm test -- tests/app.test.ts tests/email.test.ts`

Expected: FAIL because `EmailPort` and `runApp` do not exist.

- [ ] **Step 3: Implement the QQ SMTP adapter**

Create a Nodemailer transport with:

```ts
{
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: { user: config.username, pass: config.password },
}
```

Send plain text from `MAIL_USERNAME` to `MAIL_TO`. Convert Nodemailer failures to a sanitized `MailDeliveryError` without exposing transport configuration or credentials.

- [ ] **Step 4: Implement orchestration and the production entrypoint**

`runApp` loads config, creates a fatal report for invalid application configuration, runs sign-in when configuration is valid, sends exactly one email when mail configuration is available, and returns 0 only for business success plus email success.

The production `src/index.ts` must be limited to dependency composition:

```ts
import 'dotenv/config';
import { runApp } from './app';
import { createProductionDependencies } from './app';

runApp(process.env, createProductionDependencies())
  .then(code => { process.exitCode = code; })
  .catch(error => {
    console.error(`Unrecoverable startup error: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  });
```

- [ ] **Step 5: Run application, email, and full tests**

Run: `npm test -- tests/app.test.ts tests/email.test.ts && npm run check`

Expected: all tests PASS; typecheck and build exit 0.

- [ ] **Step 6: Commit the executable application**

```bash
git add src/email.ts src/app.ts src/index.ts tests/app.test.ts tests/email.test.ts
git commit -m "refactor: send accurate qq email and exit states"
```

### Task 5: Replace workflows, remove legacy code, and document operation

**Files:**
- Replace: `.github/workflows/tieba-signin.yml`
- Delete: `.github/workflows/build.yml`
- Delete: `.github/workflows/keep-alive.yml`
- Delete: `.github/workflows/sync-upstream.yml`
- Delete: `.github/last_activity.md`
- Delete: `dist/`
- Delete: `js-backup/`
- Delete: obsolete `src/notify.ts`, `src/dataProcessor.ts`, `src/apiService.ts`, `src/utils.ts`, `src/local-test.ts`, and `src/types/`
- Modify: `.env.example`
- Replace: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: production commands from Tasks 1–4.
- Produces: one scheduled/manual GitHub Actions workflow and accurate setup instructions.

- [ ] **Step 1: Replace the workflow**

The resulting workflow must contain:

```yaml
name: 百度贴吧自动签到

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: tieba-signin-${{ github.repository }}
  cancel-in-progress: false

jobs:
  signin:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run check
      - name: 运行签到并发送结果邮件
        env:
          BDUSS: ${{ secrets.BDUSS }}
          MAIL_USERNAME: ${{ secrets.MAIL_USERNAME }}
          MAIL_PASSWORD: ${{ secrets.MAIL_PASSWORD }}
          MAIL_TO: ${{ secrets.MAIL_TO }}
        run: npm start
```

- [ ] **Step 2: Delete legacy sources, outputs, and workflows**

Remove every file listed under Task 5. Ensure `.gitignore` ignores `dist/`, `node_modules/`, `.env`, coverage output, and temporary test artifacts.

- [ ] **Step 3: Replace README and environment example**

Document only the four required Secrets, daily 08:00 Asia/Shanghai schedule, manual dispatch, `npm ci && npm run check`, local `.env` execution, the three result statuses, email-failure behavior, and platform-risk disclaimer. Remove duplicate disclaimers, old channel variables, old upstream URLs, and the stray final heading.

- [ ] **Step 4: Run repository-wide static checks**

Run:

```bash
rg -n "http://tieba|actions/(checkout|setup-node)@v3|SERVERCHAN|BARK_KEY|TG_BOT|DINGTALK|WECOM|PUSHPLUS|sync-upstream|keep-alive" . --glob '!docs/superpowers/**' --glob '!package-lock.json'
```

Expected: no matches.

Run: `git ls-files dist js-backup .github/last_activity.md`

Expected: no output.

- [ ] **Step 5: Run final automated verification**

Run: `npm ci && npm run check && git diff --check`

Expected: dependency install, typecheck, all tests, build, and whitespace validation all exit 0.

- [ ] **Step 6: Commit repository cleanup**

```bash
git add -A
git commit -m "chore: modernize tieba automation workflow"
```

### Task 6: Review, push, and verify GitHub state

**Files:**
- Review all changed files.

**Interfaces:**
- Consumes: completed local branch and user authorization to update `yunnre060214-sudo/tieba`.
- Produces: updated `main` branch on GitHub and a verifiable workflow definition.

- [ ] **Step 1: Review the complete diff and commit history**

Run: `git diff origin/main...HEAD --stat && git diff origin/main...HEAD --check && git log --oneline origin/main..HEAD`

Expected: only the planned refactor, design, and plan commits; no secret files or unrelated changes.

- [ ] **Step 2: Confirm repository authentication and target**

Run: `gh auth status && git remote get-url origin`

Expected: authenticated GitHub access and origin `https://github.com/yunnre060214-sudo/tieba.git`.

- [ ] **Step 3: Push the completed branch**

Run: `git push origin main`

Expected: remote `main` advances to the local verified commit without force-push.

- [ ] **Step 4: Verify GitHub received the update**

Run: `git fetch origin && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"`

Expected: command exits 0 and local HEAD equals `origin/main`.

- [ ] **Step 5: Report the one unavoidable live check**

Tell the user that automated tests use fakes and no real BDUSS. If the four Secrets already exist, manually dispatching the workflow is the final live verification; otherwise list those exact Secrets to configure before the first scheduled run.
