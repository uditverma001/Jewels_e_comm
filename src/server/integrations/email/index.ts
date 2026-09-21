import 'server-only';
import { env } from '@/env';
import { ConsoleEmailProvider } from './console-provider';
import { ResendEmailProvider } from './resend-provider';
import type { EmailMessage, EmailProvider } from './types';

export type { EmailMessage, EmailProvider };

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  provider =
    env.EMAIL_DRIVER === 'resend'
      ? new ResendEmailProvider(env.RESEND_API_KEY ?? '', env.EMAIL_FROM)
      : new ConsoleEmailProvider();
  return provider;
}

/**
 * Send without letting a mail outage fail the surrounding business operation.
 * Order placement must survive an email provider being down.
 */
export async function sendEmailSafely(message: EmailMessage): Promise<boolean> {
  try {
    await getEmailProvider().send(message);
    return true;
  } catch (error) {
    console.error('[email] delivery failed', {
      to: message.to,
      subject: message.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Test seam — lets the integration suite install a recording provider. */
export function __setEmailProvider(next: EmailProvider | null): void {
  provider = next;
}
