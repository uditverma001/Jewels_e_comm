'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { NavigationCategory } from '@/server/catalog/service';
import { cn } from '@/lib/utils';

export function MobileNav({
  categories,
  collections,
  isSignedIn,
}: {
  categories: NavigationCategory[];
  collections: { name: string; slug: string }[];
  isSignedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-ink-800 grid h-10 w-10 place-items-center lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="right" hideClose className="max-w-[88vw] sm:max-w-sm">
          <DialogTitle className="sr-only">Menu</DialogTitle>

          <div className="border-ivory-300 flex items-center justify-between border-b px-5 py-4">
            <span className="eyebrow">Menu</span>
            <button type="button" onClick={close} aria-label="Close menu" className="p-2">
              <X className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto overscroll-contain" aria-label="Main">
            <ul className="divide-ivory-200 divide-y">
              {categories.map((category) => {
                const isOpen = expanded === category.id;
                return (
                  <li key={category.id}>
                    {category.children.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : category.id)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between px-5 py-4 text-left"
                        >
                          <span className="font-display text-lg">{category.name}</span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 text-stone-500 transition-transform duration-200',
                              isOpen && 'rotate-180',
                            )}
                            aria-hidden="true"
                          />
                        </button>
                        {isOpen ? (
                          <ul className="bg-ivory-100 pb-2">
                            <li>
                              <Link
                                href={`/jewellery/${category.slug}`}
                                onClick={close}
                                className="block px-5 py-2.5 text-sm text-stone-600"
                              >
                                All {category.name}
                              </Link>
                            </li>
                            {category.children.map((child) => (
                              <li key={child.id}>
                                <Link
                                  href={`/jewellery/${child.slug}`}
                                  onClick={close}
                                  className="block px-5 py-2.5 text-sm text-stone-600"
                                >
                                  {child.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    ) : (
                      <Link
                        href={`/jewellery/${category.slug}`}
                        onClick={close}
                        className="font-display block px-5 py-4 text-lg"
                      >
                        {category.name}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>

            {collections.length > 0 ? (
              <div className="border-ivory-300 border-t px-5 py-5">
                <p className="eyebrow mb-3">Collections</p>
                <ul className="space-y-2.5">
                  {collections.map((collection) => (
                    <li key={collection.slug}>
                      <Link
                        href={`/collections/${collection.slug}`}
                        onClick={close}
                        className="text-sm text-stone-600"
                      >
                        {collection.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </nav>

          <div className="border-ivory-300 border-t px-5 py-5">
            <Link
              href={isSignedIn ? '/account' : '/sign-in'}
              onClick={close}
              className="block text-sm font-medium"
            >
              {isSignedIn ? 'My account' : 'Sign in / Register'}
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
