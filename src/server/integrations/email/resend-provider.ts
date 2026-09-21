import { Resend } from 'resend';
import type { EmailMessage, EmailProvider } from './types';

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    // A failed transactional email must not roll back the order it describes.
    // Log loudly; the caller decides whether to care.
    if (error) {
      throw new Error(`Resend rejected the message: ${error.message}`);
    }
  }
}
