import { KnowledgeGraphEntity } from './types';

/**
 * Normalizes raw Google Knowledge Graph API responses into clean typed KnowledgeGraphEntity items.
 * Google KG returns:
 * {
 *   "@context": { ... },
 *   "@type": "ItemList",
 *   "itemListElement": [
 *     {
 *       "@type": "EntitySearchResult",
 *       "result": {
 *         "@id": "kg:/m/0dl567",
 *         "name": "Google",
 *         "@type": ["Organization", "Corporation", "Thing"],
 *         "description": "Technology company",
 *         "image": { "contentUrl": "...", "url": "..." },
 *         "detailedDescription": {
 *           "articleBody": "...",
 *           "url": "https://en.wikipedia.org/wiki/Google",
 *           "license": "https://en.wikipedia.org/wiki/Wikipedia:Text_of_Creative_Commons_Attribution-ShareAlike_3.0_Unported_License"
 *         },
 *         "url": "https://google.com"
 *       },
 *       "resultScore": 1234.56
 *     }
 *   ]
 * }
 */
export function normalizeGoogleKnowledgeGraphResponse(raw: any): KnowledgeGraphEntity[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const items = Array.isArray(raw.itemListElement) ? raw.itemListElement : [];
  const normalized: KnowledgeGraphEntity[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    const result = item.result;
    if (!result || typeof result !== 'object') continue;

    // 1. ID handling
    const rawId = typeof result['@id'] === 'string' ? result['@id'].trim() : '';
    let id = rawId;
    let mid: string | null = null;

    if (rawId.startsWith('kg:/')) {
      id = rawId;
      mid = rawId.replace('kg:', '');
    } else if (rawId.startsWith('/m/') || rawId.startsWith('/g/')) {
      mid = rawId;
      id = `kg:${rawId}`;
    } else if (rawId) {
      id = rawId;
    }

    // 2. Name
    const name = typeof result.name === 'string' ? result.name.trim() : 'Unnamed Entity';

    // 3. Types
    const rawTypes = result['@type'];
    const types: string[] = [];
    if (Array.isArray(rawTypes)) {
      for (const t of rawTypes) {
        if (typeof t === 'string' && t.trim()) {
          types.push(t.trim());
        }
      }
    } else if (typeof rawTypes === 'string' && rawTypes.trim()) {
      types.push(rawTypes.trim());
    }

    // 4. Short Description
    const description = typeof result.description === 'string' ? result.description.trim() : null;

    // 5. Detailed Description & Licensing
    let detailedDescription: string | null = null;
    let sourceUrl: string | null = null;
    let sourceLicense: string | null = null;

    if (result.detailedDescription && typeof result.detailedDescription === 'object') {
      const dd = result.detailedDescription;
      if (typeof dd.articleBody === 'string' && dd.articleBody.trim()) {
        detailedDescription = dd.articleBody.trim();
      }
      if (typeof dd.url === 'string' && dd.url.trim()) {
        sourceUrl = dd.url.trim();
      }
      if (typeof dd.license === 'string' && dd.license.trim()) {
        sourceLicense = dd.license.trim();
      }
    }

    // 6. Website / URL
    let website: string | null = null;
    if (typeof result.url === 'string' && result.url.trim()) {
      website = result.url.trim();
    }

    // 7. Image
    let image: string | null = null;
    if (result.image && typeof result.image === 'object') {
      if (typeof result.image.contentUrl === 'string' && result.image.contentUrl.trim()) {
        image = result.image.contentUrl.trim();
      } else if (typeof result.image.url === 'string' && result.image.url.trim()) {
        image = result.image.url.trim();
      }
    } else if (typeof result.image === 'string' && result.image.trim()) {
      image = result.image.trim();
    }

    // 8. Result Score
    let resultScore: number | null = null;
    if (typeof item.resultScore === 'number' && !isNaN(item.resultScore)) {
      resultScore = Math.round(item.resultScore * 100) / 100;
    } else if (typeof item.resultScore === 'string') {
      const parsed = parseFloat(item.resultScore);
      if (!isNaN(parsed)) {
        resultScore = Math.round(parsed * 100) / 100;
      }
    }

    normalized.push({
      id: id || (mid ? `kg:${mid}` : 'unknown'),
      mid,
      name,
      types,
      description,
      detailedDescription,
      website,
      image,
      sourceUrl,
      sourceLicense,
      resultScore,
    });
  }

  return normalized;
}
