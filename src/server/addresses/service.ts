import 'server-only';
import { db } from '@/lib/db';
import { conflict, notFound } from '@/server/errors';
import type { AddressInput } from '@/server/checkout/schema';

/**
 * Saved addresses.
 *
 * Every read and write is scoped by `userId` in the query itself, never checked
 * afterwards — the difference between a private address book and an IDOR.
 *
 * Deletion is soft, because a hard delete would break anything that still
 * follows the relation, and because an address is a small, low-churn record
 * whose history occasionally matters to support.
 */

const MAX_ADDRESSES = 10;

export interface SaveAddressInput extends AddressInput {
  label?: string;
  isDefault?: boolean;
}

export async function listAddresses(userId: string) {
  return db.address.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function createAddress(userId: string, input: SaveAddressInput) {
  const count = await db.address.count({ where: { userId, deletedAt: null } });
  if (count >= MAX_ADDRESSES) {
    throw conflict(`You can save up to ${MAX_ADDRESSES} addresses.`);
  }

  // The first address a customer saves is their default, whatever they ticked.
  const shouldBeDefault = input.isDefault || count === 0;

  return db.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return tx.address.create({
      data: {
        userId,
        label: input.label || null,
        fullName: input.fullName,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2 || null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        isDefault: shouldBeDefault,
      },
    });
  });
}

export async function updateAddress(userId: string, addressId: string, input: SaveAddressInput) {
  const existing = await db.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw notFound('That address no longer exists.');

  return db.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    }
    return tx.address.update({
      where: { id: addressId },
      data: {
        label: input.label || null,
        fullName: input.fullName,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2 || null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        ...(input.isDefault ? { isDefault: true } : {}),
      },
    });
  });
}

export async function deleteAddress(userId: string, addressId: string): Promise<void> {
  const existing = await db.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
    select: { id: true, isDefault: true },
  });
  if (!existing) throw notFound('That address no longer exists.');

  await db.$transaction(async (tx) => {
    await tx.address.update({
      where: { id: addressId },
      data: { deletedAt: new Date(), isDefault: false },
    });

    // Never leave the customer without a default.
    if (existing.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (next) {
        await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    }
  });
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<void> {
  const existing = await db.address.findFirst({
    where: { id: addressId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw notFound('That address no longer exists.');

  await db.$transaction([
    db.address.updateMany({ where: { userId }, data: { isDefault: false } }),
    db.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
}
