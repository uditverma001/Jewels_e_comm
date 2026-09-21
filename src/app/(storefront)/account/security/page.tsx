import type { Metadata } from 'next';
import { Monitor } from 'lucide-react';
import { getAuthContext, listUserSessions } from '@/server/auth/session';
import { buildMetadata } from '@/lib/seo';
import { formatDateTime } from '@/lib/utils';
import { ChangePasswordForm } from '@/components/account/change-password-form';
import { SessionList } from '@/components/account/session-list';

export const metadata: Metadata = buildMetadata({
  title: 'Security',
  description: 'Manage your password and signed-in devices.',
  path: '/account/security',
  noIndex: true,
});

export const dynamic = 'force-dynamic';

/**
 * Condense a user-agent into something a person can recognise.
 *
 * Deliberately coarse: the point is "is this me?", not device fingerprinting.
 */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : /Firefox\//.test(userAgent)
            ? 'Firefox'
            : 'Browser';

  const platform = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Macintosh/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown';

  return `${browser} on ${platform}`;
}

export default async function SecurityPage() {
  const { user, sessionId } = await getAuthContext();
  if (!user) return null;

  const sessions = await listUserSessions(user.id);

  return (
    <div className="space-y-12">
      <section aria-labelledby="password">
        <h2 id="password" className="mb-5 text-[1.375rem]">
          Password
        </h2>
        <ChangePasswordForm />
      </section>

      <section aria-labelledby="devices">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="devices" className="text-[1.375rem]">
            Signed-in devices
          </h2>
        </div>

        <SessionList
          sessions={sessions.map((session) => ({
            id: session.id,
            device: describeDevice(session.userAgent),
            ipAddress: session.ipAddress,
            lastUsedAt: formatDateTime(session.lastUsedAt),
            isCurrent: session.id === sessionId,
          }))}
        />

        <p className="mt-4 flex items-start gap-2 text-xs text-stone-500">
          <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          Sessions are stored on our servers, so signing out here ends them immediately — there is
          no token still valid somewhere else.
        </p>
      </section>
    </div>
  );
}
