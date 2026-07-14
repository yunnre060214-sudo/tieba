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
      bduss: 'bduss-value',
      batchSize: 5,
      batchIntervalMs: 1500,
      maxRetries: 3,
      retryBaseDelayMs: 3000,
      requestTimeoutMs: 10000,
    });
    expect(result.mail).toMatchObject({
      host: 'smtp.qq.com',
      port: 465,
      username: 'sender@qq.com',
      recipient: 'receiver@example.com',
    });
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
    expect(result.errors).toEqual(['BDUSS is required']);
  });

  it.each([
    ['BATCH_INTERVAL_MS', '-1', 'BATCH_INTERVAL_MS must be an integer between 0 and 60000'],
    ['RETRY_BASE_DELAY_MS', '499', 'RETRY_BASE_DELAY_MS must be an integer between 500 and 60000'],
    ['REQUEST_TIMEOUT_MS', '60001', 'REQUEST_TIMEOUT_MS must be an integer between 1000 and 60000'],
  ])('rejects %s outside its range', (key, value, message) => {
    const result = loadConfig({ ...validEnv, [key]: value });

    expect(result.errors).toContain(message);
    expect(result.app).toBeUndefined();
  });
});
