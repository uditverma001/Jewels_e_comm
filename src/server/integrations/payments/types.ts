/**
 * Payment provider contract.
 *
 * Everything the order state machine needs from a payment processor is
 * expressed here, so adding Stripe for an international storefront is a new
 * file rather than a rewrite of checkout.
 */

export interface ProviderOrder {
  /** Provider-side handle used to launch the checkout widget. */
  providerOrderId: string;
  amountMinor: number;
  currency: string;
}

export interface ProviderPayment {
  providerPaymentId: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  method?: string;
  failureReason?: string;
}

export type PaymentEventType =
  'payment.captured' | 'payment.authorized' | 'payment.failed' | 'refund.processed' | 'unhandled';

export interface ParsedWebhookEvent {
  /** Provider's own event id. The unique key that makes replays idempotent. */
  eventId: string;
  type: PaymentEventType;
  rawType: string;
  payment?: ProviderPayment;
  refund?: {
    providerRefundId: string;
    providerPaymentId: string;
    amountMinor: number;
  };
  payload: unknown;
}

export interface PaymentProvider {
  readonly name: string;

  createOrder(params: {
    amountMinor: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<ProviderOrder>;

  /**
   * Verify the HMAC the browser returns from the checkout widget.
   * A true result means "this callback was not forged"; it does NOT mean the
   * order may be marked paid — only a fetched/webhook-confirmed capture does.
   */
  verifyCheckoutSignature(params: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;

  /** Verify a webhook signature against the RAW request body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;

  parseWebhookEvent(rawBody: string): ParsedWebhookEvent;

  /** Authoritative read of the provider's own record. */
  fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;

  refund(params: {
    providerPaymentId: string;
    amountMinor: number;
    notes?: Record<string, string>;
  }): Promise<{ providerRefundId: string; status: 'pending' | 'processed' | 'failed' }>;
}
