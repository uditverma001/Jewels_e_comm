import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { env } from '@/env';
import { buildMetadata } from '@/lib/seo';
import { PaymentSimulator } from '@/components/checkout/payment-simulator';

export const metadata: Metadata = buildMetadata({
  title: 'Processing payment',
  description: 'Completing your payment.',
  path: '/checkout/processing',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

/**
 * Development-only payment step.
 *
 * With the real provider the customer never reaches this route — Razorpay
 * Checkout opens in an overlay and returns to the confirmation page directly.
 */
export default async function CheckoutProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; providerOrderId?: string }>;
}) {
  if (env.PAYMENT_PROVIDER !== 'fake') redirect('/cart');

  const { orderId, providerOrderId } = await searchParams;
  if (!orderId || !providerOrderId) redirect('/cart');

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-20">
      <PaymentSimulator orderId={orderId} providerOrderId={providerOrderId} />
    </div>
  );
}
