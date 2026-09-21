import { z } from 'zod';

/**
 * Auth input contracts. These are the whitelist: nothing reaches Prisma that
 * has not passed through one of these schemas, which is what makes mass
 * assignment impossible rather than merely unlikely.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Enter a valid email address.');

/**
 * Length is the dominant factor in password strength; composition rules mostly
 * push people toward predictable substitutions. We require a genuinely long
 * password and reject the handful of obvious strings.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'Passwords cannot exceed 200 characters.')
  .refine((value) => value.trim().length >= 10, 'Password cannot be mostly whitespace.')
  .refine(
    (value) => !/^(password|12345678|qwertyui|aurelia)/i.test(value),
    'Choose something less predictable.',
  );

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Required.')
  .max(80)
  .regex(/^[\p{L}\p{M}'\-.\s]+$/u, 'Use letters only.');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[0-9\s-]{7,15}$/, 'Enter a valid phone number.');

export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional().or(z.literal('')),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional().or(z.literal('')),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
