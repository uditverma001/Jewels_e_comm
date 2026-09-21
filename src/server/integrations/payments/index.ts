import 'server-only';
import { env } from '@/env';
import { FakePaymentProvider } from './fake-provider';
import { RazorpayProvider } from './razorpay-provider';
import type { PaymentProvider } from './types';

export * from './types';
export { FakePaymentProvider };

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  provider =
    env.PAYMENT_PROVIDER === 'razorpay'
      ? new RazorpayProvider(
          env.RAZORPAY_KEY_ID ?? '',
          env.RAZORPAY_KEY_SECRET ?? '',
          env.RAZORPAY_WEBHOOK_SECRET ?? '',
        )
      : new FakePaymentProvider(env.SESSION_SECRET);
  return provider;
}

export function __setPaymentProvider(next: PaymentProvider | null): void {
  provider = next;
}
