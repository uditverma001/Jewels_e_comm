'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { signOutOtherDevicesAction } from '@/app/actions/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pluralise } from '@/lib/utils';

export interface SessionView {
  id: string;
  device: string;
  ipAddress: string | null;
  lastUsedAt: string;
  isCurrent: boolean;
}

export function SessionList({ sessions }: { sessions: SessionView[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const others = sessions.filter((session) => !session.isCurrent).length;

  return (
    <div>
      <ul className="divide-ivory-200 border-ivory-300 divide-y border">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-2 font-medium">
                {session.device}
                {session.isCurrent ? <Badge variant="success">This device</Badge> : null}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                Last used {session.lastUsedAt}
                {session.ipAddress ? ` · ${session.ipAddress}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {others > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await signOutOtherDevicesAction();
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.success(
                `Signed out ${result.data.revoked} other ${pluralise(result.data.revoked, 'device')}.`,
              );
              router.refresh();
            })
          }
        >
          {isPending ? 'Signing out…' : `Sign out ${others} other ${pluralise(others, 'device')}`}
        </Button>
      ) : null}
    </div>
  );
}
