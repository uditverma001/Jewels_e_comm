import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import * as cart from '@/server/cart/service';
import { AppError } from '@/server/errors';
import { disconnect, resetDatabase, testDb } from '../helpers/db';
import {
  createCart,
  createCoupon,
  createProduct,
  createShippingMethod,
  createUser,
} from '../helpers/factories';
import { requestContext } from '../helpers/request-context';

beforeEach(async () => {
  await resetDatabase();
  requestContext.reset();
});

afterAll(async () => {
  await disconnect();
});

describe('adding to the bag', () => {
  it('adds a line at the live price', async () => {
    const user = await createUser();
    const { variants } = await createProduct({
      basePriceMinor: 2_500_000,
      variants: [{ label: 'M', quantity: 5 }],
    });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 2 });

    const view = await cart.getCartView({ userId: user.id });
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]!.quantity).toBe(2);
    expect(view.lines[0]!.unitPriceMinor).toBe(2_500_000);
    expect(view.subtotalMinor).toBe(5_000_000);
  });

  it('accumulates quantity when the same variant is added twice', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 2 });

    const view = await cart.getCartView({ userId: user.id });
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]!.quantity).toBe(3);
  });

  it('refuses to add beyond available stock', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 2 }] });

    await expect(
      cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 3 }),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('counts an existing line when checking the stock ceiling', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 2 });
    await expect(
      cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 2 }),
    ).rejects.toMatchObject({ code: 'OUT_OF_STOCK' });
  });

  it('refuses a variant belonging to an archived product', async () => {
    const user = await createUser();
    const { product, variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    await testDb.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });

    await expect(
      cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps at most one active cart per user under concurrent adds', async () => {
    const user = await createUser();
    const { variants } = await createProduct({
      variants: [
        { label: 'A', quantity: 5 },
        { label: 'B', quantity: 5 },
        { label: 'C', quantity: 5 },
      ],
    });

    await Promise.all(
      variants.map((variant) =>
        cart.addItem({ userId: user.id }, { variantId: variant.id, quantity: 1 }),
      ),
    );

    const carts = await testDb.cart.findMany({ where: { userId: user.id, status: 'ACTIVE' } });
    expect(carts).toHaveLength(1);
  });
});

describe('cart issues', () => {
  it('reports a line whose stock dropped below the requested quantity', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 4 });

    await testDb.inventory.update({
      where: { variantId: variants[0]!.id },
      data: { quantity: 2 },
    });

    const view = await cart.getCartView({ userId: user.id });
    expect(view.issues.some((issue) => issue.code === 'QUANTITY_REDUCED')).toBe(true);
    // Priced at what can actually be shipped, not at what was asked for.
    expect(view.lines[0]!.quantity).toBe(2);
  });

  it('reports a price change and prices at the new price', async () => {
    const user = await createUser();
    const { product, variants } = await createProduct({
      basePriceMinor: 1_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });

    await testDb.product.update({
      where: { id: product.id },
      data: { basePriceMinor: 1_400_000 },
    });

    const view = await cart.getCartView({ userId: user.id });
    expect(view.issues.some((issue) => issue.code === 'PRICE_CHANGED')).toBe(true);
    expect(view.lines[0]!.unitPriceMinor).toBe(1_400_000);
    expect(view.lines[0]!.priceChangedFromMinor).toBe(1_000_000);
  });

  it('drops a line whose product was archived and says so', async () => {
    const user = await createUser();
    const { product, variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });

    await testDb.product.update({ where: { id: product.id }, data: { status: 'ARCHIVED' } });

    const view = await cart.getCartView({ userId: user.id });
    expect(view.lines).toHaveLength(0);
    expect(view.issues.some((issue) => issue.code === 'VARIANT_UNAVAILABLE')).toBe(true);
  });

  it('reports a coupon that has since expired and stops discounting', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ code: 'GONESOON' });
    const { variants } = await createProduct({
      basePriceMinor: 5_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });
    await cart.applyCoupon({ userId: user.id }, coupon.code);

    const before = await cart.getCartView({ userId: user.id });
    expect(before.discountMinor).toBe(500_000);

    await testDb.coupon.update({
      where: { id: coupon.id },
      data: { startsAt: new Date(Date.now() - 172_800_000), endsAt: new Date(Date.now() - 1000) },
    });

    const after = await cart.getCartView({ userId: user.id });
    expect(after.discountMinor).toBe(0);
    expect(after.issues.some((issue) => issue.code === 'COUPON_INVALID')).toBe(true);
  });
});

