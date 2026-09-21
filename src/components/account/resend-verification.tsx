'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { resendVerificationAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

export function ResendVerification() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending || sent}
      className="shrink-0"
      onClick={() =>
        startTransition(async () => {
          const result = await resendVerificationAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          setSent(true);
          toast.success('Verification email sent. Check your inbox.');
        })
      }
    >
      {sent ? 'Email sent' : isPending ? 'Sending…' : 'Resend verification'}
    </Button>
  );
}
