import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ParsedWebhookEvent, PaymentProvider, ProviderOrder, ProviderPayment } from './types';

/**
 * Local/test payment driver.
 *
 * This is NOT a stub that returns "success". It implements the same contract as
 * Razorpay — real HMAC signatures, a payment ledger, capture and refund
 * transitions — so the order state machine, webhook idempotency and signature
 * verification are all exercised for real without credentials.
 *
 * `src/env.ts` refuses to boot production with this provider selected.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  private readonly orders = new Map<string, ProviderOrder>();
  private readonly payments = new Map<string, ProviderPayment>();

  constructor(private readonly secret: string) {}

  async createOrder(params: {
    amountMinor: number;
    currency: string;
    receipt: string;
  }): Promise<ProviderOrder> {
    const order: ProviderOrder = {
      providerOrderId: `order_fake_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      amountMinor: params.amountMinor,
      currency: params.currency,
    };
    this.orders.set(order.providerOrderId, order);
    return order;
  }

  /**
   * Simulate the customer completing payment. Used by the dev checkout page and
   * by the integration suite; there is no route that reaches it in production
   * because the provider itself is unavailable there.
   */
  simulatePayment(
    providerOrderId: string,
    outcome: 'captured' | 'failed' = 'captured',
  ): { payment: ProviderPayment; signature: string } {
    const order = this.orders.get(providerOrderId);
    if (!order) throw new Error(`Unknown fake order ${providerOrderId}`);

    const payment: ProviderPayment = {
      providerPaymentId: `pay_fake_${randomUUID().replace(/-/g, '').slice(0, 14)}`,
      providerOrderId,
      amountMinor: order.amountMinor,
      currency: order.currency,
      status: outcome,
      method: 'upi',
      failureReason: outcome === 'failed' ? 'Simulated failure' : undefined,
    };
    this.payments.set(payment.providerPaymentId, payment);

    return { payment, signature: this.sign(`${providerOrderId}|${payment.providerPaymentId}`) };
  }

  /** Build a signed webhook body, exactly as the real provider would send it. */
  buildWebhook(
    event: 'payment.captured' | 'payment.failed',
    providerPaymentId: string,
  ): { rawBody: string; signature: string } {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error(`Unknown fake payment ${providerPaymentId}`);

    const rawBody = JSON.stringify({
      event,
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: payment.providerPaymentId,
            order_id: payment.providerOrderId,
            amount: payment.amountMinor,
            currency: payment.currency,
            status: event === 'payment.captured' ? 'captured' : 'failed',
            method: payment.method,
          },
        },
      },
    });

    return { rawBody, signature: this.sign(rawBody) };
  }

  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  private equals(expected: string, actual: string): boolean {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(actual, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  verifyCheckoutSignature(params: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean {
    return this.equals(
      this.sign(`${params.providerOrderId}|${params.providerPaymentId}`),
      params.signature,
    );
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return this.equals(this.sign(rawBody), signature);
  }

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
    const body = JSON.parse(rawBody) as {
      event: string;
      created_at?: number;
      payload?: {
        payment?: {
          entity?: {
            id: string;
            order_id: string;
            amount: number;
            currency: string;
            status: string;
            method?: string;
          };
        };
        refund?: { entity?: { id: string; payment_id: string; amount: number } };
      };
    };

    const entity = body.payload?.payment?.entity;
    const refund = body.payload?.refund?.entity;

    return {
      eventId:
        refund?.id ?? (entity ? `${body.event}:${entity.id}` : `${body.event}:${body.created_at}`),
      type:
        body.event === 'payment.captured'
          ? 'payment.captured'
          : body.event === 'payment.failed'
            ? 'payment.failed'
            : body.event === 'payment.authorized'
              ? 'payment.authorized'
              : body.event === 'refund.processed'
                ? 'refund.processed'
                : 'unhandled',
      rawType: body.event,
      payment: entity
        ? {
            providerPaymentId: entity.id,
            providerOrderId: entity.order_id,
            amountMinor: entity.amount,
            currency: entity.currency,
            status:
              entity.status === 'captured'
                ? 'captured'
                : entity.status === 'failed'
                  ? 'failed'
                  : 'created',
            method: entity.method,
          }
        : undefined,
      refund: refund
        ? {
            providerRefundId: refund.id,
            providerPaymentId: refund.payment_id,
            amountMinor: refund.amount,
          }
        : undefined,
      payload: body,
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) throw new Error(`Unknown fake payment ${providerPaymentId}`);
    return payment;
  }

  async refund(params: {
    providerPaymentId: string;
    amountMinor: number;
  }): Promise<{ providerRefundId: string; status: 'pending' | 'processed' | 'failed' }> {
    const payment = this.payments.get(params.providerPaymentId);
    if (!payment) throw new Error(`Unknown fake payment ${params.providerPaymentId}`);
    if (params.amountMinor > payment.amountMinor) {
      throw new Error('Refund exceeds captured amount');
    }
    return { providerRefundId: `rfnd_fake_${randomUUID().slice(0, 12)}`, status: 'processed' };
  }
}
