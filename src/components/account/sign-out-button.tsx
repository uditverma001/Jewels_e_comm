'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await logoutAction();
          router.push('/');
          router.refresh();
        })
      }
    >
      <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      {isPending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
