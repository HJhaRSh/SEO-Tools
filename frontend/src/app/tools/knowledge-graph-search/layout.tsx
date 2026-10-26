import type { Metadata } from 'next';
import { getToolMetadata, getToolJsonLd } from '@/lib/seo/seoConfig';
import JsonLdScript from '@/components/seo/JsonLdScript';

const SLUG = 'knowledge-graph-search';

export const metadata: Metadata = getToolMetadata(SLUG);

export default function KnowledgeGraphSearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = getToolJsonLd(SLUG);

  return (
    <>
      <JsonLdScript data={jsonLd} />
      {children}
    </>
  );
}
