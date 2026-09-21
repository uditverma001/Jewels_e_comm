'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Expand, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface GalleryMedia {
  id: string;
  url: string;
  alt: string;
  type: 'IMAGE' | 'VIDEO';
  variantId: string | null;
}

/**
 * Product gallery with zoom.
 *
 * Zoom is a CSS background-position transform driven by pointer coordinates —
 * no library, no canvas, and it degrades to a plain image where a pointer does
 * not exist. On touch, the magnifier is skipped entirely and tapping opens the
 * full-screen viewer instead, which is what people actually do on a phone.
 */
export function ProductGallery({
  media,
  productName,
  activeVariantId,
}: {
  media: GalleryMedia[];
  productName: string;
  activeVariantId?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }, []);

  // Selecting a variant that has its own imagery jumps the gallery to it.
  useEffect(() => {
    if (!activeVariantId) return;
    const variantIndex = media.findIndex((item) => item.variantId === activeVariantId);
    if (variantIndex >= 0) setIndex(variantIndex);
  }, [activeVariantId, media]);

  if (media.length === 0) {
    return (
      <div className="bg-ivory-100 flex aspect-[4/5] items-center justify-center text-sm text-stone-400">
        Photography pending
      </div>
    );
  }

  const active = media[Math.min(index, media.length - 1)]!;

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!canHover || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setOrigin(`${Math.max(0, Math.min(100, x))}% ${Math.max(0, Math.min(100, y))}%`);
  }

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row lg:gap-4">
      {media.length > 1 ? (
        <div
          className="no-scrollbar flex gap-2.5 overflow-x-auto lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-visible"
          role="tablist"
          aria-label={`${productName} images`}
        >
          {media.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={itemIndex === index}
              aria-label={`View image ${itemIndex + 1} of ${media.length}`}
              onClick={() => setIndex(itemIndex)}
              className={cn(
                'bg-ivory-100 relative aspect-square w-16 shrink-0 overflow-hidden transition-opacity lg:w-full',
                itemIndex === index
                  ? 'ring-ink-900 ring-1 ring-offset-2 ring-offset-[var(--page)]'
                  : 'opacity-65 hover:opacity-100',
              )}
            >
              <Image src={item.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative flex-1">
        <div
          ref={frameRef}
          role="tabpanel"
          className={cn(
            'bg-ivory-100 relative aspect-[4/5] overflow-hidden',
            canHover && 'cursor-zoom-in',
          )}
          onPointerMove={handlePointerMove}
          onPointerEnter={() => canHover && setZoomed(true)}
          onPointerLeave={() => setZoomed(false)}
          onClick={() => setLightboxOpen(true)}
        >
          {active.type === 'VIDEO' ? (
            <video
              src={active.url}
              controls
              playsInline
              className="h-full w-full object-cover"
              aria-label={active.alt}
            />
          ) : (
            <Image
              key={active.id}
              src={active.url}
              alt={active.alt || productName}
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover transition-transform duration-300 ease-out"
              style={
                zoomed
                  ? { transform: 'scale(2)', transformOrigin: origin }
                  : { transform: 'scale(1)' }
              }
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="text-ink-800 absolute right-3 bottom-3 grid h-10 w-10 place-items-center bg-white/90 backdrop-blur-sm transition-colors hover:bg-white"
          aria-label="View full screen"
        >
          <Expand className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent
          side="center"
          hideClose
          className="bg-ivory-50 h-[92vh] max-w-[95vw] p-0 sm:max-w-4xl"
        >
          <DialogTitle className="sr-only">{productName} — full screen</DialogTitle>

          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 grid h-10 w-10 place-items-center bg-white/90 backdrop-blur-sm"
          >
            <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </button>

          <div className="relative h-full w-full">
            {active.type === 'VIDEO' ? (
              <video
                src={active.url}
                controls
                playsInline
                className="h-full w-full object-contain"
              />
            ) : (
              <Image
                src={active.url}
                alt={active.alt || productName}
                fill
                sizes="95vw"
                className="object-contain"
              />
            )}
          </div>

          {media.length > 1 ? (
            <div className="from-ivory-50 absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t to-transparent p-4">
              {media.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setIndex(itemIndex)}
                  aria-label={`Image ${itemIndex + 1}`}
                  aria-current={itemIndex === index}
                  className={cn(
                    'h-1.5 w-8 transition-colors',
                    itemIndex === index ? 'bg-ink-900' : 'bg-stone-400',
                  )}
                />
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
