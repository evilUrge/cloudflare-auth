import { EmailProviderType } from '../../types';

export interface EmailMessage {
  to: string;
  from: string;
  fromName?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface IEmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class ProviderFactory {
  static create(type: EmailProviderType, config: any): IEmailProvider {
    switch (type) {
      case 'sendgrid':
        return new SendGridProvider(config);
      case 'postmark':
        return new PostmarkProvider(config);
      case 'mailgun':
        return new MailgunProvider(config);
      case 'resend':
        return new ResendProvider(config);
      case 'smtp':
        // SMTP might be hard in Cloudflare Workers directly without a library like nodemailer which might not work.
        // Workers can only make HTTP requests (fetch).
        // Many SMTP providers have HTTP APIs (SMTP2GO, Mailtrap, etc).
        // For generic SMTP, we might need a worker-specific library or use an HTTP proxy.
        // For now, let's implement the specific API providers and leave SMTP as a placeholder or specific HTTP implementations.
        throw new Error('Generic SMTP not fully supported in Workers environment yet, use API integration');
      default:
        // Try to map known providers to their specific implementations if possible, otherwise throw
        throw new Error(`Provider ${type} not supported yet`);
    }
  }
}

export class SendGridProvider implements IEmailProvider {
  constructor(private config: { apiKey: string }) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: message.to }] }],
        from: { email: message.from, name: message.fromName },
        subject: message.subject,
        content: [
          { type: 'text/html', value: message.html },
          ...(message.text ? [{ type: 'text/plain', value: message.text }] : [])
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid Error: ${error}`);
    }
  }
}

export class PostmarkProvider implements IEmailProvider {
  constructor(private config: { apiKey: string }) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': this.config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        From: message.fromName ? `${message.fromName} <${message.from}>` : message.from,
        To: message.to,
        Subject: message.subject,
        HtmlBody: message.html,
        TextBody: message.text,
        MessageStream: 'outbound'
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Postmark Error: ${error}`);
    }
  }
}

export class MailgunProvider implements IEmailProvider {
  constructor(private config: { apiKey: string; domain: string; region?: 'us' | 'eu' }) {}

  async send(message: EmailMessage): Promise<void> {
    const baseUrl = this.config.region === 'eu'
      ? 'https://api.eu.mailgun.net/v3'
      : 'https://api.mailgun.net/v3';

    const formData = new FormData();
    formData.append('from', message.fromName ? `${message.fromName} <${message.from}>` : message.from);
    formData.append('to', message.to);
    formData.append('subject', message.subject);
    formData.append('html', message.html);
    if (message.text) formData.append('text', message.text);

    const response = await fetch(`${baseUrl}/${this.config.domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`api:${this.config.apiKey}`)
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mailgun Error: ${error}`);
    }
  }
}

export class ResendProvider implements IEmailProvider {
  constructor(private config: { apiKey: string }) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.fromName ? `${message.fromName} <${message.from}>` : message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend Error: ${error}`);
    }
  }
}
