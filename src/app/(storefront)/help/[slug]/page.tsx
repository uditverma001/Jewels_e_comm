import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HELP_PAGES, findContentPage } from '@/content/pages';
import { buildMetadata } from '@/lib/seo';
import { ContentPageView } from '@/components/layout/content-page';

export function generateStaticParams() {
  return HELP_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findContentPage('help', slug);
  if (!page) return { title: 'Not found' };

  return buildMetadata({ title: page.title, description: page.summary, path: `/help/${slug}` });
}

export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findContentPage('help', slug);
  if (!page) notFound();

  return (
    <ContentPageView
      page={page}
      crumbs={[
        { label: 'Help', href: '/help/contact' },
        { label: page.title, href: `/help/${slug}` },
      ]}
    />
  );
}
