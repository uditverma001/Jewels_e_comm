import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Order, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/env';
import { conflict, notFound, outOfStock, validationError } from '@/server/errors';
import { priceOrder, type PricingCoupon, type ShippingQuote } from './pricing';
import { validateCouponForCart } from '@/server/coupons/service';
import { reserve } from '@/server/inventory/service';
import { generateOrderNumber } from '@/server/orders/order-number';
import type { CartOwner } from '@/server/cart/service';
import { getPaymentProvider } from '@/server/integrations/payments';
import type { AddressInput, CheckoutInput } from './schema';

/**
 * Checkout.
 *
 * This is the point at which the server stops trusting anything the browser
 * said. It re-reads every line's price from the database, re-validates the
 * coupon against live rules, recomputes GST and shipping, reserves stock
 * atomically, and only then creates the order and asks the payment provider
 * for an amount that the server itself calculated.
 *
 * The client submits an address, a delivery choice and a coupon code. It never
 * submits a number that affects what is charged.
 */

const MAX_ORDER_LINES = 30;

export interface CheckoutSummaryLine {
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface CheckoutSummary {
  lines: CheckoutSummaryLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  shippingWaived: boolean;
  couponCode: string | null;
}

export interface CreatedOrder {
  order: Order;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
}

/** Everything needed to price a cart, read fresh inside the transaction. */
const CART_FOR_CHECKOUT = {
  items: {
    include: {
      variant: {
        include: {
          inventory: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              deletedAt: true,
              basePriceMinor: true,
              compareAtPriceMinor: true,
              categoryId: true,
              collectionId: true,
              category: {
                select: { taxRateBps: true, parent: { select: { taxRateBps: true } } },
              },
              media: {
                where: { type: 'IMAGE' as const },
                orderBy: { position: 'asc' as const },
                take: 1,
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CartForCheckout = Prisma.CartGetPayload<{ include: typeof CART_FOR_CHECKOUT }>;
type CheckoutItem = CartForCheckout['items'][number];

function taxRateFor(item: CheckoutItem): number {
  return (
    item.variant.product.category.taxRateBps ??
    item.variant.product.category.parent?.taxRateBps ??
    env.DEFAULT_TAX_RATE_BPS
  );
}

function unitPriceOf(item: CheckoutItem): number {
  return item.variant.priceMinor ?? item.variant.product.basePriceMinor;
}

function availabilityOf(item: CheckoutItem): number {
  const inventory = item.variant.inventory;
  if (!inventory) return 0;
  if (inventory.allowBackorder) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, inventory.quantity - inventory.reserved);
}

async function loadShippingMethod(code: string): Promise<ShippingQuote> {
  const method = await db.shippingMethod.findFirst({ where: { code, isActive: true } });
  if (!method) throw validationError('Choose a delivery method.');
  return {
    code: method.code,
    name: method.name,
    baseRateMinor: method.baseRateMinor,
    freeAboveMinor: method.freeAboveMinor,
  };
}

interface ResolvedCoupon {
  id: string;
  code: string;
  pricing: PricingCoupon;
  categoryId: string | null;
  collectionId: string | null;
}

async function resolveCoupon(
  code: string | null,
  userId: string | null,
  subtotalMinor: number,
): Promise<ResolvedCoupon | null> {
  if (!code) return null;

  const result = await validateCouponForCart({ code, userId, subtotalMinor });
  if (!result.ok) {
    // The coupon was valid when it was applied and is not now — say so rather
    // than silently charging full price.
    throw validationError(`${result.reason} Please review your bag.`);
  }

  return {
    id: result.coupon.id,
    code: result.coupon.code,
    pricing: {
      code: result.coupon.code,
      type: result.coupon.type,
      value: result.coupon.value,
      maxDiscountMinor: result.coupon.maxDiscountMinor,
    },
    categoryId: result.coupon.categoryId,
    collectionId: result.coupon.collectionId,
  };
}

function couponEligible(coupon: ResolvedCoupon | null, item: CheckoutItem): boolean {
  if (!coupon) return false;
  if (coupon.collectionId && item.variant.product.collectionId !== coupon.collectionId)
    return false;
  if (coupon.categoryId && item.variant.product.categoryId !== coupon.categoryId) return false;
  return true;
}

async function loadCartForCheckout(owner: CartOwner): Promise<CartForCheckout> {
  const cart = await db.cart.findFirst({
    where: owner.userId
      ? { userId: owner.userId, status: 'ACTIVE' }
      : { anonymousId: owner.anonymousId ?? '__none__', status: 'ACTIVE' },
    include: CART_FOR_CHECKOUT,
  });

  if (!cart || cart.items.length === 0) {
    throw validationError('Your bag is empty.');
  }
  if (cart.items.length > MAX_ORDER_LINES) {
    throw conflict('Your bag has too many lines to check out online.');
  }
  return cart;
}

/**
 * Validate that every line can still be bought, at the quantity requested.
 * Runs before the order is created and again, atomically, when stock is
 * reserved — this pass exists to produce a useful error message, not to be the
 * safety net.
 */
function assertPurchasable(cart: CartForCheckout): void {
  for (const item of cart.items) {
    const { product } = item.variant;
    if (!item.variant.isActive || item.variant.deletedAt) {
      throw conflict(`${product.name} is no longer available. Please remove it from your bag.`);
    }
    if (product.status !== 'ACTIVE' || product.deletedAt) {
      throw conflict(`${product.name} is no longer available. Please remove it from your bag.`);
    }
    const available = availabilityOf(item);
    if (available < item.quantity) {
      throw outOfStock(
        available === 0
          ? `${product.name} (${item.variant.label}) has sold out.`
          : `Only ${available} left of ${product.name} (${item.variant.label}).`,
      );
    }
  }
}

/** Server-side summary used to render the checkout review step. */
export async function getCheckoutSummary(
  owner: CartOwner,
  shippingMethodCode?: string | null,
): Promise<CheckoutSummary> {
  const cart = await loadCartForCheckout(owner);
  const shipping = shippingMethodCode ? await loadShippingMethod(shippingMethodCode) : null;

  const subtotalMinor = cart.items.reduce(
    (sum, item) => sum + unitPriceOf(item) * item.quantity,
    0,
  );

  let coupon: ResolvedCoupon | null = null;
  try {
    coupon = await resolveCoupon(cart.couponCode, owner.userId ?? null, subtotalMinor);
  } catch {
    // A coupon that has gone stale must not block the summary from rendering;
    // the cart view already surfaces it as an issue.
    coupon = null;
  }

  const priced = priceOrder({
    lines: cart.items.map((item) => ({
      variantId: item.variantId,
      productId: item.variant.product.id,
      unitPriceMinor: unitPriceOf(item),
      quantity: item.quantity,
      taxRateBps: taxRateFor(item),
      couponEligible: couponEligible(coupon, item),
    })),
    coupon: coupon?.pricing ?? null,
    shipping,
  });

  return {
    lines: cart.items.map((item, index) => ({
      variantId: item.variantId,
      productName: item.variant.product.name,
      variantLabel: item.variant.label,
      sku: item.variant.sku,
      imageUrl: item.variant.product.media[0]?.url ?? null,
      quantity: item.quantity,
      unitPriceMinor: unitPriceOf(item),
      lineTotalMinor: priced.lines[index]?.lineTotalMinor ?? 0,
    })),
    subtotalMinor: priced.subtotalMinor,
    discountMinor: priced.discountMinor,
    taxMinor: priced.taxMinor,
    shippingMinor: priced.shippingMinor,
    totalMinor: priced.totalMinor,
    shippingWaived: priced.shippingWaived,
    couponCode: coupon?.code ?? null,
  };
}

/**
 * Create a draft order and a provider payment intent.
 *
 * Everything that must not be half-done happens inside one transaction: stock
 * reservation, order creation, line snapshots and address snapshots. The
 * provider call happens after the transaction commits, because a slow external
 * HTTP request must not hold database locks open.
 */
export async function createOrder(owner: CartOwner, input: CheckoutInput): Promise<CreatedOrder> {
  const cart = await loadCartForCheckout(owner);
  assertPurchasable(cart);

  const shipping = await loadShippingMethod(input.shippingMethodCode);

  const subtotalMinor = cart.items.reduce(
    (sum, item) => sum + unitPriceOf(item) * item.quantity,
    0,
  );
  const coupon = await resolveCoupon(cart.couponCode, owner.userId ?? null, subtotalMinor);

  const priced = priceOrder({
    lines: cart.items.map((item) => ({
      variantId: item.variantId,
      productId: item.variant.product.id,
      unitPriceMinor: unitPriceOf(item),
      quantity: item.quantity,
      taxRateBps: taxRateFor(item),
      couponEligible: couponEligible(coupon, item),
    })),
    coupon: coupon?.pricing ?? null,
    shipping,
  });

  if (priced.totalMinor <= 0) {
    throw validationError('This order has no payable amount.');
  }

  const shippingAddress = await resolveAddress(owner, input);
  const billingAddress = input.billingAddress ?? shippingAddress;
  const orderNumber = generateOrderNumber(randomBytes(8));

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        userId: owner.userId ?? null,
        email: input.email,
        phone: input.phone,
        status: 'PENDING',
        paymentStatus: 'PENDING',
        currency: env.CURRENCY,
        subtotalMinor: priced.subtotalMinor,
        discountMinor: priced.discountMinor,
        taxMinor: priced.taxMinor,
        shippingMinor: priced.shippingMinor,
        totalMinor: priced.totalMinor,
        couponCode: coupon?.code ?? null,
        cartId: cart.id,
        shippingMethodCode: shipping.code,
        shippingMethodName: shipping.name,
        customerNote: input.customerNote || null,
        giftWrap: input.giftWrap ?? false,
        // `|| null` rather than `?? null`: an empty string is the same request
        // as no message, and a blank card is worse than none.
        giftMessage: input.giftMessage || null,
        items: {
          create: cart.items.map((item, index) => {
            const line = priced.lines[index]!;
            return {
              productId: item.variant.product.id,
              variantId: item.variantId,
              // Immutable snapshot: renaming or deleting the product later must
              // not rewrite this order.
              productName: item.variant.product.name,
              productSlug: item.variant.product.slug,
              variantLabel: item.variant.label,
              sku: item.variant.sku,
              imageUrl: item.variant.product.media[0]?.url ?? null,
              unitPriceMinor: line.unitPriceMinor,
              compareAtPriceMinor:
                item.variant.compareAtPriceMinor ?? item.variant.product.compareAtPriceMinor,
              quantity: line.quantity,
              lineSubtotalMinor: line.lineSubtotalMinor,
              lineDiscountMinor: line.lineDiscountMinor,
              taxRateBps: line.taxRateBps,
              lineTaxMinor: line.lineTaxMinor,
              lineTotalMinor: line.lineTotalMinor,
              // Snapshotted like everything else here: this is what the bench
              // cuts, and an engraved piece cannot be returned, so it must not
              // be possible for it to change after the order is placed.
              engravingText: item.engravingText,
            };
          }),
        },
        addresses: {
          create: [
            { type: 'SHIPPING', ...shippingAddress },
            { type: 'BILLING', ...billingAddress },
          ],
        },
        events: {
          create: {
            type: 'created',
            message: 'Order created and stock reserved.',
          },
        },
      },
    });

    // Atomic: if any line cannot be held, the whole transaction unwinds and
    // nothing was reserved.
    await reserve(
      tx,
      created.id,
      cart.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    );

    // Return the updated row, not `created` — callers act on this object, and
    // handing back a status the database no longer holds is how a stale read
    // becomes a wrong decision.
    return tx.order.update({
      where: { id: created.id },
      data: { status: 'PAYMENT_PENDING' },
    });
  });

  // Outside the transaction: an external HTTP call must never hold row locks.
  const provider = getPaymentProvider();
  const providerOrder = await provider.createOrder({
    amountMinor: priced.totalMinor,
    currency: env.CURRENCY,
    receipt: order.orderNumber,
    notes: { orderId: order.id, orderNumber: order.orderNumber },
  });

  await db.payment.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      providerOrderId: providerOrder.providerOrderId,
      amountMinor: priced.totalMinor,
      currency: env.CURRENCY,
      status: 'PENDING',
    },
  });

  return {
    order,
    providerOrderId: providerOrder.providerOrderId,
    amountMinor: priced.totalMinor,
    currency: env.CURRENCY,
  };
}

/** Pick a saved address (scoped to the owner) or take the typed one. */
async function resolveAddress(owner: CartOwner, input: CheckoutInput): Promise<AddressInput> {
  if (!input.shippingAddressId) return input.shippingAddress;
  if (!owner.userId) throw validationError('Enter a delivery address.');

  const saved = await db.address.findFirst({
    // Scoped by userId: an address id from another account resolves to nothing.
    where: { id: input.shippingAddressId, userId: owner.userId, deletedAt: null },
  });
  if (!saved) throw notFound('That saved address no longer exists.');

  return {
    fullName: saved.fullName,
    phone: saved.phone,
    line1: saved.line1,
    line2: saved.line2 ?? '',
    city: saved.city,
    state: saved.state as AddressInput['state'],
    postalCode: saved.postalCode,
    country: 'IN',
  };
}

export async function listShippingMethods() {
  return db.shippingMethod.findMany({
    where: { isActive: true },
    orderBy: { position: 'asc' },
  });
}
