'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertSameOrigin } from '@/server/auth/csrf';
import { requireUser } from '@/server/rbac';
import { saveAddressSchema } from '@/server/checkout/schema';
import * as addresses from '@/server/addresses/service';
import { parseInput, success, toActionResult, type ActionResult } from '@/server/action-result';

const addressIdSchema = z.object({ addressId: z.string().min(1).max(40) });
const updateSchema = saveAddressSchema.extend({ addressId: z.string().min(1).max(40) });

export async function createAddressAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const data = parseInput(saveAddressSchema, input);

    await addresses.createAddress(user.id, data);
    revalidatePath('/account/addresses');
    revalidatePath('/checkout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateAddressAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const { addressId, ...data } = parseInput(updateSchema, input);

    await addresses.updateAddress(user.id, addressId, data);
    revalidatePath('/account/addresses');
    revalidatePath('/checkout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteAddressAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const { addressId } = parseInput(addressIdSchema, input);

    await addresses.deleteAddress(user.id, addressId);
    revalidatePath('/account/addresses');
    revalidatePath('/checkout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}

export async function setDefaultAddressAction(input: unknown): Promise<ActionResult> {
  try {
    await assertSameOrigin();
    const user = await requireUser();
    const { addressId } = parseInput(addressIdSchema, input);

    await addresses.setDefaultAddress(user.id, addressId);
    revalidatePath('/account/addresses');
    revalidatePath('/checkout');
    return success();
  } catch (error) {
    return toActionResult(error);
  }
}
