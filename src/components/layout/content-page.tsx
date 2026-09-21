import type { ContentPage } from '@/content/pages';
import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { formatDate } from '@/lib/utils';

/**
 * Editorial page shell.
 *
 * A single measure-constrained column: these pages are read, not scanned, and
 * a 65-character line is the whole design decision.
 */
export function ContentPageView({ page, crumbs }: { page: ContentPage; crumbs: Crumb[] }) {
  return (
    <div className="container-page pb-20">
      <Breadcrumbs crumbs={crumbs} />

      <article className="mx-auto max-w-2xl pt-4">
        <header>
          <h1 className="text-[2rem] lg:text-[2.5rem]">{page.title}</h1>
          <p className="mt-3 text-[1.0625rem] leading-relaxed text-stone-600">{page.summary}</p>
        </header>

        <div className="mt-10 space-y-10">
          {page.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-[1.375rem]">{section.heading}</h2>
              <div className="mt-3 space-y-3.5">
                {section.body.map((paragraph, index) => (
                  <p key={index} className="text-[0.9375rem] leading-relaxed text-stone-700">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="border-ivory-300 mt-12 border-t pt-5">
          <p className="text-xs text-stone-500">Last updated {formatDate(page.updatedAt)}</p>
        </footer>
      </article>
    </div>
  );
}
