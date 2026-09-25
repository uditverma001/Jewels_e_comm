import { z } from 'zod';
import { emailSchema, phoneSchema } from '@/server/auth/schema';

/**
 * Checkout contracts.
 *
 * Note what is NOT here: no prices, no totals, no discount amounts. The client
 * submits an address, a delivery choice and a coupon *code* — never a number
 * that affects what is charged. Everything monetary is recomputed on the
 * server from the database.
 */

/** Indian PIN codes are exactly six digits and never start with zero. */
export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code.');

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export const addressInputSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the recipient’s full name.').max(120),
  phone: phoneSchema,
  line1: z.string().trim().min(4, 'Enter a street address.').max(200),
  line2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter a city.').max(80),
  state: z.enum(INDIAN_STATES, { errorMap: () => ({ message: 'Choose a state.' }) }),
  postalCode: postalCodeSchema,
  // Single-market storefront: shipping outside India is not offered, and
  // accepting a country code we cannot ship to would be dishonest.
  country: z.literal('IN').default('IN'),
});

export type AddressInput = z.infer<typeof addressInputSchema>;

export const saveAddressSchema = addressInputSchema.extend({
  label: z.string().trim().max(40).optional().or(z.literal('')),
  isDefault: z.coerce.boolean().optional(),
});

export const checkoutSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  shippingAddress: addressInputSchema,
  /** Omitted means "same as shipping". */
  billingAddress: addressInputSchema.optional(),
  shippingMethodCode: z.string().trim().min(1).max(40),
  customerNote: z.string().trim().max(500).optional().or(z.literal('')),

  /**
   * Complimentary gift packaging. Free, as it is at every jeweller worth
   * buying from, which is also why it does not touch `priceOrder` — a charge
   * would have to go through the pricing engine rather than be added here.
   */
  giftWrap: z.coerce.boolean().optional(),
  /**
   * Written onto a card by hand. Newlines are collapsed because the card is a
   * single field, and control characters are stripped because this string is
   * printed by the packing bench.
   */
  giftMessage: z
    .string()
    .trim()
    .max(200, 'A gift message can be up to 200 characters.')
    .transform((value) => value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' '))
    .optional()
    .or(z.literal('')),
  /** Existing saved address chosen instead of a typed one. */
  shippingAddressId: z.string().min(1).max(40).optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const verifyPaymentSchema = z.object({
  orderId: z.string().min(1).max(40),
  providerOrderId: z.string().min(1).max(120),
  providerPaymentId: z.string().min(1).max(120),
  signature: z.string().min(16).max(256),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const abandonCheckoutSchema = z.object({
  orderId: z.string().min(1).max(40),
});

export const quoteCheckoutSchema = z.object({
  shippingMethodCode: z.string().trim().min(1).max(40),
});
