import Link from 'next/link';
import { Mail, MapPin, Phone } from 'lucide-react';
import { getNavigation } from '@/server/catalog/service';
import { SITE } from '@/lib/seo';
import { NewsletterForm } from './newsletter-form';

/**
 * Brand marks were removed from lucide in v1, so the Instagram glyph is
 * inlined rather than substituted with an unrelated icon.
 */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SUPPORT_LINKS = [
  // First in the help column: "where is my order" is the commonest reason
  // anyone reads a footer, and a guest has no account link to follow.
  { href: '/orders/track', label: 'Track your order' },
  { href: '/help/shipping', label: 'Shipping & delivery' },
  { href: '/help/returns', label: 'Returns & exchanges' },
  { href: '/help/care', label: 'Jewellery care' },
  { href: '/help/sizing', label: 'Size guide' },
  { href: '/help/contact', label: 'Contact us' },
];

const COMPANY_LINKS = [
  { href: '/about', label: 'Our story' },
  { href: '/about#craft', label: 'Craftsmanship' },
  { href: '/help/authenticity', label: 'Certification' },
  { href: '/legal/privacy', label: 'Privacy policy' },
  { href: '/legal/terms', label: 'Terms of service' },
];

export async function Footer() {
  const navigation = await getNavigation();

  return (
    <footer className="border-ivory-300 bg-ivory-100 mt-24 border-t">
      <div className="container-page">
        <div className="grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4 lg:py-16">
          <div className="lg:col-span-1">
            <h2 className="font-display text-xl">Join the list</h2>
            <p className="mt-2 max-w-xs text-sm text-stone-600">
              New pieces, private previews and the occasional note from the atelier. No more than
              twice a month.
            </p>
            <div className="mt-5">
              <NewsletterForm />
            </div>
          </div>

          <nav aria-labelledby="footer-shop">
            <h2 id="footer-shop" className="eyebrow mb-4">
              Shop
            </h2>
            <ul className="space-y-2.5 text-sm">
              {navigation.categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/jewellery/${category.slug}`}
                    className="hover:text-ink-900 text-stone-600 underline-offset-4 transition-colors hover:underline"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/shop?onSale=1"
                  className="hover:text-ink-900 text-stone-600 underline-offset-4 transition-colors hover:underline"
                >
                  Sale
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="footer-support">
            <h2 id="footer-support" className="eyebrow mb-4">
              Support
            </h2>
            <ul className="space-y-2.5 text-sm">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-ink-900 text-stone-600 underline-offset-4 transition-colors hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-company">
            <h2 id="footer-company" className="eyebrow mb-4">
              {SITE.name}
            </h2>
            <ul className="space-y-2.5 text-sm">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-ink-900 text-stone-600 underline-offset-4 transition-colors hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <ul className="mt-6 space-y-2.5 text-sm text-stone-600">
              <li className="flex items-start gap-2">
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span>Kala Ghoda, Mumbai 400001</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <a href="tel:+912212345678" className="hover:text-ink-900">
                  +91 22 1234 5678
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <a href="mailto:care@aurelia.example" className="hover:text-ink-900">
                  care@aurelia.example
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="border-ivory-300 flex flex-col items-center justify-between gap-4 border-t py-6 sm:flex-row">
          <p className="text-xs text-stone-500">
            © {new Date().getFullYear()} {SITE.name}. BIS-hallmarked. GST-registered.
          </p>
          <div className="flex items-center gap-5">
            <a
              href="https://instagram.com"
              rel="noopener noreferrer nofollow"
              target="_blank"
              aria-label="Instagram"
              className="hover:text-ink-900 text-stone-500 transition-colors"
            >
              <InstagramIcon className="h-4 w-4" />
            </a>
            <p className="text-xs text-stone-500">Prices in INR, inclusive of applicable duties.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