describe('quantity and variant changes', () => {
  it('removes a line when quantity is set to zero', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 2 });

    const view = await cart.getCartView({ userId: user.id });
    await cart.updateQuantity({ userId: user.id }, { lineId: view.lines[0]!.id, quantity: 0 });

    expect((await cart.getCartView({ userId: user.id })).lines).toHaveLength(0);
  });

  it('will not update a line belonging to somebody else', async () => {
    const owner = await createUser();
    const attacker = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });

    await cart.addItem({ userId: owner.id }, { variantId: variants[0]!.id, quantity: 1 });
    await cart.addItem({ userId: attacker.id }, { variantId: variants[0]!.id, quantity: 1 });

    const ownerView = await cart.getCartView({ userId: owner.id });
    const ownerLineId = ownerView.lines[0]!.id;

    await expect(
      cart.updateQuantity({ userId: attacker.id }, { lineId: ownerLineId, quantity: 5 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const unchanged = await cart.getCartView({ userId: owner.id });
    expect(unchanged.lines[0]!.quantity).toBe(1);
  });

  it('swaps a line to another variant of the same product', async () => {
    const user = await createUser();
    const { variants } = await createProduct({
      variants: [
        { label: 'Size 6', quantity: 3 },
        { label: 'Size 7', quantity: 3 },
      ],
    });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });
    const view = await cart.getCartView({ userId: user.id });

    await cart.changeVariant(
      { userId: user.id },
      { lineId: view.lines[0]!.id, variantId: variants[1]!.id },
    );

    const after = await cart.getCartView({ userId: user.id });
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0]!.variantLabel).toBe('Size 7');
  });

  it('merges rather than failing when swapping onto a variant already in the bag', async () => {
    const user = await createUser();
    const { variants } = await createProduct({
      variants: [
        { label: 'Size 6', quantity: 5 },
        { label: 'Size 7', quantity: 5 },
      ],
    });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });
    await cart.addItem({ userId: user.id }, { variantId: variants[1]!.id, quantity: 2 });

    const view = await cart.getCartView({ userId: user.id });
    const sixLine = view.lines.find((line) => line.variantLabel === 'Size 6')!;

    await cart.changeVariant(
      { userId: user.id },
      { lineId: sixLine.id, variantId: variants[1]!.id },
    );

    const after = await cart.getCartView({ userId: user.id });
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0]!.quantity).toBe(3);
  });

  it('refuses to swap to a variant of a different product', async () => {
    const user = await createUser();
    const { variants: first } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });
    const { variants: second } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });

    await cart.addItem({ userId: user.id }, { variantId: first[0]!.id, quantity: 1 });
    const view = await cart.getCartView({ userId: user.id });

    await expect(
      cart.changeVariant(
        { userId: user.id },
        { lineId: view.lines[0]!.id, variantId: second[0]!.id },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('guest cart merge', () => {
  it('combines quantities and converts the guest cart', async () => {
    const user = await createUser();
    const anonymousId = 'visitor-token-1';
    const { variants } = await createProduct({
      variants: [
        { label: 'A', quantity: 10 },
        { label: 'B', quantity: 10 },
      ],
    });

    // Signed-in cart already holds two of variant A.
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 2 });
    // Guest cart holds one of A and three of B.
    await createCart({
      anonymousId,
      items: [
        { variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 },
        { variantId: variants[1]!.id, quantity: 3, addedUnitPriceMinor: 1_000_000 },
      ],
    });

    await cart.mergeGuestCart(anonymousId, user.id);

    const view = await cart.getCartView({ userId: user.id });
    const byLabel = Object.fromEntries(
      view.lines.map((line) => [line.variantLabel, line.quantity]),
    );
    expect(byLabel).toEqual({ A: 3, B: 3 });

    const guestCart = await testDb.cart.findFirst({ where: { anonymousId } });
    expect(guestCart).toBeNull();
    const converted = await testDb.cart.findFirst({ where: { status: 'CONVERTED' } });
    expect(converted).not.toBeNull();
  });

  it('caps a merged quantity at live stock rather than creating an unbuyable line', async () => {
    const user = await createUser();
    const anonymousId = 'visitor-token-2';
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 3 }] });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 2 });
    await createCart({
      anonymousId,
      items: [{ variantId: variants[0]!.id, quantity: 3, addedUnitPriceMinor: 1_000_000 }],
    });

    await cart.mergeGuestCart(anonymousId, user.id);

    const view = await cart.getCartView({ userId: user.id });
    expect(view.lines[0]!.quantity).toBe(3);
    expect(view.issues).toHaveLength(0);
  });

  it('skips a guest line that has sold out entirely', async () => {
    const user = await createUser();
    const anonymousId = 'visitor-token-3';
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 0 }] });

    await createCart({
      anonymousId,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 1_000_000 }],
    });

    await cart.mergeGuestCart(anonymousId, user.id);
    const view = await cart.getCartView({ userId: user.id });
    expect(view.lines).toHaveLength(0);
  });

  it('carries a guest coupon over only when the account cart has none', async () => {
    const user = await createUser();
    const guestCoupon = await createCoupon({ code: 'GUESTCODE', usageLimitPerUser: 5 });
    const userCoupon = await createCoupon({ code: 'USERCODE', usageLimitPerUser: 5 });
    const { variants } = await createProduct({
      basePriceMinor: 5_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });

    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });
    await cart.applyCoupon({ userId: user.id }, userCoupon.code);

    await createCart({
      anonymousId: 'visitor-token-4',
      couponCode: guestCoupon.code,
      items: [{ variantId: variants[0]!.id, quantity: 1, addedUnitPriceMinor: 5_000_000 }],
    });

    await cart.mergeGuestCart('visitor-token-4', user.id);

    const view = await cart.getCartView({ userId: user.id });
    expect(view.couponCode).toBe('USERCODE');
  });

  it('does nothing when there is no guest cart', async () => {
    const user = await createUser();
    await expect(cart.mergeGuestCart('no-such-visitor', user.id)).resolves.toBeUndefined();
  });
});

