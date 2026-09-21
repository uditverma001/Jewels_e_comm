'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { moderateReviewAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';

export function ReviewModeration({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function moderate(status: 'APPROVED' | 'REJECTED') {
    startTransition(async () => {
      const result = await moderateReviewAction({ reviewId, status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(status === 'APPROVED' ? 'Review published' : 'Review rejected');
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2.5">
      <Button size="sm" disabled={isPending} onClick={() => moderate('APPROVED')}>
        <Check className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        Publish
      </Button>
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => moderate('REJECTED')}>
        <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        Reject
      </Button>
    </div>
  );
}
