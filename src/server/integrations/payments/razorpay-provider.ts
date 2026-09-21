import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import type {
  ParsedWebhookEvent,
  PaymentEventType,
  PaymentProvider,
  ProviderOrder,
  ProviderPayment,
} from './types';

/** Razorpay's own status vocabulary, mapped onto ours. */
function mapStatus(status: string): ProviderPayment['status'] {
  switch (status) {
    case 'captured':
      return 'captured';
    case 'authorized':
      return 'authorized';
    case 'refunded':
      return 'refunded';
    case 'failed':
      return 'failed';
    default:
      return 'created';
  }
}

function mapEventType(event: string): PaymentEventType {
  switch (event) {
    case 'payment.captured':
      return 'payment.captured';
    case 'payment.authorized':
      return 'payment.authorized';
    case 'payment.failed':
      return 'payment.failed';
    case 'refund.processed':
      return 'refund.processed';
    default:
      return 'unhandled';
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
  error_description?: string;
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  private readonly client: Razorpay;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createOrder(params: {
    amountMinor: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<ProviderOrder> {
    const order = await this.client.orders.create({
      amount: params.amountMinor,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
      // Auto-capture: we never want an authorized-but-uncaptured payment
      // sitting against a reserved stock hold.
      payment_capture: true,
    });

    return {
      providerOrderId: order.id,
      amountMinor: Number(order.amount),
      currency: order.currency,
    };
  }

  /** HMAC-SHA256 over `order_id|payment_id`, keyed by the API secret. */
  verifyCheckoutSignature(params: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${params.providerOrderId}|${params.providerPaymentId}`)
      .digest('hex');
    return constantTimeEquals(expected, params.signature);
  }

  /** HMAC-SHA256 over the raw body, keyed by the webhook secret. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return constantTimeEquals(expected, signature);
  }

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent {
    const body = JSON.parse(rawBody) as {
      event: string;
      // Razorpay does not put an event id in the body; the header carries it.
      // We fall back to a deterministic key so replays still collapse.
      payload?: {
        payment?: { entity?: RazorpayPaymentEntity };
        refund?: { entity?: { id: string; payment_id: string; amount: number } };
      };
      created_at?: number;
    };

    const paymentEntity = body.payload?.payment?.entity;
    const refundEntity = body.payload?.refund?.entity;

    const eventId =
      refundEntity?.id ??
      (paymentEntity
        ? `${body.event}:${paymentEntity.id}`
        : `${body.event}:${body.created_at ?? ''}`);

    return {
      eventId,
      type: mapEventType(body.event),
      rawType: body.event,
      payment: paymentEntity
        ? {
            providerPaymentId: paymentEntity.id,
            providerOrderId: paymentEntity.order_id,
            amountMinor: Number(paymentEntity.amount),
            currency: paymentEntity.currency,
            status: mapStatus(paymentEntity.status),
            method: paymentEntity.method,
            failureReason: paymentEntity.error_description,
          }
        : undefined,
      refund: refundEntity
        ? {
            providerRefundId: refundEntity.id,
            providerPaymentId: refundEntity.payment_id,
            amountMinor: Number(refundEntity.amount),
          }
        : undefined,
      payload: body,
    };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const payment = (await this.client.payments.fetch(
      providerPaymentId,
    )) as unknown as RazorpayPaymentEntity;

    return {
      providerPaymentId: payment.id,
      providerOrderId: payment.order_id,
      amountMinor: Number(payment.amount),
      currency: payment.currency,
      status: mapStatus(payment.status),
      method: payment.method,
      failureReason: payment.error_description,
    };
  }

  async refund(params: {
    providerPaymentId: string;
    amountMinor: number;
    notes?: Record<string, string>;
  }): Promise<{ providerRefundId: string; status: 'pending' | 'processed' | 'failed' }> {
    const refund = await this.client.payments.refund(params.providerPaymentId, {
      amount: params.amountMinor,
      notes: params.notes,
      speed: 'normal',
    });

    return {
      providerRefundId: refund.id,
      status:
        refund.status === 'processed'
          ? 'processed'
          : refund.status === 'failed'
            ? 'failed'
            : 'pending',
    };
  }
}
