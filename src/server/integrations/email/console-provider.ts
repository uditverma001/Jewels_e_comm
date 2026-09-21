import type { EmailMessage, EmailProvider } from './types';

/**
 * Development driver. Writes the message to stdout so flows that depend on a
 * link (verification, password reset) are exercisable without an API key —
 * the link is printed, not faked away.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    console.info(
      [
        '',
        '─'.repeat(72),
        `EMAIL → ${message.to}`,
        `SUBJECT: ${message.subject}`,
        '',
        message.text,
        '─'.repeat(72),
        '',
      ].join('\n'),
    );
  }
}
