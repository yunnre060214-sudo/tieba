import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { createHash } from 'node:crypto';
import type { Forum } from './domain';

export type TiebaErrorKind = 'transient' | 'auth' | 'permanent';

export class TiebaError extends Error {
  constructor(
    readonly kind: TiebaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'TiebaError';
  }

  toJSON(): { name: string; kind: TiebaErrorKind; message: string } {
    return { name: this.name, kind: this.kind, message: this.message };
  }
}

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  timeout: number;
  headers?: Record<string, string>;
  data?: string;
}

export interface HttpResponse<T> {
  status: number;
  data: T;
}

export interface HttpTransport {
  request<T>(request: HttpRequest): Promise<HttpResponse<T>>;
}

export type TiebaSignResult =
  | { kind: 'signed'; rank?: number; consecutiveDays?: number }
  | { kind: 'already_signed' }
  | { kind: 'retryable_failure'; reason: string }
  | { kind: 'permanent_failure'; reason: string };

export interface TiebaPort {
  login(): Promise<void>;
  listForums(): Promise<Forum[]>;
  getTbs(): Promise<string>;
  signForum(forum: Forum, tbs: string): Promise<TiebaSignResult>;
}

const TIEBA_APP_VERSION = '22.5.1.0';
const TIEBA_APP_SALT = 'tiebaclient!!!';

const endpoints = {
  login: 'https://tiebac.baidu.com/c/s/login',
  forums: 'https://tieba.baidu.com/mo/q/newmoindex',
  sign: 'https://tieba.baidu.com/sign/add',
} as const;

const defaultTransport: HttpTransport = {
  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const config: AxiosRequestConfig = {
      method: request.method,
      url: request.url,
      timeout: request.timeout,
      headers: request.headers,
      data: request.data,
      maxRedirects: 0,
    };
    const response = await axios.request<T>(config);
    return { status: response.status, data: response.data };
  },
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 200 ? value : undefined;
}

function mobileLoginForm(bduss: string): string {
  const fields: Array<[string, string]> = [
    ['_client_version', TIEBA_APP_VERSION],
    ['bdusstoken', bduss],
  ];
  const source = [...fields]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('');
  const sign = createHash('md5').update(source).update(TIEBA_APP_SALT).digest('hex');
  return new URLSearchParams([...fields, ['sign', sign]]).toString();
}

function classifyTransportError(error: unknown): TiebaError {
  if (error instanceof TiebaError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      return new TiebaError('auth', '贴吧登录凭据无效');
    }
    if (status === 429 || (status !== undefined && status >= 500)) {
      return new TiebaError('transient', `贴吧服务暂时不可用${status ? `（HTTP ${status}）` : ''}`);
    }
    if (!error.response || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new TiebaError('transient', '贴吧网络请求失败或超时');
    }
    return new TiebaError('permanent', `贴吧请求被拒绝${status ? `（HTTP ${status}）` : ''}`);
  }

  return new TiebaError('permanent', '贴吧请求发生未知错误');
}

export class AxiosTiebaClient implements TiebaPort {
  private tbs: string | undefined;

  constructor(
    private readonly bduss: string,
    private readonly requestTimeoutMs: number,
    private readonly transport: HttpTransport = defaultTransport,
  ) {}

  async login(): Promise<void> {
    const response = await this.request<unknown>({
      method: 'POST',
      url: endpoints.login,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `tieba/${TIEBA_APP_VERSION}`,
      },
      data: mobileLoginForm(this.bduss),
    });
    const body = asRecord(response.data);
    const errorCode = Number(body?.error_code);
    if (!body || !Number.isFinite(errorCode) || errorCode !== 0) {
      throw new TiebaError('auth', 'BDUSS 已失效或无法验证');
    }
    const tbs = safeText(asRecord(body.anti)?.tbs);
    if (!tbs) {
      throw new TiebaError('permanent', '贴吧登录响应缺少 TBS');
    }
    this.tbs = tbs;
  }

  async listForums(): Promise<Forum[]> {
    const response = await this.request<unknown>({
      method: 'GET',
      url: endpoints.forums,
      headers: this.mobileHeaders('https://tieba.baidu.com/index/tbwise/forum'),
    });
    const body = asRecord(response.data);
    const data = asRecord(body?.data);
    if (!body || body.error !== 'success' || !data) {
      throw new TiebaError('permanent', '贴吧列表响应格式无效');
    }
    const forums = data.like_forum ?? [];
    if (!Array.isArray(forums)) {
      throw new TiebaError('permanent', '贴吧列表响应格式无效');
    }

    return forums.flatMap(value => {
      const forum = asRecord(value);
      const name = safeText(forum?.forum_name)?.trim();
      if (!name) {
        return [];
      }
      return [{ name, isSigned: forum?.is_sign === 1 }];
    });
  }

  async getTbs(): Promise<string> {
    if (!this.tbs) {
      throw new TiebaError('permanent', '请先完成贴吧登录再获取 TBS');
    }
    return this.tbs;
  }

  async signForum(forum: Forum, tbs: string): Promise<TiebaSignResult> {
    const form = new URLSearchParams({ tbs, kw: forum.name, ie: 'utf-8' });
    const response = await this.request<unknown>({
      method: 'POST',
      url: endpoints.sign,
      headers: {
        ...this.mobileHeaders('https://tieba.baidu.com/'),
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      data: form.toString(),
    });
    return this.normalizeSignResult(response.data);
  }

  private async request<T>(request: Omit<HttpRequest, 'timeout'>): Promise<HttpResponse<T>> {
    try {
      return await this.transport.request<T>({ ...request, timeout: this.requestTimeoutMs });
    } catch (error) {
      throw classifyTransportError(error);
    }
  }

  private mobileHeaders(referer: string): Record<string, string> {
    return {
      Cookie: `BDUSS=${this.bduss}`,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: referer,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    };
  }

  private normalizeSignResult(value: unknown): TiebaSignResult {
    const body = asRecord(value);
    if (!body) {
      return { kind: 'permanent_failure', reason: '签到响应为空' };
    }

    const code = asNumber(body.no);
    const data = asRecord(body.data);
    if (code === 0 && data?.errno === 0 && data.errmsg === 'success') {
      const user = asRecord(data.uinfo);
      return {
        kind: 'signed',
        rank: asNumber(user?.user_sign_rank),
        consecutiveDays: asNumber(user?.cont_sign_num),
      };
    }

    if (code === 1101) {
      return { kind: 'already_signed' };
    }
    if (code === 1102) {
      return { kind: 'retryable_failure', reason: '签到过快' };
    }

    const knownReasons: Record<number, string> = {
      2150040: '签到需要验证码',
      1011: '未加入此吧或等级不足',
      1010: '贴吧目录错误',
    };
    const reason = code === undefined
      ? safeText(body.error) ?? safeText(body.error_msg) ?? '签到响应格式无效'
      : knownReasons[code] ?? safeText(body.error) ?? safeText(body.error_msg) ?? `签到失败（错误码 ${code}）`;
    return { kind: 'permanent_failure', reason };
  }
}
