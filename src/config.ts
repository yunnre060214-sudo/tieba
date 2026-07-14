export interface AppConfig {
  bduss: string;
  batchSize: number;
  batchIntervalMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  requestTimeoutMs: number;
}

export interface MailConfig {
  host: 'smtp.qq.com';
  port: 465;
  username: string;
  password: string;
  recipient: string;
}

export interface ConfigLoadResult {
  app?: Readonly<AppConfig>;
  mail?: Readonly<MailConfig>;
  errors: string[];
}

interface IntegerField {
  envName: string;
  property: keyof Omit<AppConfig, 'bduss'>;
  defaultValue: number;
  min: number;
  max: number;
}

const integerFields: readonly IntegerField[] = [
  { envName: 'BATCH_SIZE', property: 'batchSize', defaultValue: 5, min: 1, max: 20 },
  { envName: 'BATCH_INTERVAL_MS', property: 'batchIntervalMs', defaultValue: 1500, min: 0, max: 60000 },
  { envName: 'MAX_RETRIES', property: 'maxRetries', defaultValue: 3, min: 0, max: 5 },
  { envName: 'RETRY_BASE_DELAY_MS', property: 'retryBaseDelayMs', defaultValue: 3000, min: 500, max: 60000 },
  { envName: 'REQUEST_TIMEOUT_MS', property: 'requestTimeoutMs', defaultValue: 10000, min: 1000, max: 60000 },
];

function required(env: NodeJS.ProcessEnv, name: string, errors: string[]): string | undefined {
  const value = env[name]?.trim();
  if (!value) {
    errors.push(`${name} is required`);
    return undefined;
  }
  return value;
}

function parseIntegerField(
  env: NodeJS.ProcessEnv,
  field: IntegerField,
  errors: string[],
): number | undefined {
  const raw = env[field.envName]?.trim();
  const value = raw === undefined || raw === '' ? field.defaultValue : Number(raw);

  if (!Number.isInteger(value) || value < field.min || value > field.max) {
    errors.push(`${field.envName} must be an integer between ${field.min} and ${field.max}`);
    return undefined;
  }

  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv): ConfigLoadResult {
  const appErrors: string[] = [];
  const mailErrors: string[] = [];
  const bduss = required(env, 'BDUSS', appErrors);
  const numbers: Partial<Record<keyof Omit<AppConfig, 'bduss'>, number>> = {};

  for (const field of integerFields) {
    const value = parseIntegerField(env, field, appErrors);
    if (value !== undefined) {
      numbers[field.property] = value;
    }
  }

  const username = required(env, 'MAIL_USERNAME', mailErrors);
  const password = required(env, 'MAIL_PASSWORD', mailErrors);
  const recipient = required(env, 'MAIL_TO', mailErrors);

  const result: ConfigLoadResult = {
    errors: [...appErrors, ...mailErrors],
  };

  if (appErrors.length === 0 && bduss) {
    result.app = Object.freeze({
      bduss,
      batchSize: numbers.batchSize!,
      batchIntervalMs: numbers.batchIntervalMs!,
      maxRetries: numbers.maxRetries!,
      retryBaseDelayMs: numbers.retryBaseDelayMs!,
      requestTimeoutMs: numbers.requestTimeoutMs!,
    });
  }

  if (mailErrors.length === 0 && username && password && recipient) {
    result.mail = Object.freeze({
      host: 'smtp.qq.com',
      port: 465,
      username,
      password,
      recipient,
    });
  }

  return result;
}
