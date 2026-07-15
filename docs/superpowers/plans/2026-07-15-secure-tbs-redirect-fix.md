# Secure TBS Redirect Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the redirecting Web TBS endpoint with an HTTPS mobile login request that validates BDUSS and returns TBS without exposing credentials.

**Architecture:** `AxiosTiebaClient.login()` will send a signed form to `https://tiebac.baidu.com/c/s/login`, validate `error_code`, and cache `anti.tbs`. `getTbs()` becomes a cache read; forum listing and signing retain their current HTTPS Web endpoints.

**Tech Stack:** TypeScript 7, Node.js `node:crypto`, Axios 1.18, Vitest 4.

## Global Constraints

- All requests that carry BDUSS must use HTTPS.
- Do not follow HTTPS-to-HTTP redirects or relax `maxRedirects: 0`.
- Keep the four existing GitHub Secret names unchanged.
- Do not log or serialize BDUSS.
- Preserve the workflow schedule and QQ email behavior.

---

### Task 1: Signed HTTPS mobile login and cached TBS

**Files:**
- Modify: `tests/tieba.test.ts`
- Modify: `src/tieba.ts`

**Interfaces:**
- Consumes: `AxiosTiebaClient.login(): Promise<void>` and `AxiosTiebaClient.getTbs(): Promise<string>`.
- Produces: a signed `POST https://tiebac.baidu.com/c/s/login` request and cached TBS.

- [ ] **Step 1: Write the failing regression tests**

Make the success responder return the mobile response shape:

```ts
if (request.url.endsWith('/c/s/login')) {
  return {
    status: 200,
    data: { error_code: '0', anti: { tbs: 'tbs-token' }, user: { id: '123' } },
  };
}
```

Assert the exact login contract and removal of the old endpoint:

```ts
expect(transport.requests).toHaveLength(3);
const loginRequest = transport.requests[0]!;
expect(loginRequest).toMatchObject({
  method: 'POST',
  url: 'https://tiebac.baidu.com/c/s/login',
});
expect(loginRequest.headers?.Cookie).toBeUndefined();
expect(loginRequest.data).toBe(
  '_client_version=22.5.1.0&bdusstoken=secret-bduss&sign=1869534309174521c79f09f0278c9ba1',
);
expect(transport.requests.some(request => request.url.includes('/dc/common/tbs'))).toBe(false);
```

Add focused cases for a nonzero `error_code`, a successful response without `anti.tbs`, and `getTbs()` before login. Each error must expose the expected `auth` or `permanent` kind without including BDUSS.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/tieba.test.ts`

Expected: FAIL because the current client still uses `GET /mo/q/sync` and `GET /dc/common/tbs`.

- [ ] **Step 3: Implement the minimal signed mobile login**

Import `createHash` from `node:crypto`, set the login endpoint to `https://tiebac.baidu.com/c/s/login`, and add this deterministic helper:

```ts
const TIEBA_APP_VERSION = '22.5.1.0';
const TIEBA_APP_SALT = 'tiebaclient!!!';

function mobileLoginForm(bduss: string): string {
  const fields = [
    ['_client_version', TIEBA_APP_VERSION],
    ['bdusstoken', bduss],
  ] as const;
  const source = [...fields]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('');
  const sign = createHash('md5').update(source).update(TIEBA_APP_SALT).digest('hex');
  return new URLSearchParams([...fields, ['sign', sign]]).toString();
}
```

`login()` must POST that form without a Cookie header, accept numeric or string zero `error_code`, extract `anti.tbs`, and store it in a private field. `getTbs()` must return the cached field or throw `TiebaError('permanent', '请先完成贴吧登录再获取 TBS')`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/tieba.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Run the full check and commit**

Run: `npm run check`

Expected: typecheck, all tests, and build pass.

```bash
git add src/tieba.ts tests/tieba.test.ts
git commit -m "fix: obtain TBS through secure mobile login"
```

### Task 2: Network and repository verification

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: the mobile login form contract from Task 1.
- Produces: endpoint, test, build, dependency, and remote-SHA evidence.

- [ ] **Step 1: Probe the mobile endpoint without real credentials**

Send a correctly signed request with `bdusstoken=invalid` and `curl --compressed` to `https://tiebac.baidu.com/c/s/login`.

Expected: structured JSON containing `error_code` with no redirect to HTTP.

- [ ] **Step 2: Run final verification**

Run `npm ci`, `npm run check`, `npm audit --omit=dev --audit-level=high`, `git diff --check`, and `git status --short --branch`.

Expected: clean install; typecheck, all tests, and build pass; no high-severity production vulnerabilities; no whitespace errors; only intended commits ahead of `origin/main`.

- [ ] **Step 3: Push and verify GitHub**

Push `main` after GitHub authorization. Fetch `origin/main` and compare local `HEAD`, `origin/main`, and the public GitHub commits API SHA.

Expected: all three SHAs are identical. Then manually run the workflow once for real-account verification.
