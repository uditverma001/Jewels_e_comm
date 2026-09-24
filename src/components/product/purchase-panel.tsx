'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { addToCartAction } from '@/app/actions/cart';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/product/price';
import { WishlistButton } from '@/components/product/wishlist-button';
import { BackInStock } from '@/components/product/back-in-stock';
import type { ProductDetail, VariantView } from '@/server/catalog/types';
import { cn, pluralise } from '@/lib/utils';

/**
 * Variant selection and add-to-cart.
 *
 * The client can pick and preview, but it never decides anything that matters:
 * the price shown here is informational and the server re-reads price and stock
 * when the item is actually added. An unavailable option is disabled rather
 * than hidden, so a customer can see that their size exists but is sold out.
 */
export function PurchasePanel({
  product,
  inWishlist,
  customerEmail,
  onVariantChange,
}: {
  product: ProductDetail;
  inWishlist: boolean;
  /** Prefills the back-in-stock form for a signed-in customer. */
  customerEmail?: string;
  onVariantChange?: (variantId: string | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);

  /**
   * The mobile sticky bar appears once the real buy button has scrolled away.
   *
   * A phone screen shows the gallery, then the description, then the specs —
   * by which point the only way to buy is to scroll back up. Observing the
   * button itself (rather than a scroll offset) means the bar appears exactly
   * when the control it duplicates is gone, on any screen height.
   */
  const buyButtonRef = useRef<HTMLDivElement | null>(null);
  const [buyButtonVisible, setBuyButtonVisible] = useState(true);

  useEffect(() => {
    const target = buyButtonRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setBuyButtonVisible(entry?.isIntersecting ?? true),
      { rootMargin: '0px 0px -96px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // optionId -> optionValueId
  const [selection, setSelection] = useState<Record<string, string>>(() =>
    initialSelection(product),
  );

  const selectedVariant = useMemo(
    () => findVariant(product.variants, selection, product.options.length),
    [product.variants, product.options.length, selection],
  );

  const needsSelection = product.options.length > 0 && !selectedVariant;

  function chooseOption(optionId: string, valueId: string) {
    const next = { ...selection, [optionId]: valueId };
    setSelection(next);
    setJustAdded(false);
    onVariantChange?.(findVariant(product.variants, next, product.options.length)?.id ?? null);
  }

  /** Send the customer back to the option pickers they still have to answer. */
  function scrollToOptions() {
    buyButtonRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  }

  function addToBag(then?: 'checkout') {
    if (!selectedVariant) {
      toast.error(`Please choose a ${product.options[0]?.name.toLowerCase() ?? 'option'}.`);
      return;
    }

    startTransition(async () => {
      const result = await addToCartAction({ variantId: selectedVariant.id, quantity: 1 });

      if (!result.ok) {
        toast.error(result.error);
        // Stock may have moved under us; refresh so the page tells the truth.
        router.refresh();
        return;
      }

      if (then === 'checkout') {
        router.push('/checkout');
        return;
      }

      setJustAdded(true);
      toast.success(`${product.name} added to your bag`);
      router.refresh();
      setTimeout(() => setJustAdded(false), 2600);
    });
  }

  const displayPrice = selectedVariant?.priceMinor ?? product.priceMinor;
  const displayCompareAt = selectedVariant?.compareAtPriceMinor ?? product.compareAtPriceMinor;
  const available = selectedVariant?.availableQuantity ?? product.totalAvailable;
  const purchasable = selectedVariant ? selectedVariant.isPurchasable : product.totalAvailable > 0;

  return (
    <div className="space-y-6">
      <Price
        priceMinor={displayPrice}
        compareAtPriceMinor={displayCompareAt}
        size="lg"
        showSavings
      />

      <p className="text-xs text-stone-500">Inclusive of GST. Shipping calculated at checkout.</p>

      {product.options.map((option) => (
        <fieldset key={option.id}>
          <legend className="mb-2.5 flex w-full items-baseline justify-between">
            <span className="text-[0.6875rem] font-medium tracking-[0.14em] text-stone-600 uppercase">
              {option.name}
            </span>
            {selectedVariant ? (
              <span className="text-ink-900 text-sm">
                {valueLabel(option, selection[option.id])}
              </span>
            ) : null}
          </legend>

          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const candidate = { ...selection, [option.id]: value.id };
              const variant = findVariant(product.variants, candidate, product.options.length);
              const unavailable = !variant || !variant.isPurchasable;
              const selected = selection[option.id] === value.id;

              return (
                <button
                  key={value.id}
                  type="button"
                  onClick={() => chooseOption(option.id, value.id)}
                  aria-pressed={selected}
                  // Not disabled: a customer should be able to select a sold-out
                  // size and see that it exists rather than wonder why it is
                  // missing. The add button is what refuses.
                  className={cn(
                    'relative min-w-14 border px-4 py-2.5 text-sm transition-colors',
                    selected
                      ? 'border-ink-900 bg-ink-900 text-ivory-50'
                      : 'border-ivory-300 hover:border-ink-900',
                    unavailable && !selected && 'text-stone-400',
                  )}
                >
                  {value.value}
                  {unavailable ? (
                    <span
                      className="pointer-events-none absolute inset-0 grid place-items-center"
                      aria-hidden="true"
                    >
                      <span className="h-px w-[130%] rotate-[-20deg] bg-current opacity-35" />
                    </span>
                  ) : null}
                  {unavailable ? <span className="sr-only"> (sold out)</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div aria-live="polite" className="min-h-6">
        {needsSelection ? (
          <p className="text-sm text-stone-600">
            Choose a {product.options[0]?.name.toLowerCase()} to continue.
          </p>
        ) : !purchasable ? (
          <Badge variant="danger">Sold out</Badge>
        ) : available <= 3 ? (
          <Badge variant="warning">
            Only {available} {pluralise(available, 'left', 'left')} in stock
          </Badge>
        ) : (
          <Badge variant="success">
            <Check className="h-3 w-3" aria-hidden="true" />
            In stock — ships in 2–4 days
          </Badge>
        )}
      </div>

      <div className="space-y-2.5" ref={buyButtonRef}>
        <div className="flex gap-2.5">
          <Button
            size="lg"
            className="flex-1"
            disabled={isPending || !purchasable || needsSelection}
            onClick={() => addToBag()}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : justAdded ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            )}
            {justAdded ? 'Added to bag' : 'Add to bag'}
          </Button>

          <WishlistButton
            productId={product.id}
            productName={product.name}
            initialInWishlist={inWishlist}
            variant="labelled"
            className="shrink-0"
          />
        </div>

        {/*
         * Sold out is the one case where the secondary button should not be
         * "Buy it now": there is nothing to buy. Offering to write when the
         * piece returns is the only useful thing left on the page.
         */}
        {selectedVariant && !purchasable ? (
          <BackInStock
            key={selectedVariant.id}
            variantId={selectedVariant.id}
            variantLabel={product.options.length > 0 ? selectedVariant.label : undefined}
            defaultEmail={customerEmail}
          />
        ) : (
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            disabled={isPending || !purchasable || needsSelection}
            onClick={() => addToBag('checkout')}
          >
            Buy it now
          </Button>
        )}
      </div>

      {/*
       * Mobile sticky buy bar.
       *
       * It mirrors the primary button's disabled logic rather than re-deriving
       * it — two buttons that disagree about whether something is purchasable
       * is worse than one button you have to scroll to.
       *
       * The primary button stays in the DOM while this is showing (it is
       * scrolled away, not unmounted), so the two would otherwise share the
       * accessible name "Add to bag". This one names the piece instead: it is
       * pinned to the viewport, detached from the heading that gives the other
       * one its context, so saying which piece it adds is what that context
       * would have supplied anyway.
       *
       * Hidden entirely when the piece is sold out. The panel above swaps its
       * buy button for the back-in-stock form in that case, and a bar pinned to
       * the bottom of the screen saying "Add to bag" in permanent grey offers
       * nothing — it just hides the page behind a control that cannot be used.
       */}
      {!buyButtonVisible && purchasable ? (
        <div
          className="border-ivory-300 bg-ivory-50/95 animate-slide-up fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 backdrop-blur-sm lg:hidden"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] leading-tight">{product.name}</p>
              <Price priceMinor={displayPrice} compareAtPriceMinor={displayCompareAt} size="sm" />
            </div>
            <Button
              size="lg"
              className="shrink-0"
              aria-label={
                needsSelection
                  ? `Choose an option for ${product.name}`
                  : `Add ${product.name} to bag`
              }
              // Deliberately NOT disabled when an option is still unchosen:
              // from down here the customer cannot see what is missing, so a
              // dead button is a dead end. It takes them back to the picker
              // instead. (Sold out never reaches here — the bar is not
              // rendered at all in that case.)
              disabled={isPending}
              onClick={() => (needsSelection ? scrollToOptions() : addToBag())}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              )}
              {justAdded ? 'Added' : 'Add to bag'}
            </Button>
          </div>
        </div>
      ) : null}

      {selectedVariant ? (
        <p className="text-xs text-stone-500">
          SKU {selectedVariant.sku}
          {selectedVariant.weightGrams ? ` · ${selectedVariant.weightGrams} g` : ''}
        </p>
      ) : null}
    </div>
  );
}

function initialSelection(product: ProductDetail): Record<string, string> {
  // Preselect only when there is no ambiguity, or when exactly one variant can
  // actually be bought. Guessing a ring size for someone is worse than asking.
  const purchasable = product.variants.filter((variant) => variant.isPurchasable);
  if (product.variants.length === 1) return product.variants[0]!.optionSelections;
  if (purchasable.length === 1) return purchasable[0]!.optionSelections;
  return {};
}

function findVariant(
  variants: VariantView[],
  selection: Record<string, string>,
  optionCount: number,
): VariantView | undefined {
  if (optionCount === 0) return variants[0];
  if (Object.keys(selection).length < optionCount) return undefined;

  return variants.find((variant) =>
    Object.entries(selection).every(
      ([optionId, valueId]) => variant.optionSelections[optionId] === valueId,
    ),
  );
}

function valueLabel(option: ProductDetail['options'][number], valueId: string | undefined): string {
  return option.values.find((value) => value.id === valueId)?.value ?? '';
}