describe('coupons on the cart', () => {
  it('rejects a code that does not exist', async () => {
    const user = await createUser();
    const { variants } = await createProduct({ variants: [{ label: 'M', quantity: 5 }] });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });

    await expect(cart.applyCoupon({ userId: user.id }, 'NOPE123')).rejects.toBeInstanceOf(AppError);

    const view = await cart.getCartView({ userId: user.id });
    expect(view.couponCode).toBeNull();
  });

  it('rejects a code below its minimum subtotal', async () => {
    const user = await createUser();
    await createCoupon({ code: 'BIGSPEND', minSubtotalMinor: 10_000_000 });
    const { variants } = await createProduct({
      basePriceMinor: 1_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });

    await expect(cart.applyCoupon({ userId: user.id }, 'BIGSPEND')).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('honours a free-shipping coupon without discounting the lines', async () => {
    const user = await createUser();
    await createShippingMethod({ code: 'express-test', baseRateMinor: 60_000 });
    await createCoupon({
      code: 'FREESHIPX',
      type: 'FREE_SHIPPING',
      value: 0,
      usageLimitPerUser: 5,
    });

    const { variants } = await createProduct({
      basePriceMinor: 2_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });
    await cart.addItem({ userId: user.id }, { variantId: variants[0]!.id, quantity: 1 });
    await cart.applyCoupon({ userId: user.id }, 'FREESHIPX');

    const view = await cart.getCartView(
      { userId: user.id },
      { shippingMethodCode: 'express-test' },
    );
    expect(view.shippingMinor).toBe(0);
    expect(view.shippingWaived).toBe(true);
    expect(view.discountMinor).toBe(0);
  });

  it('refuses a single-use code to a guest, who cannot be counted', async () => {
    await createCoupon({ code: 'ONEPERUSER', usageLimitPerUser: 1 });
    const { variants } = await createProduct({
      basePriceMinor: 5_000_000,
      variants: [{ label: 'M', quantity: 5 }],
    });
    await cart.addItem({ anonymousId: 'guest-1' }, { variantId: variants[0]!.id, quantity: 1 });

    await expect(cart.applyCoupon({ anonymousId: 'guest-1' }, 'ONEPERUSER')).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
