import type { Metadata } from 'next';
import ToolsClient from './ToolsClient';
import { getToolsHubMetadata, getToolsHubJsonLd } from '@/lib/seo/seoConfig';
import JsonLdScript from '@/components/seo/JsonLdScript';

export const metadata: Metadata = getToolsHubMetadata();

export default function ToolsPage() {
  const jsonLd = getToolsHubJsonLd();

  return (
    <>
      <JsonLdScript data={jsonLd} />
      <ToolsClient />
    </>
  );
}
