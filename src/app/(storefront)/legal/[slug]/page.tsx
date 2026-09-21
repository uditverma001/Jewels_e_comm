import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LEGAL_PAGES, findContentPage } from '@/content/pages';
import { buildMetadata } from '@/lib/seo';
import { ContentPageView } from '@/components/layout/content-page';

export function generateStaticParams() {
  return LEGAL_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findContentPage('legal', slug);
  if (!page) return { title: 'Not found' };

  return buildMetadata({ title: page.title, description: page.summary, path: `/legal/${slug}` });
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findContentPage('legal', slug);
  if (!page) notFound();

  return <ContentPageView page={page} crumbs={[{ label: page.title, href: `/legal/${slug}` }]} />;
}
