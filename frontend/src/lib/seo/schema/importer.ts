import { SupportedSchemaType } from './types';
import { generateRowId } from './fieldUtils';

export interface ImportResult {
  success: boolean;
  detectedType?: SupportedSchemaType;
  parsedData?: Record<string, unknown>;
  warning?: string;
  error?: string;
}

/**
 * Parse an existing JSON-LD string (which can be raw JSON or enclosed inside a <script> tag)
 * and extract supported form fields.
 */
export function importExistingJsonLd(input: string): ImportResult {
  if (!input || !input.trim()) {
    return { success: false, error: 'Input is empty. Please paste your JSON-LD or script tag.' };
  }

  let cleanInput = input.trim();

  // Strip script tag if present
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
  const match = cleanInput.match(scriptRegex);
  if (match && match[1]) {
    cleanInput = match[1].trim();
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleanInput);
  } catch (err: unknown) {
    return {
      success: false,
      error: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'JSON parse failure'}`,
    };
  }

  // Handle @graph if present
  let entity = parsed;
  if (Array.isArray(parsed['@graph']) && parsed['@graph'].length > 0) {
    entity = parsed['@graph'][0] as Record<string, unknown>;
  }

  const rawType = (entity['@type'] as string) || '';
  if (!rawType) {
    return {
      success: false,
      error: 'No "@type" property found in the imported JSON-LD object.',
    };
  }

  // Normalize type
  let detectedType: SupportedSchemaType | undefined;
  const validTypes: SupportedSchemaType[] = [
    'Article',
    'BlogPosting',
    'NewsArticle',
    'FAQPage',
    'HowTo',
    'LocalBusiness',
    'Restaurant',
    'Organization',
    'Person',
    'Product',
    'Event',
    'BreadcrumbList',
    'Recipe',
    'VideoObject',
    'JobPosting',
    'WebSite',
    'WebPage',
    'SoftwareApplication',
    'Course',
    'Dataset',
    'Service',
  ];

  if (validTypes.includes(rawType as SupportedSchemaType)) {
    detectedType = rawType as SupportedSchemaType;
  } else if (rawType.toLowerCase().includes('restaurant')) {
    detectedType = 'Restaurant';
  } else if (rawType.toLowerCase().includes('article')) {
    detectedType = 'Article';
  } else if (rawType.toLowerCase().includes('business') || rawType.toLowerCase().includes('store')) {
    detectedType = 'LocalBusiness';
  } else {
    return {
      success: false,
      error: `Unsupported or unknown schema @type "${rawType}". Supported types include: ${validTypes.join(', ')}`,
    };
  }

  // Extract relevant fields
  const data: Record<string, unknown> = {};

  if (detectedType === 'Organization') {
    data.name = entity.name || '';
    data.url = entity.url || '';
    data.logo = typeof entity.logo === 'string' ? entity.logo : (entity.logo as Record<string, unknown>)?.url || '';
    data.description = entity.description || '';
    data.email = entity.email || '';
    data.telephone = entity.telephone || '';
    data.foundingDate = entity.foundingDate || '';
    data.sameAs = Array.isArray(entity.sameAs) ? entity.sameAs : [];
  } else if (detectedType === 'LocalBusiness' || detectedType === 'Restaurant') {
    data.subType = detectedType;
    data.name = entity.name || '';
    data.description = entity.description || '';
    data.url = entity.url || '';
    data.telephone = entity.telephone || '';
    data.email = entity.email || '';
    data.priceRange = entity.priceRange || '';
    data.logo = typeof entity.logo === 'string' ? entity.logo : '';
    data.image = typeof entity.image === 'string' ? entity.image : '';
    const addr = (entity.address as Record<string, unknown>) || {};
    data.streetAddress = addr.streetAddress || '';
    data.addressLocality = addr.addressLocality || '';
    data.addressRegion = addr.addressRegion || '';
    data.postalCode = addr.postalCode || '';
    data.addressCountry = addr.addressCountry || '';
    const geo = (entity.geo as Record<string, unknown>) || {};
    data.latitude = geo.latitude !== undefined ? String(geo.latitude) : '';
    data.longitude = geo.longitude !== undefined ? String(geo.longitude) : '';
    data.sameAs = Array.isArray(entity.sameAs) ? entity.sameAs : [];
    if (detectedType === 'Restaurant') {
      data.servesCuisine = entity.servesCuisine || '';
      data.menu = entity.hasMenu || '';
      data.acceptsReservations = entity.acceptsReservations === true;
    }
  } else if (detectedType === 'Article' || detectedType === 'BlogPosting' || detectedType === 'NewsArticle') {
    data.subType = detectedType;
    data.headline = entity.headline || entity.name || '';
    data.description = entity.description || '';
    data.url = entity.url || '';
    data.image = typeof entity.image === 'string' ? entity.image : Array.isArray(entity.image) ? entity.image[0] : '';
    const author = entity.author as Record<string, unknown>;
    if (author) {
      data.authorType = author['@type'] === 'Organization' ? 'Organization' : 'Person';
      data.authorName = author.name || '';
      data.authorUrl = author.url || '';
    }
    const publisher = entity.publisher as Record<string, unknown>;
    if (publisher) {
      data.publisherName = publisher.name || '';
      const pubLogo = publisher.logo as Record<string, unknown>;
      data.publisherLogo = typeof publisher.logo === 'string' ? publisher.logo : pubLogo?.url || '';
    }
    data.datePublished = entity.datePublished || '';
    data.dateModified = entity.dateModified || '';
    data.articleSection = entity.articleSection || '';
    data.keywords = typeof entity.keywords === 'string' ? entity.keywords : Array.isArray(entity.keywords) ? entity.keywords.join(', ') : '';
  } else if (detectedType === 'FAQPage') {
    const rawEntities = Array.isArray(entity.mainEntity) ? entity.mainEntity : [];
    data.questions = rawEntities.map((q: Record<string, unknown>) => {
      const acceptedAnswer = (q.acceptedAnswer as Record<string, unknown>) || {};
      return {
        id: generateRowId(),
        question: q.name || '',
        answer: acceptedAnswer.text || '',
      };
    });
    if ((data.questions as unknown[]).length === 0) {
      data.questions = [{ id: generateRowId(), question: '', answer: '' }];
    }
  } else if (detectedType === 'BreadcrumbList') {
    const rawElements = Array.isArray(entity.itemListElement) ? entity.itemListElement : [];
    data.items = rawElements.map((item: Record<string, unknown>) => ({
      id: generateRowId(),
      name: item.name || '',
      url: item.item || '',
    }));
    if ((data.items as unknown[]).length === 0) {
      data.items = [{ id: generateRowId(), name: '', url: '' }];
    }
  } else if (detectedType === 'Product') {
    data.name = entity.name || '';
    data.description = entity.description || '';
    data.image = typeof entity.image === 'string' ? entity.image : '';
    data.sku = entity.sku || '';
    data.mpn = entity.mpn || '';
    data.gtin = entity.gtin || entity.gtin13 || entity.gtin14 || '';
    const brand = entity.brand as Record<string, unknown>;
    data.brand = typeof entity.brand === 'string' ? entity.brand : brand?.name || '';
    const offers = (entity.offers as Record<string, unknown>) || {};
    data.price = offers.price !== undefined ? String(offers.price) : '';
    data.priceCurrency = offers.priceCurrency || 'USD';
    const avail = (offers.availability as string) || '';
    data.availability = avail.includes('OutOfStock') ? 'OutOfStock' : 'InStock';
  } else {
    // For other types, copy known properties
    data.name = entity.name || '';
    data.description = entity.description || '';
    data.url = entity.url || '';
  }

  // Detect unmapped properties
  const standardIgnored = new Set(['@context', '@type', '@id', '@graph']);
  const entityKeys = Object.keys(entity).filter((k) => !standardIgnored.has(k));
  const mappedKeys = new Set(Object.keys(data));
  const unmapped = entityKeys.filter((k) => !mappedKeys.has(k));
  const warning = unmapped.length > 0
    ? `Notice: Some custom or unmapped properties were omitted from form fields: ${unmapped.join(', ')}.`
    : undefined;

  return {
    success: true,
    detectedType,
    parsedData: data,
    warning,
  };
}
