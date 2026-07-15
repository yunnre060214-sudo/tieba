import { describe, expect, it } from 'vitest';
import {
  AxiosTiebaClient,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from '../src/tieba';

class RecordingTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];

  constructor(
    private readonly responder: (request: HttpRequest) => HttpResponse<unknown> | Promise<never>,
  ) {}

  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    this.requests.push(request);
    return this.responder(request) as HttpResponse<T>;
  }
}

function successResponse(request: HttpRequest): HttpResponse<unknown> {
  if (request.url.endsWith('/c/s/login')) {
    return {
      status: 200,
      data: { error_code: '0', anti: { tbs: 'tbs-token' }, user: { id: '123' } },
    };
  }
  if (request.url.endsWith('/mo/q/newmoindex')) {
    return {
      status: 200,
      data: {
        error: 'success',
        data: {
          like_forum: [{ forum_name: '测试吧', is_sign: 0 }],
        },
      },
    };
  }
  return {
    status: 200,
    data: {
      no: 0,
      data: {
        errno: 0,
        errmsg: 'success',
        uinfo: { user_sign_rank: 9, cont_sign_num: 12 },
      },
    },
  };
}

function axiosFailure(status?: number): Error {
  return Object.assign(new Error('request failed'), {
    isAxiosError: true,
    code: status === undefined ? 'ECONNRESET' : undefined,
    response: status === undefined ? undefined : { status },
  });
}

describe('AxiosTiebaClient', () => {
  it('uses HTTPS and the configured timeout for every request', async () => {
    const transport = new RecordingTransport(successResponse);
    const client = new AxiosTiebaClient('secret-bduss', 12345, transport);

    await client.login();
    const forums = await client.listForums();
    const tbs = await client.getTbs();
    const result = await client.signForum(forums[0]!, tbs);

    expect(transport.requests).toHaveLength(3);
    expect(transport.requests.every(request => request.url.startsWith('https://'))).toBe(true);
    expect(transport.requests.map(request => request.timeout)).toEqual([12345, 12345, 12345]);
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
    expect(forums).toEqual([{ name: '测试吧', isSigned: false }]);
    expect(result).toEqual({
      kind: 'signed',
      rank: 9,
      consecutiveDays: 12,
    });
  });

  it.each([
    [429, 'transient'],
    [500, 'transient'],
    [401, 'auth'],
    [403, 'auth'],
  ] as const)('classifies HTTP %s as %s', async (status, kind) => {
    const transport = new RecordingTransport(() => Promise.reject(axiosFailure(status)));
    const client = new AxiosTiebaClient('secret-bduss', 10000, transport);

    await expect(client.login()).rejects.toMatchObject({ kind });
  });

  it('classifies network failures as transient', async () => {
    const transport = new RecordingTransport(() => Promise.reject(axiosFailure()));
    const client = new AxiosTiebaClient('secret-bduss', 10000, transport);

    await expect(client.login()).rejects.toMatchObject({ kind: 'transient' });
  });

  it('treats an invalid login response as authentication failure', async () => {
    const transport = new RecordingTransport(() => ({
      status: 200,
      data: { error_code: '1990006', error_msg: 'login rejected' },
    }));
    const client = new AxiosTiebaClient('secret-bduss', 10000, transport);

    await expect(client.login()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('treats a successful mobile login response without TBS as a permanent failure', async () => {
    const transport = new RecordingTransport(() => ({
      status: 200,
      data: { error_code: '0', anti: {} },
    }));
    const client = new AxiosTiebaClient('secret-bduss', 10000, transport);

    await expect(client.login()).rejects.toMatchObject({ kind: 'permanent' });
  });

  it('requires login before reading cached TBS', async () => {
    const client = new AxiosTiebaClient('secret-bduss', 10000, new RecordingTransport(successResponse));

    await expect(client.getTbs()).rejects.toMatchObject({ kind: 'permanent' });
  });

  it('treats a missing like_forum field as an empty forum list', async () => {
    const transport = new RecordingTransport(request => {
      if (request.url.endsWith('/mo/q/newmoindex')) {
        return { status: 200, data: { error: 'success', data: {} } };
      }
      return successResponse(request);
    });
    const client = new AxiosTiebaClient('secret-bduss', 10000, transport);

    await expect(client.listForums()).resolves.toEqual([]);
  });

  it.each([
    [1101, 'already_signed'],
    [1102, 'retryable_failure'],
    [2150040, 'permanent_failure'],
    [1011, 'permanent_failure'],
  ] as const)('normalizes sign code %s as %s', async (code, kind) => {
    const transport = new RecordingTransport(request => {
      if (request.url.endsWith('/sign/add')) {
        return { status: 200, data: { no: code, error: `code ${code}` } };
      }
      return successResponse(request);
    });
    const client = new AxiosTiebaClient('secret-bduss', 10000, transport);

    await expect(client.signForum({ name: '测试吧', isSigned: false }, 'tbs')).resolves.toMatchObject({ kind });
  });

  it('never exposes BDUSS in a serialized error', async () => {
    const transport = new RecordingTransport(() => Promise.reject(axiosFailure(500)));
    const client = new AxiosTiebaClient('do-not-leak-me', 10000, transport);

    const error = await client.login().catch(value => value);

    expect(JSON.stringify(error)).not.toContain('do-not-leak-me');
    expect(String(error)).not.toContain('do-not-leak-me');
  });
});
