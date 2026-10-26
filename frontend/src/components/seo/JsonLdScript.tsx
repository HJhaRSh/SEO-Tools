import React from 'react';

interface JsonLdScriptProps {
  data: Record<string, any>;
}

/**
 * Reusable Server Component for rendering valid JSON-LD structured data.
 * Replaces '<' characters with Unicode escape sequence to prevent XSS breakout.
 */
export default function JsonLdScript({ data }: JsonLdScriptProps) {
  const jsonString = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  );
}
