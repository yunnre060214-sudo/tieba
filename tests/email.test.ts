import { describe, expect, it } from 'vitest';
import type { MailConfig } from '../src/config';
import { MailDeliveryError, QqEmailNotifier, type MailTransport } from '../src/email';

const config: MailConfig = {
  host: 'smtp.qq.com',
  port: 465,
  username: 'sender@qq.com',
  password: 'do-not-leak',
  recipient: 'receiver@example.com',
};

describe('QqEmailNotifier', () => {
  it('creates a secure QQ SMTP transport and sends plain text', async () => {
    let transportOptions: unknown;
    let sentMessage: unknown;
    const transport: MailTransport = {
      async sendMail(message) {
        sentMessage = message;
      },
    };
    const notifier = new QqEmailNotifier(config, options => {
      transportOptions = options;
      return transport;
    });

    await notifier.send({ subject: '签到成功', body: '全部完成' });

    expect(transportOptions).toEqual({
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      auth: { user: 'sender@qq.com', pass: 'do-not-leak' },
    });
    expect(sentMessage).toEqual({
      from: 'sender@qq.com',
      to: 'receiver@example.com',
      subject: '签到成功',
      text: '全部完成',
    });
  });

  it('sanitizes SMTP failures', async () => {
    const notifier = new QqEmailNotifier(config, () => ({
      async sendMail() {
        throw new Error('login failed with do-not-leak');
      },
    }));

    const error = await notifier.send({ subject: '失败', body: '详情' }).catch(value => value);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(String(error)).toBe('MailDeliveryError: QQ 邮件发送失败');
    expect(JSON.stringify(error)).not.toContain('do-not-leak');
  });
});
