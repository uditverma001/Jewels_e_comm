import 'server-only';
import type { UserRole } from '@prisma/client';
import { forbidden, unauthenticated } from '@/server/errors';
import { getAuthContext, type SessionUser } from '@/server/auth/session';

/**
 * Role-based access control.
 *
 * Permissions are compile-time constants rather than database rows: there are
 * three static roles, and a `Role`/`Permission` table pair would add joins to
 * every privileged request in exchange for configurability no requirement asks
 * for. When customer-defined roles arrive, only this file changes.
 */

export const PERMISSIONS = [
  'product:read',
  'product:write',
  'inventory:write',
  'order:read',
  'order:write',
  'order:refund',
  'customer:read',
  'customer:write',
  'coupon:read',
  'coupon:write',
  'review:moderate',
  'analytics:read',
  'media:upload',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const STAFF_PERMISSIONS: readonly Permission[] = [
  'product:read',
  'product:write',
  'inventory:write',
  'order:read',
  'order:write',
  'customer:read',
  'coupon:read',
  'review:moderate',
  'analytics:read',
  'media:upload',
];

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  CUSTOMER: [],
  // Staff run the shop day to day but cannot move money or change accounts.
  STAFF: STAFF_PERMISSIONS,
  ADMIN: PERMISSIONS,
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: UserRole): boolean {
  return role === 'STAFF' || role === 'ADMIN';
}

/** Throws `UNAUTHENTICATED` unless a user is signed in. */
export async function requireUser(): Promise<SessionUser> {
  const { user } = await getAuthContext();
  if (!user) throw unauthenticated();
  return user;
}

/** Throws unless the signed-in user holds the permission. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleHasPermission(user.role, permission)) {
    throw forbidden('Your account does not have permission to perform this action.');
  }
  return user;
}

/** Gate for the whole admin area. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) throw forbidden('Administrator access is required.');
  return user;
}

/**
 * Ownership guard for customer-owned resources.
 *
 * Every account-scoped read goes through this rather than fetching by id and
 * hoping — which is the difference between an IDOR and a 404.
 */
export function assertOwnership(resourceUserId: string | null, actor: SessionUser): void {
  if (resourceUserId && resourceUserId === actor.id) return;
  if (isStaff(actor.role)) return;
  throw forbidden();
}
