import nodemailer from 'nodemailer';
import type { MailConfig } from './config';
import type { EmailMessage } from './domain';

export interface EmailPort {
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

export type MailTransportFactory = (options: SmtpTransportOptions) => MailTransport;

export class MailDeliveryError extends Error {
  constructor() {
    super('QQ 邮件发送失败');
    this.name = 'MailDeliveryError';
  }

  toJSON(): { name: string; message: string } {
    return { name: this.name, message: this.message };
  }
}

const defaultTransportFactory: MailTransportFactory = options => nodemailer.createTransport(options);

export class QqEmailNotifier implements EmailPort {
  private readonly transport: MailTransport;

  constructor(
    private readonly config: MailConfig,
    transportFactory: MailTransportFactory = defaultTransportFactory,
  ) {
    this.transport = transportFactory({
      host: config.host,
      port: config.port,
      secure: true,
      auth: { user: config.username, pass: config.password },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.config.username,
        to: this.config.recipient,
        subject: message.subject,
        text: message.body,
      });
    } catch {
      throw new MailDeliveryError();
    }
  }
}
