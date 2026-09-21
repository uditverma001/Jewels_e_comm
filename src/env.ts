import { z } from 'zod';

/**
 * Environment contract.
 *
 * Parsed once at module load so a misconfigured deployment fails at boot with a
 * precise message, rather than at 2am inside a checkout. Anything not prefixed
 * `NEXT_PUBLIC_` must never be imported into a client component — the `server`
 * export below is guarded so that mistake throws.
 */

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const serverSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    APP_URL: z.string().url(),
    DATABASE_URL: z.string().url(),

    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters of random data'),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    DEFAULT_TAX_RATE_BPS: z.coerce.number().int().min(0).max(10_000).default(300),
    CURRENCY: z.literal('INR').default('INR'),
    INVENTORY_RESERVATION_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    FREE_SHIPPING_THRESHOLD_MINOR: z.coerce.number().int().min(0).default(5_000_000),

    PAYMENT_PROVIDER: z.enum(['razorpay', 'fake']).default('fake'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

    STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.string().optional(),

    EMAIL_DRIVER: z.enum(['resend', 'console']).default('console'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Aurelia <no-reply@example.com>'),

    SEED_ADMIN_EMAIL: z.string().email().optional(),
    SEED_ADMIN_PASSWORD: z.string().optional(),
    SEED_CUSTOMER_EMAIL: z.string().email().optional(),
    SEED_CUSTOMER_PASSWORD: z.string().optional(),

    SKIP_ENV_VALIDATION: bool,
  })
  // Production must not silently run on development stand-ins. These are the
  // failure modes that would otherwise only show up as lost money.
  //
  // The checks key off NODE_ENV *and* the app's own origin. `next start`
  // forces NODE_ENV=production even for a local preview, and a rule that made
  // `pnpm build && pnpm start` impossible would simply get weakened by the
  // first person it inconvenienced. A deployment answering on localhost is not
  // a production deployment.
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV !== 'production') return;
    if (isLocalOrigin(cfg.APP_URL)) return;

    if (cfg.PAYMENT_PROVIDER === 'fake') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_PROVIDER'],
        message: 'The fake payment provider cannot be used in production',
      });
    }
    if (cfg.PAYMENT_PROVIDER === 'razorpay') {
      for (const key of [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ] as const) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PAYMENT_PROVIDER=razorpay`,
          });
        }
      }
    }
    if (cfg.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_DRIVER'],
        message:
          'The local storage driver writes to ephemeral disk and cannot be used in production',
      });
    }
    if (cfg.STORAGE_DRIVER === 's3') {
      for (const key of [
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'S3_PUBLIC_URL',
      ] as const) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3`,
          });
        }
      }
    }
    if (cfg.EMAIL_DRIVER === 'resend' && !cfg.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_DRIVER=resend',
      });
    }
    if (cfg.SESSION_SECRET.startsWith('dev-only')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET still holds the development placeholder',
      });
    }
  });

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function isLocalOrigin(appUrl: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(appUrl).hostname);
  } catch {
    return false;
  }
}

function parseServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Server-only configuration. Throws if reached from the browser bundle, which
 * turns "leaked a secret into client JS" from a silent incident into a crash.
 */
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    if (typeof window !== 'undefined') {
      throw new Error(`Attempted to read server env "${prop}" from the browser`);
    }
    cached ??= parseServerEnv();
    return cached[prop as keyof ServerEnv];
  },
});

/** Safe to import anywhere, including client components. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  storeName: process.env.NEXT_PUBLIC_STORE_NAME ?? 'Aurelia',
  razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? '',
} as const;
