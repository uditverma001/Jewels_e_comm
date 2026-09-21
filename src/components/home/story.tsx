import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function StorySection() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="bg-ivory-200 relative aspect-[5/4] overflow-hidden lg:aspect-[4/5]">
        <Image
          src="/images/placeholders/collection-heritage.svg"
          alt="A goldsmith setting a stone by hand at the Aurelia workbench"
          fill
          loading="lazy"
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="object-cover"
        />
      </div>

      <div className="max-w-lg">
        <p className="eyebrow">Since 1974</p>
        <h2 className="mt-3 text-[1.875rem] lg:text-[2.375rem]">Fifty years at the same bench</h2>
        <div className="mt-5 space-y-4 text-[0.9375rem] leading-relaxed text-stone-600">
          <p>
            Aurelia began as a two-person workshop off Kala Ghoda, making pieces for families who
            came back a generation later. We still make most of what we sell ourselves, and we still
            put the goldsmith&rsquo;s initials inside the shank.
          </p>
          <p>
            That is also why we are careful about what we say. If a stone is treated, the listing
            says so. If a chain is hollow, the listing says so. You should know exactly what you are
            buying before it arrives, not after.
          </p>
        </div>

        <Button asChild variant="outline" className="mt-7">
          <Link href="/about">Read our story</Link>
        </Button>
      </div>
    </div>
  );
}
