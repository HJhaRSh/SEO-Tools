import type { Metadata } from 'next';
import { getToolMetadata, getToolJsonLd } from '@/lib/seo/seoConfig';
import JsonLdScript from '@/components/seo/JsonLdScript';

const SLUG = 'serp-simulator';

export const metadata: Metadata = getToolMetadata(SLUG);

export default function SerpSimulatorLayout({
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
