/**
 * `server-only` throws when it is loaded outside the Next.js server bundler.
 * Vitest and maintenance scripts run the same modules directly, so they alias
 * the package to this no-op. The guard still does its real job in the app
 * build, which is the only place it matters.
 */
export {};
