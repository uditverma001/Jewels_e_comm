/**
 * Domain errors.
 *
 * Services throw these; the thin HTTP/action adapters map them to responses.
 * The distinction that matters: `AppError` messages are written for customers
 * and are safe to display, whereas anything else is an unexpected failure whose
 * message must never reach the browser.
 */

export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OUT_OF_STOCK'
  | 'RATE_LIMITED'
  | 'PAYMENT_FAILED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  RATE_LIMITED: 429,
  PAYMENT_FAILED: 402,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Field-level messages, shaped for form rendering. */
  readonly fieldErrors?: Record<string, string[]>;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { fieldErrors?: Record<string, string[]>; details?: unknown; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fieldErrors = options?.fieldErrors;
    this.details = options?.details;
  }
}

export const validationError = (
  message: string,
  fieldErrors?: Record<string, string[]>,
): AppError => new AppError('VALIDATION', message, { fieldErrors });

export const unauthenticated = (message = 'Please sign in to continue.'): AppError =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this resource.'): AppError =>
  new AppError('FORBIDDEN', message);

export const notFound = (message = 'We could not find what you were looking for.'): AppError =>
  new AppError('NOT_FOUND', message);

export const conflict = (message: string): AppError => new AppError('CONFLICT', message);

export const outOfStock = (message: string): AppError => new AppError('OUT_OF_STOCK', message);

export const rateLimited = (message = 'Too many attempts. Please try again shortly.'): AppError =>
  new AppError('RATE_LIMITED', message);

export const paymentFailed = (message: string): AppError => new AppError('PAYMENT_FAILED', message);

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Message that is safe to render. Unexpected errors are deliberately flattened
 * to a generic string so stack traces and SQL never leak to a customer.
 */
export function toDisplayMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  return 'Something went wrong on our side. Please try again.';
}
