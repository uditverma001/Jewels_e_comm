import 'server-only';
import type { Cart, CartStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/env';
import { conflict, notFound, outOfStock, validationError } from '@/server/errors';
import { priceOrder, type PricingCoupon, type ShippingQuote } from '@/server/checkout/pricing';
import { validateCouponForCart } from '@/server/coupons/service';

/**
 * Cart.
 *
 * The cart lives in Postgres, not in the browser. That is deliberate: it
 * survives devices and sessions, it cannot be edited by the customer, and the
 * prices in it are read fresh on every view — so a client cannot present a
 * stale or forged price at checkout.
 *
 * A guest cart is owned by an opaque `anonymousId` cookie; on sign-in it is
 * merged into the account's cart.
 */

const CART_TTL_DAYS = 30;
const MAX_LINE_QUANTITY = 10;
const MAX_CART_LINES = 30;

export interface CartLineView {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  /** What the customer asked to have cut into this piece, if anything. */
  engravingText: string | null;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  compareAtPriceMinor: number | null;
  lineSubtotalMinor: number;
  lineDiscountMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
  availableQuantity: number;
  /** Set when the live price differs from the price at the time of adding. */
  priceChangedFromMinor: number | null;
  isAvailable: boolean;
}

export type CartIssueCode =
  'VARIANT_UNAVAILABLE' | 'QUANTITY_REDUCED' | 'PRICE_CHANGED' | 'COUPON_INVALID';

export interface CartIssue {
  code: CartIssueCode;
  message: string;
  lineId?: string;
}

export interface CartView {
  id: string;
  lines: CartLineView[];
  itemCount: number;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  shippingWaived: boolean;
  couponCode: string | null;
  couponDescription: string | null;
  /** Problems the customer must see before paying: stock, price, coupon. */
  issues: CartIssue[];
}

export interface CartOwner {
  userId?: string | null;
  anonymousId?: string | null;
}

function ownerWhere(owner: CartOwner): Prisma.CartWhereInput {
  if (owner.userId) return { userId: owner.userId, status: 'ACTIVE' };
  if (owner.anonymousId) return { anonymousId: owner.anonymousId, status: 'ACTIVE' };
  throw validationError('A cart requires either a signed-in user or a visitor id.');
}

function expiry(): Date {
  return new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function findCart(owner: CartOwner): Promise<Cart | null> {
  if (!owner.userId && !owner.anonymousId) return null;
  return db.cart.findFirst({ where: ownerWhere(owner) });
}

export async function getOrCreateCart(owner: CartOwner): Promise<Cart> {
  const existing = await findCart(owner);
  if (existing) return existing;

  try {
    return await db.cart.create({
      data: {
        userId: owner.userId ?? null,
        anonymousId: owner.userId ? null : (owner.anonymousId ?? null),
        expiresAt: expiry(),
      },
    });
  } catch (error) {
    // Two parallel requests can both miss the lookup; the partial unique index
    // on (userId) WHERE status='ACTIVE' makes the loser retry into the winner.
    const existingAfterRace = await findCart(owner);
    if (existingAfterRace) return existingAfterRace;
    throw error;
  }
}

/**
 * The line's live unit price, and everything needed to render it.
 * Prices are ALWAYS read here — never taken from the cart row.
 */
const LINE_INCLUDE = {
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
          collectionId: true,
          categoryId: true,
          category: { select: { taxRateBps: true, parent: { select: { taxRateBps: true } } } },
          media: {
            where: { type: 'IMAGE' as const },
            orderBy: { position: 'asc' as const },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartItemWithRelations = Prisma.CartItemGetPayload<{ include: typeof LINE_INCLUDE }>;

function taxRateFor(item: CartItemWithRelations): number {
  return (
    item.variant.product.category.taxRateBps ??
    item.variant.product.category.parent?.taxRateBps ??
    env.DEFAULT_TAX_RATE_BPS
  );
}

function isPurchasable(item: CartItemWithRelations): boolean {
  const { variant } = item;
  if (!variant.isActive || variant.deletedAt) return false;
  if (variant.product.status !== 'ACTIVE' || variant.product.deletedAt) return false;
  return true;
}

function availabilityOf(item: CartItemWithRelations): number {
  const inventory = item.variant.inventory;
  if (!inventory) return 0;
  if (inventory.allowBackorder) return MAX_LINE_QUANTITY;
  return Math.max(0, inventory.quantity - inventory.reserved);
}

function unitPriceOf(item: CartItemWithRelations): number {
  return item.variant.priceMinor ?? item.variant.product.basePriceMinor;
}

/**
 * Build the customer-facing cart.
 *
 * Also the place where the awkward realities are surfaced rather than hidden:
 * a variant that was archived, stock that dropped below the requested
 * quantity, a price that moved, or a coupon that has since expired. Each
 * becomes an `issue` the UI must show — silently changing someone's basket is
 * worse than telling them.
 */
export async function getCartView(
  owner: CartOwner,
  options?: { shippingMethodCode?: string | null },
): Promise<CartView> {
  const cart = await findCart(owner);
  if (!cart) return emptyCartView();

  const items = await db.cartItem.findMany({
    where: { cartId: cart.id },
    include: LINE_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });

  const issues: CartIssue[] = [];
  const usableItems: CartItemWithRelations[] = [];
  const availability = new Map<string, number>();

  for (const item of items) {
    if (!isPurchasable(item)) {
      issues.push({
        code: 'VARIANT_UNAVAILABLE',
        lineId: item.id,
        message: `${item.variant.product.name} is no longer available and has been removed.`,
      });
      continue;
    }

    const available = availabilityOf(item);
    availability.set(item.id, available);

    if (available <= 0) {
      issues.push({
        code: 'VARIANT_UNAVAILABLE',
        lineId: item.id,
        message: `${item.variant.product.name} (${item.variant.label}) has sold out.`,
      });
      continue;
    }

    if (item.quantity > available) {
      issues.push({
        code: 'QUANTITY_REDUCED',
        lineId: item.id,
        message: `Only ${available} left of ${item.variant.product.name} (${item.variant.label}).`,
      });
    }

    const livePrice = unitPriceOf(item);
    if (livePrice !== item.addedUnitPriceMinor) {
      issues.push({
        code: 'PRICE_CHANGED',
        lineId: item.id,
        message: `The price of ${item.variant.product.name} has changed since you added it.`,
      });
    }

    usableItems.push(item);
  }

  const coupon = await resolveCoupon(cart.couponCode, usableItems, issues, owner.userId ?? null);
  const shipping = await resolveShipping(options?.shippingMethodCode ?? null);

  const priced = priceOrder({
    lines: usableItems.map((item) => ({
      variantId: item.variantId,
      productId: item.variant.product.id,
      unitPriceMinor: unitPriceOf(item),
      // Never price more than we can actually ship.
      quantity: Math.min(item.quantity, availability.get(item.id) ?? item.quantity),
      taxRateBps: taxRateFor(item),
      couponEligible: coupon ? isCouponEligibleLine(coupon, item) : false,
    })),
    coupon: coupon?.pricing ?? null,
    shipping,
  });

  const lines: CartLineView[] = usableItems.map((item, index) => {
    const pricedLine = priced.lines[index]!;
    const available = availability.get(item.id) ?? 0;
    const livePrice = unitPriceOf(item);

    return {
      id: item.id,
      variantId: item.variantId,
      productId: item.variant.product.id,
      productName: item.variant.product.name,
      productSlug: item.variant.product.slug,
      variantLabel: item.variant.label,
      engravingText: item.engravingText,
      sku: item.variant.sku,
      imageUrl: item.variant.product.media[0]?.url ?? null,
      quantity: pricedLine.quantity,
      unitPriceMinor: livePrice,
      compareAtPriceMinor:
        item.variant.compareAtPriceMinor ?? item.variant.product.compareAtPriceMinor,
      lineSubtotalMinor: pricedLine.lineSubtotalMinor,
      lineDiscountMinor: pricedLine.lineDiscountMinor,
      lineTaxMinor: pricedLine.lineTaxMinor,
      lineTotalMinor: pricedLine.lineTotalMinor,
      availableQuantity: available,
      priceChangedFromMinor:
        livePrice !== item.addedUnitPriceMinor ? item.addedUnitPriceMinor : null,
      isAvailable: available > 0,
    };
  });

  return {
    id: cart.id,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalMinor: priced.subtotalMinor,
    discountMinor: priced.discountMinor,
    taxMinor: priced.taxMinor,
    shippingMinor: priced.shippingMinor,
    totalMinor: priced.totalMinor,
    shippingWaived: priced.shippingWaived,
    couponCode: coupon?.code ?? null,
    couponDescription: coupon?.description ?? null,
    issues,
  };
}

function emptyCartView(): CartView {
  return {
    id: '',
    lines: [],
    itemCount: 0,
    subtotalMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    shippingMinor: 0,
    totalMinor: 0,
    shippingWaived: false,
    couponCode: null,
    couponDescription: null,
    issues: [],
  };
}

interface ResolvedCoupon {
  code: string;
  description: string | null;
  pricing: PricingCoupon;
  categoryId: string | null;
  collectionId: string | null;
}

function isCouponEligibleLine(coupon: ResolvedCoupon, item: CartItemWithRelations): boolean {
  if (coupon.collectionId && item.variant.product.collectionId !== coupon.collectionId)
    return false;
  if (coupon.categoryId && item.variant.product.categoryId !== coupon.categoryId) return false;
  return true;
}

async function resolveCoupon(
  code: string | null,
  items: CartItemWithRelations[],
  issues: CartIssue[],
  userId: string | null,
): Promise<ResolvedCoupon | null> {
  if (!code) return null;

  const subtotal = items.reduce((sum, item) => sum + unitPriceOf(item) * item.quantity, 0);
  const result = await validateCouponForCart({ code, userId, subtotalMinor: subtotal });

  if (!result.ok) {
    issues.push({ code: 'COUPON_INVALID', message: result.reason });
    return null;
  }

  return {
    code: result.coupon.code,
    description: result.coupon.description,
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

async function resolveShipping(code: string | null): Promise<ShippingQuote | null> {
  if (!code) return null;
  const method = await db.shippingMethod.findFirst({ where: { code, isActive: true } });
  if (!method) return null;
  return {
    code: method.code,
    name: method.name,
    baseRateMinor: method.baseRateMinor,
    freeAboveMinor: method.freeAboveMinor,
  };
}

/**
 * The value `engravingKey` must hold for a given engraving.
 *
 * Postgres treats NULL as distinct from NULL in a unique index, so the bag's
 * "one line per variant" rule cannot be expressed over a nullable column —
 * two plain lines of the same variant would both be permitted. Collapsing
 * absent to '' is what makes the index work, and a CHECK constraint keeps the
 * two columns in lockstep so this can never be forgotten at a call site.
 */
function engravingKeyFor(text: string | null): string {
  return text ?? '';
}

/**
 * Trim, collapse whitespace, strip control characters, and treat blank as
 * absent. The text is cut into metal by hand from this string, so what is
 * stored should be what a person can read off a worksheet.
 */
function normaliseEngraving(input: string | null | undefined): string | null {
  if (input == null) return null;
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export async function addItem(
  owner: CartOwner,
  input: { variantId: string; quantity: number; engravingText?: string | null },
): Promise<void> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw validationError('Choose a quantity of at least one.');
  }
  if (input.quantity > MAX_LINE_QUANTITY) {
    throw validationError(`You can order up to ${MAX_LINE_QUANTITY} of a single piece online.`);
  }

  const variant = await db.productVariant.findFirst({
    where: {
      id: input.variantId,
      isActive: true,
      deletedAt: null,
      product: { status: 'ACTIVE', deletedAt: null },
    },
    include: {
      inventory: true,
      product: { select: { basePriceMinor: true, name: true, engravingMaxLength: true } },
    },
  });

  if (!variant) throw notFound('That piece is no longer available.');

  const available = variant.inventory
    ? variant.inventory.allowBackorder
      ? MAX_LINE_QUANTITY
      : Math.max(0, variant.inventory.quantity - variant.inventory.reserved)
    : 0;

  if (available <= 0) throw outOfStock('That piece has just sold out.');

  // Engraving is a property of the piece, so the shop decides whether it is
  // offered and how long the text may be — never the client.
  const engravingText = normaliseEngraving(input.engravingText);
  if (engravingText) {
    const limit = variant.product.engravingMaxLength;
    if (!limit) {
      throw validationError('This piece cannot be engraved.');
    }
    if (engravingText.length > limit) {
      throw validationError(`Engraving is limited to ${limit} characters on this piece.`);
    }
  }
  const engravingKey = engravingKeyFor(engravingText);

  const cart = await getOrCreateCart(owner);
  const existing = await db.cartItem.findUnique({
    where: {
      cartId_variantId_engravingKey: { cartId: cart.id, variantId: input.variantId, engravingKey },
    },
  });

  const lineCount = await db.cartItem.count({ where: { cartId: cart.id } });
  if (!existing && lineCount >= MAX_CART_LINES) {
    throw conflict('Your bag is full. Please check out or remove something first.');
  }

  const desired = (existing?.quantity ?? 0) + input.quantity;
  if (desired > available) {
    throw outOfStock(
      available === 0
        ? 'That piece has just sold out.'
        : `Only ${available} left — we could not add that many.`,
    );
  }
  if (desired > MAX_LINE_QUANTITY) {
    throw validationError(`You can order up to ${MAX_LINE_QUANTITY} of a single piece online.`);
  }

  const unitPrice = variant.priceMinor ?? variant.product.basePriceMinor;

  await db.cartItem.upsert({
    where: {
      cartId_variantId_engravingKey: { cartId: cart.id, variantId: input.variantId, engravingKey },
    },
    create: {
      cartId: cart.id,
      variantId: input.variantId,
      quantity: input.quantity,
      addedUnitPriceMinor: unitPrice,
      engravingText,
      engravingKey,
    },
    update: { quantity: desired, addedUnitPriceMinor: unitPrice },
  });

  await touchCart(cart.id);
}

export async function updateQuantity(
  owner: CartOwner,
  input: { lineId: string; quantity: number },
): Promise<void> {
  const cart = await findCart(owner);
  if (!cart) throw notFound('Your bag is empty.');

  // Scoped by cartId: a line id from another customer's cart resolves to
  // nothing rather than to someone else's item.
  const item = await db.cartItem.findFirst({
    where: { id: input.lineId, cartId: cart.id },
    include: { variant: { include: { inventory: true } } },
  });
  if (!item) throw notFound('That item is no longer in your bag.');

  if (input.quantity <= 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    await touchCart(cart.id);
    return;
  }
  if (input.quantity > MAX_LINE_QUANTITY) {
    throw validationError(`You can order up to ${MAX_LINE_QUANTITY} of a single piece online.`);
  }

  const inventory = item.variant.inventory;
  const available = inventory
    ? inventory.allowBackorder
      ? MAX_LINE_QUANTITY
      : Math.max(0, inventory.quantity - inventory.reserved)
    : 0;

  if (input.quantity > available) {
    throw outOfStock(
      available === 0 ? 'That piece has sold out.' : `Only ${available} left in stock.`,
    );
  }

  await db.cartItem.update({ where: { id: item.id }, data: { quantity: input.quantity } });
  await touchCart(cart.id);
}

/** Swap a line to a different variant of the same product (e.g. a new size). */
export async function changeVariant(
  owner: CartOwner,
  input: { lineId: string; variantId: string },
): Promise<void> {
  const cart = await findCart(owner);
  if (!cart) throw notFound('Your bag is empty.');

  const item = await db.cartItem.findFirst({
    where: { id: input.lineId, cartId: cart.id },
    include: { variant: { select: { productId: true } } },
  });
  if (!item) throw notFound('That item is no longer in your bag.');

  const target = await db.productVariant.findFirst({
    where: {
      id: input.variantId,
      // Swapping across products would be a different purchase, not an edit.
      productId: item.variant.productId,
      isActive: true,
      deletedAt: null,
    },
    include: { inventory: true, product: { select: { basePriceMinor: true } } },
  });
  if (!target) throw notFound('That option is not available.');

  const available = target.inventory
    ? Math.max(0, target.inventory.quantity - target.inventory.reserved)
    : 0;
  if (available < item.quantity) {
    throw outOfStock(
      available === 0 ? 'That option has sold out.' : `Only ${available} left in that option.`,
    );
  }

  const unitPrice = target.priceMinor ?? target.product.basePriceMinor;
  // Changing size keeps whatever was to be engraved, so the line it might
  // collide with is the one carrying the same text — not merely the same
  // variant. Two size-14 signets reading different initials stay two lines.
  const duplicate = await db.cartItem.findUnique({
    where: {
      cartId_variantId_engravingKey: {
        cartId: cart.id,
        variantId: input.variantId,
        engravingKey: item.engravingKey,
      },
    },
  });

  await db.$transaction(async (tx) => {
    if (duplicate) {
      // The target option is already in the bag with the same engraving:
      // merge instead of failing on the unique index.
      const merged = Math.min(
        duplicate.quantity + item.quantity,
        Math.min(available, MAX_LINE_QUANTITY),
      );
      await tx.cartItem.update({
        where: { id: duplicate.id },
        data: { quantity: merged, addedUnitPriceMinor: unitPrice },
      });
      await tx.cartItem.delete({ where: { id: item.id } });
    } else {
      await tx.cartItem.update({
        where: { id: item.id },
        data: { variantId: input.variantId, addedUnitPriceMinor: unitPrice },
      });
    }
  });

  await touchCart(cart.id);
}

export async function removeItem(owner: CartOwner, lineId: string): Promise<void> {
  const cart = await findCart(owner);
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { id: lineId, cartId: cart.id } });
  await touchCart(cart.id);
}

export async function clearCart(owner: CartOwner): Promise<void> {
  const cart = await findCart(owner);
  if (!cart) return;
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
}

export async function applyCoupon(owner: CartOwner, rawCode: string): Promise<void> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw validationError('That does not look like a valid code.');
  }

  const cart = await findCart(owner);
  if (!cart) throw notFound('Your bag is empty.');

  const view = await getCartView(owner);
  if (view.lines.length === 0) throw validationError('Add something to your bag first.');

  // Validate before storing, so an invalid code never sticks to the cart.
  const result = await validateCouponForCart({
    code,
    userId: owner.userId ?? null,
    subtotalMinor: view.subtotalMinor,
  });
  if (!result.ok) throw validationError(result.reason);

  await db.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
}

export async function removeCoupon(owner: CartOwner): Promise<void> {
  const cart = await findCart(owner);
  if (!cart) return;
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
}

/**
 * Merge a guest cart into the signed-in customer's cart.
 *
 * Quantities are summed and then capped by live stock, so merging can never
 * produce a line the customer cannot actually buy. The guest cart is marked
 * CONVERTED rather than deleted, which keeps abandoned-cart analytics honest.
 */
export async function mergeGuestCart(anonymousId: string, userId: string): Promise<void> {
  const guestCart = await db.cart.findFirst({
    where: { anonymousId, status: 'ACTIVE' },
    include: { items: true },
  });
  if (!guestCart) return;

  if (guestCart.items.length === 0) {
    await db.cart.update({
      where: { id: guestCart.id },
      data: { status: 'ABANDONED', anonymousId: null },
    });
    return;
  }

  const userCart = await getOrCreateCart({ userId });

  const variantIds = guestCart.items.map((item) => item.variantId);
  const inventories = await db.inventory.findMany({
    where: { variantId: { in: variantIds } },
    select: { variantId: true, quantity: true, reserved: true, allowBackorder: true },
  });
  const availableByVariant = new Map(
    inventories.map((inv) => [
      inv.variantId,
      inv.allowBackorder ? MAX_LINE_QUANTITY : Math.max(0, inv.quantity - inv.reserved),
    ]),
  );

  await db.$transaction(async (tx) => {
    for (const guestItem of guestCart.items) {
      const available = availableByVariant.get(guestItem.variantId) ?? 0;
      if (available <= 0) continue;

      // Merge on the engraving too: a guest line reading "A & R" must not be
      // folded into an account line reading something else just because both
      // are the same ring.
      const key = {
        cartId: userCart.id,
        variantId: guestItem.variantId,
        engravingKey: guestItem.engravingKey,
      };

      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId_engravingKey: key },
      });

      const combined = (existing?.quantity ?? 0) + guestItem.quantity;
      const quantity = Math.min(combined, available, MAX_LINE_QUANTITY);

      await tx.cartItem.upsert({
        where: { cartId_variantId_engravingKey: key },
        create: {
          cartId: userCart.id,
          variantId: guestItem.variantId,
          quantity,
          addedUnitPriceMinor: guestItem.addedUnitPriceMinor,
          engravingText: guestItem.engravingText,
          engravingKey: guestItem.engravingKey,
        },
        update: { quantity },
      });
    }

    // Carry over a coupon only if the account's cart does not already have one.
    if (guestCart.couponCode && !userCart.couponCode) {
      await tx.cart.update({
        where: { id: userCart.id },
        data: { couponCode: guestCart.couponCode },
      });
    }

    await tx.cart.update({
      where: { id: guestCart.id },
      data: { status: 'CONVERTED', anonymousId: null },
    });
  });
}

export async function markCartStatus(cartId: string, status: CartStatus): Promise<void> {
  await db.cart.update({ where: { id: cartId }, data: { status } });
}

async function touchCart(cartId: string): Promise<void> {
  await db.cart.update({ where: { id: cartId }, data: { expiresAt: expiry() } });
}

/** Lightweight count for the header badge — avoids loading the whole cart. */
export async function getCartItemCount(owner: CartOwner): Promise<number> {
  if (!owner.userId && !owner.anonymousId) return 0;
  const cart = await findCart(owner);
  if (!cart) return 0;
  const result = await db.cartItem.aggregate({
    where: { cartId: cart.id },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}
