import { type z, ZodError, type ZodTypeAny } from 'zod';
import { AppError, isAppError } from '@/server/errors';

/**
 * Server Action result envelope.
 *
 * Actions never throw across the RSC boundary: an uncaught error there becomes
 * an opaque digest in production, which tells the customer nothing and tells us
 * nothing either. Instead every action returns a discriminated union that the
 * form can render directly.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string[]> };

export function success(): ActionResult<undefined>;
export function success<T>(data: T): ActionResult<T>;
export function success<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function failure(
  error: string,
  options?: { code?: string; fieldErrors?: Record<string, string[]> },
): ActionResult<never> {
  return { ok: false, error, code: options?.code, fieldErrors: options?.fieldErrors };
}

/**
 * Map a thrown error to a result.
 *
 * `AppError` messages are written for customers and pass through. Anything else
 * is logged with its stack and replaced with a generic message, so an
 * unexpected failure can never leak a query, a path or an internal id.
 */
export function toActionResult(error: unknown): ActionResult<never> {
  if (error instanceof ZodError) {
    return failure('Please check the highlighted fields.', {
      code: 'VALIDATION',
      fieldErrors: flattenZodError(error),
    });
  }

  if (isAppError(error)) {
    return failure(error.message, { code: error.code, fieldErrors: error.fieldErrors });
  }

  console.error('[action] unhandled error', error);
  return failure('Something went wrong on our side. Please try again.', { code: 'INTERNAL' });
}

function flattenZodError(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Parse input at the trust boundary.
 *
 * Throws an `AppError` carrying field-level messages, so callers get the same
 * shape whether validation or business logic rejected the request.
 */
export function parseInput<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('VALIDATION', 'Please check the highlighted fields.', {
      fieldErrors: flattenZodError(result.error),
    });
  }
  return result.data;
}

/** Read a `FormData` into a plain object for Zod. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    const existing = object[key];
    if (existing === undefined) {
      object[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      object[key] = [existing, value];
    }
  }
  return object;
}
