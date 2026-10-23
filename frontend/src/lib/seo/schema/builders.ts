import {
  ArticleFormState,
  BreadcrumbFormState,
  CourseFormState,
  DatasetFormState,
  EventFormState,
  FaqFormState,
  HowToFormState,
  ImageFormState,
  JobPostingFormState,
  LocalBusinessFormState,
  OrganizationFormState,
  PersonFormState,
  ProductFormState,
  RecipeFormState,
  ServiceFormState,
  SoftwareAppFormState,
  SupportedSchemaType,
  VideoFormState,
  WebPageFormState,
  WebSiteFormState,
} from './types';
import { formatIsoDuration, parseCleanNumber } from './fieldUtils';

/**
 * Remove undefined, null, empty string, and empty arrays from plain objects so that untouched optional fields are never emitted.
 */
export function cleanObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        result[key] = trimmed;
      }
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        result[key] = value;
      }
      continue;
    }
    if (typeof value === 'object') {
      const cleanedNested = cleanObject(value as Record<string, unknown>);
      if (Object.keys(cleanedNested).length > 0) {
        result[key] = cleanedNested;
      }
      continue;
    }
    result[key] = value;
  }

  return result as Partial<T>;
}

// ----------------------------------------------------
// BUILDERS FOR EACH SCHEMA TYPE
// ----------------------------------------------------

export function buildArticleSchema(data: ArticleFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': data.subType || 'Article',
  };

  if (data.headline?.trim()) schema.headline = data.headline.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.url?.trim()) schema.url = data.url.trim();
  if (data.image?.trim()) schema.image = data.image.trim();

  if (data.authorName?.trim()) {
    schema.author = cleanObject({
      '@type': data.authorType || 'Person',
      name: data.authorName.trim(),
      url: data.authorUrl?.trim() || undefined,
    });
  }

  if (data.publisherName?.trim() || data.publisherLogo?.trim()) {
    const publisher: Record<string, unknown> = {
      '@type': 'Organization',
      name: data.publisherName?.trim() || undefined,
    };
    if (data.publisherLogo?.trim()) {
      publisher.logo = {
        '@type': 'ImageObject',
        url: data.publisherLogo.trim(),
      };
    }
    schema.publisher = cleanObject(publisher);
  }

  if (data.datePublished?.trim()) schema.datePublished = data.datePublished.trim();
  if (data.dateModified?.trim()) schema.dateModified = data.dateModified.trim();

  if (data.mainEntityOfPage?.trim()) {
    schema.mainEntityOfPage = {
      '@type': 'WebPage',
      '@id': data.mainEntityOfPage.trim(),
    };
  } else if (data.url?.trim()) {
    schema.mainEntityOfPage = {
      '@type': 'WebPage',
      '@id': data.url.trim(),
    };
  }

  if (data.articleSection?.trim()) schema.articleSection = data.articleSection.trim();
  if (data.keywords?.trim()) schema.keywords = data.keywords.trim();
  if (data.inLanguage?.trim()) schema.inLanguage = data.inLanguage.trim();

  return cleanObject(schema);
}

export function buildFaqSchema(data: FaqFormState): Record<string, unknown> {
  const questions = (data.questions || [])
    .filter((q) => q.question?.trim() || q.answer?.trim())
    .map((q) => ({
      '@type': 'Question',
      name: q.question?.trim() || '',
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer?.trim() || '',
      },
    }));

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions,
  };

  return cleanObject(schema);
}

export function buildHowToSchema(data: HowToFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.image?.trim()) schema.image = data.image.trim();

  const isoDuration = formatIsoDuration(data.totalTime);
  if (isoDuration) {
    schema.totalTime = isoDuration;
  }

  if (data.estimatedCost?.trim()) {
    schema.estimatedCost = cleanObject({
      '@type': 'MonetaryAmount',
      currency: data.costCurrency?.trim() || 'USD',
      value: parseCleanNumber(data.estimatedCost) ?? data.estimatedCost.trim(),
    });
  }

  const cleanTools = (data.tools || [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((toolName) => ({
      '@type': 'HowToTool',
      name: toolName,
    }));
  if (cleanTools.length > 0) {
    schema.tool = cleanTools;
  }

  const cleanSupplies = (data.supplies || [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((supplyName) => ({
      '@type': 'HowToSupply',
      name: supplyName,
    }));
  if (cleanSupplies.length > 0) {
    schema.supply = cleanSupplies;
  }

  const steps = (data.steps || [])
    .filter((step) => step.name?.trim() || step.text?.trim())
    .map((step, idx) =>
      cleanObject({
        '@type': 'HowToStep',
        position: idx + 1,
        name: step.name?.trim() || undefined,
        text: step.text?.trim() || undefined,
        url: step.url?.trim() || undefined,
        image: step.image?.trim() || undefined,
      })
    );

  if (steps.length > 0) {
    schema.step = steps;
  }

  return cleanObject(schema);
}

export function buildLocalBusinessSchema(data: LocalBusinessFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': data.subType || 'LocalBusiness',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.url?.trim()) schema.url = data.url.trim();
  if (data.telephone?.trim()) schema.telephone = data.telephone.trim();
  if (data.email?.trim()) schema.email = data.email.trim();
  if (data.priceRange?.trim()) schema.priceRange = data.priceRange.trim();
  if (data.logo?.trim()) schema.logo = data.logo.trim();
  if (data.image?.trim()) schema.image = data.image.trim();
  if (data.areaServed?.trim()) schema.areaServed = data.areaServed.trim();

  // Nested PostalAddress
  if (
    data.streetAddress?.trim() ||
    data.addressLocality?.trim() ||
    data.addressRegion?.trim() ||
    data.postalCode?.trim() ||
    data.addressCountry?.trim()
  ) {
    schema.address = cleanObject({
      '@type': 'PostalAddress',
      streetAddress: data.streetAddress?.trim() || undefined,
      addressLocality: data.addressLocality?.trim() || undefined,
      addressRegion: data.addressRegion?.trim() || undefined,
      postalCode: data.postalCode?.trim() || undefined,
      addressCountry: data.addressCountry?.trim() || undefined,
    });
  }

  // Nested GeoCoordinates
  const lat = parseCleanNumber(data.latitude);
  const lng = parseCleanNumber(data.longitude);
  if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: lat,
      longitude: lng,
    };
  }

  // Opening Hours
  if (data.openingHours && data.openingHours.length > 0) {
    const validHours = data.openingHours
      .filter((h) => !h.closed && h.opens && h.closes)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: h.dayOfWeek,
        opens: h.opens,
        closes: h.closes,
      }));
    if (validHours.length > 0) {
      schema.openingHoursSpecification = validHours;
    }
  }

  // SameAs
  const cleanSameAs = (data.sameAs || []).map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleanSameAs.length > 0) {
    schema.sameAs = cleanSameAs;
  }

  // Restaurant specific fields
  if (data.subType === 'Restaurant') {
    if (data.servesCuisine?.trim()) schema.servesCuisine = data.servesCuisine.trim();
    if (data.menu?.trim()) schema.hasMenu = data.menu.trim();
    if (data.acceptsReservations !== undefined) schema.acceptsReservations = data.acceptsReservations;
  }

  return cleanObject(schema);
}

export function buildOrganizationSchema(data: OrganizationFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': data.subType || 'Organization',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.url?.trim()) schema.url = data.url.trim();
  if (data.logo?.trim()) schema.logo = data.logo.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.email?.trim()) schema.email = data.email.trim();
  if (data.telephone?.trim()) schema.telephone = data.telephone.trim();
  if (data.foundingDate?.trim()) schema.foundingDate = data.foundingDate.trim();

  const cleanSameAs = (data.sameAs || []).map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleanSameAs.length > 0) {
    schema.sameAs = cleanSameAs;
  }

  // Nested Address
  if (
    data.streetAddress?.trim() ||
    data.addressLocality?.trim() ||
    data.addressRegion?.trim() ||
    data.postalCode?.trim() ||
    data.addressCountry?.trim()
  ) {
    schema.address = cleanObject({
      '@type': 'PostalAddress',
      streetAddress: data.streetAddress?.trim() || undefined,
      addressLocality: data.addressLocality?.trim() || undefined,
      addressRegion: data.addressRegion?.trim() || undefined,
      postalCode: data.postalCode?.trim() || undefined,
      addressCountry: data.addressCountry?.trim() || undefined,
    });
  }

  // Contact Point
  if (data.contactPointTelephone?.trim()) {
    schema.contactPoint = cleanObject({
      '@type': 'ContactPoint',
      telephone: data.contactPointTelephone.trim(),
      contactType: data.contactPointContactType?.trim() || 'customer service',
      areaServed: data.contactPointAreaServed?.trim() || undefined,
    });
  }

  return cleanObject(schema);
}

export function buildPersonSchema(data: PersonFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Person',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.url?.trim()) schema.url = data.url.trim();
  if (data.image?.trim()) schema.image = data.image.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.jobTitle?.trim()) schema.jobTitle = data.jobTitle.trim();

  if (data.worksForName?.trim()) {
    schema.worksFor = cleanObject({
      '@type': 'Organization',
      name: data.worksForName.trim(),
      url: data.worksForUrl?.trim() || undefined,
    });
  }

  if (data.alumniOf?.trim()) {
    schema.alumniOf = {
      '@type': 'EducationalOrganization',
      name: data.alumniOf.trim(),
    };
  }

  if (data.knowsAbout?.trim()) {
    const list = data.knowsAbout.split(/[,;]/).map((s) => s.trim()).filter((s) => s.length > 0);
    schema.knowsAbout = list.length === 1 ? list[0] : list;
  }

  const cleanSameAs = (data.sameAs || []).map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleanSameAs.length > 0) {
    schema.sameAs = cleanSameAs;
  }

  return cleanObject(schema);
}

export function buildProductSchema(data: ProductFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.image?.trim()) schema.image = data.image.trim();
  if (data.sku?.trim()) schema.sku = data.sku.trim();
  if (data.mpn?.trim()) schema.mpn = data.mpn.trim();
  if (data.gtin?.trim()) schema.gtin = data.gtin.trim();

  if (data.brand?.trim()) {
    schema.brand = {
      '@type': 'Brand',
      name: data.brand.trim(),
    };
  }

  // Nested Offer
  const priceNum = parseCleanNumber(data.price);
  if (priceNum !== null || data.url?.trim() || data.availability) {
    const offer: Record<string, unknown> = {
      '@type': 'Offer',
    };
    if (priceNum !== null) offer.price = priceNum;
    if (data.priceCurrency?.trim()) offer.priceCurrency = data.priceCurrency.trim().toUpperCase();
    if (data.availability) offer.availability = `https://schema.org/${data.availability}`;
    if (data.itemCondition) offer.itemCondition = `https://schema.org/${data.itemCondition}`;
    if (data.priceValidUntil?.trim()) offer.priceValidUntil = data.priceValidUntil.trim();
    if (data.url?.trim()) offer.url = data.url.trim();

    if (data.sellerName?.trim()) {
      offer.seller = {
        '@type': 'Organization',
        name: data.sellerName.trim(),
      };
    }
    schema.offers = cleanObject(offer);
  }

  // Aggregate Rating (only when user provides genuine values)
  const rating = parseCleanNumber(data.ratingValue);
  const reviews = parseCleanNumber(data.reviewCount);
  if (rating !== null && reviews !== null && reviews > 0) {
    schema.aggregateRating = cleanObject({
      '@type': 'AggregateRating',
      ratingValue: rating,
      reviewCount: Math.round(reviews),
      bestRating: parseCleanNumber(data.bestRating) ?? 5,
      worstRating: parseCleanNumber(data.worstRating) ?? 1,
    });
  }

  return cleanObject(schema);
}

export function buildEventSchema(data: EventFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.startDate?.trim()) schema.startDate = data.startDate.trim();
  if (data.endDate?.trim()) schema.endDate = data.endDate.trim();
  if (data.image?.trim()) schema.image = data.image.trim();
  if (data.eventStatus) schema.eventStatus = `https://schema.org/${data.eventStatus}`;
  if (data.eventAttendanceMode) schema.eventAttendanceMode = `https://schema.org/${data.eventAttendanceMode}`;

  // Locations based on attendance mode
  const mode = data.eventAttendanceMode;
  const isOnline = mode === 'OnlineEventAttendanceMode' || mode === 'MixedEventAttendanceMode';
  const isPhysical = mode === 'OfflineEventAttendanceMode' || mode === 'MixedEventAttendanceMode';

  const locations: Record<string, unknown>[] = [];

  if (isPhysical && (data.locationName?.trim() || data.streetAddress?.trim() || data.addressLocality?.trim())) {
    locations.push(
      cleanObject({
        '@type': 'Place',
        name: data.locationName?.trim() || undefined,
        address: cleanObject({
          '@type': 'PostalAddress',
          streetAddress: data.streetAddress?.trim() || undefined,
          addressLocality: data.addressLocality?.trim() || undefined,
          addressRegion: data.addressRegion?.trim() || undefined,
          postalCode: data.postalCode?.trim() || undefined,
          addressCountry: data.addressCountry?.trim() || undefined,
        }),
      })
    );
  }

  if (isOnline && data.virtualLocationUrl?.trim()) {
    locations.push({
      '@type': 'VirtualLocation',
      url: data.virtualLocationUrl.trim(),
    });
  }

  if (locations.length === 1) {
    schema.location = locations[0];
  } else if (locations.length > 1) {
    schema.location = locations;
  }

  // Organizer
  if (data.organizerName?.trim()) {
    schema.organizer = cleanObject({
      '@type': 'Organization',
      name: data.organizerName.trim(),
      url: data.organizerUrl?.trim() || undefined,
    });
  }

  // Performer
  if (data.performerName?.trim()) {
    schema.performer = {
      '@type': 'PerformingGroup',
      name: data.performerName.trim(),
    };
  }

  // Ticket Offers
  const ticketPriceNum = parseCleanNumber(data.ticketPrice);
  if (ticketPriceNum !== null || data.ticketUrl?.trim()) {
    schema.offers = cleanObject({
      '@type': 'Offer',
      price: ticketPriceNum ?? 0,
      priceCurrency: data.ticketCurrency?.trim() || 'USD',
      url: data.ticketUrl?.trim() || undefined,
      availability: data.ticketAvailability ? `https://schema.org/${data.ticketAvailability}` : 'https://schema.org/InStock',
    });
  }

  return cleanObject(schema);
}

export function buildBreadcrumbSchema(data: BreadcrumbFormState): Record<string, unknown> {
  const elements = (data.items || [])
    .filter((item) => item.name?.trim() || item.url?.trim())
    .map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name?.trim() || '',
      item: item.url?.trim() || undefined,
    }));

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: elements,
  };

  return cleanObject(schema);
}

export function buildRecipeSchema(data: RecipeFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.image?.trim()) schema.image = data.image.trim();
  if (data.recipeYield?.trim()) schema.recipeYield = data.recipeYield.trim();
  if (data.recipeCategory?.trim()) schema.recipeCategory = data.recipeCategory.trim();
  if (data.recipeCuisine?.trim()) schema.recipeCuisine = data.recipeCuisine.trim();
  if (data.keywords?.trim()) schema.keywords = data.keywords.trim();

  if (data.authorName?.trim()) {
    schema.author = {
      '@type': 'Person',
      name: data.authorName.trim(),
    };
  }

  const prep = formatIsoDuration(data.prepTime);
  if (prep) schema.prepTime = prep;
  const cook = formatIsoDuration(data.cookTime);
  if (cook) schema.cookTime = cook;
  const total = formatIsoDuration(data.totalTime);
  if (total) schema.totalTime = total;

  const cleanIngredients = (data.ingredients || []).map((i) => i.trim()).filter((i) => i.length > 0);
  if (cleanIngredients.length > 0) {
    schema.recipeIngredient = cleanIngredients;
  }

  const steps = (data.instructions || [])
    .filter((s) => s.text?.trim() || s.name?.trim())
    .map((s, idx) =>
      cleanObject({
        '@type': 'HowToStep',
        position: idx + 1,
        name: s.name?.trim() || undefined,
        text: s.text?.trim() || undefined,
      })
    );
  if (steps.length > 0) {
    schema.recipeInstructions = steps;
  }

  if (data.calories?.trim()) {
    schema.nutrition = {
      '@type': 'NutritionInformation',
      calories: data.calories.trim().toLowerCase().includes('cal') ? data.calories.trim() : `${data.calories.trim()} calories`,
    };
  }

  const rating = parseCleanNumber(data.ratingValue);
  const reviews = parseCleanNumber(data.reviewCount);
  if (rating !== null && reviews !== null && reviews > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating,
      reviewCount: Math.round(reviews),
    };
  }

  return cleanObject(schema);
}

export function buildVideoSchema(data: VideoFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.thumbnailUrl?.trim()) schema.thumbnailUrl = data.thumbnailUrl.trim();
  if (data.uploadDate?.trim()) schema.uploadDate = data.uploadDate.trim();

  const isoDuration = formatIsoDuration(data.duration);
  if (isoDuration) schema.duration = isoDuration;

  if (data.contentUrl?.trim()) schema.contentUrl = data.contentUrl.trim();
  if (data.embedUrl?.trim()) schema.embedUrl = data.embedUrl.trim();

  if (data.publisherName?.trim()) {
    const publisher: Record<string, unknown> = {
      '@type': 'Organization',
      name: data.publisherName.trim(),
    };
    if (data.publisherLogo?.trim()) {
      publisher.logo = {
        '@type': 'ImageObject',
        url: data.publisherLogo.trim(),
      };
    }
    schema.publisher = cleanObject(publisher);
  }

  return cleanObject(schema);
}

export function buildImageObjectSchema(data: ImageFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
  };

  if (data.contentUrl?.trim()) schema.contentUrl = data.contentUrl.trim();
  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.caption?.trim()) schema.caption = data.caption.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.license?.trim()) schema.license = data.license.trim();
  if (data.acquireLicensePage?.trim()) schema.acquireLicensePage = data.acquireLicensePage.trim();
  if (data.creditText?.trim()) schema.creditText = data.creditText.trim();
  if (data.copyrightNotice?.trim()) schema.copyrightNotice = data.copyrightNotice.trim();
  if (data.datePublished?.trim()) schema.datePublished = data.datePublished.trim();

  const width = parseCleanNumber(data.width);
  if (width !== null && width > 0) schema.width = `${Math.round(width)} px`;

  const height = parseCleanNumber(data.height);
  if (height !== null && height > 0) schema.height = `${Math.round(height)} px`;

  if (data.creatorName?.trim()) {
    schema.creator = cleanObject({
      '@type': data.creatorType || 'Person',
      name: data.creatorName.trim(),
      url: data.creatorUrl?.trim() || undefined,
    });
  }

  return cleanObject(schema);
}

export function buildJobPostingSchema(data: JobPostingFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
  };

  if (data.title?.trim()) schema.title = data.title.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.datePosted?.trim()) schema.datePosted = data.datePosted.trim();
  if (data.validThrough?.trim()) schema.validThrough = data.validThrough.trim();
  if (data.employmentType) schema.employmentType = data.employmentType;
  if (data.directApply) schema.directApply = true;

  // Hiring Org
  if (data.hiringOrganizationName?.trim()) {
    schema.hiringOrganization = cleanObject({
      '@type': 'Organization',
      name: data.hiringOrganizationName.trim(),
      sameAs: data.hiringOrganizationUrl?.trim() || undefined,
      logo: data.hiringOrganizationLogo?.trim() || undefined,
    });
  }

  // Location / Remote
  if (data.isRemote) {
    schema.jobLocationType = 'TELECOMMUTE';
    if (data.applicantLocationRequirements?.trim()) {
      schema.applicantLocationRequirements = {
        '@type': 'Country',
        name: data.applicantLocationRequirements.trim(),
      };
    }
  }

  if (
    data.streetAddress?.trim() ||
    data.addressLocality?.trim() ||
    data.addressRegion?.trim() ||
    data.postalCode?.trim() ||
    data.addressCountry?.trim()
  ) {
    schema.jobLocation = {
      '@type': 'Place',
      address: cleanObject({
        '@type': 'PostalAddress',
        streetAddress: data.streetAddress?.trim() || undefined,
        addressLocality: data.addressLocality?.trim() || undefined,
        addressRegion: data.addressRegion?.trim() || undefined,
        postalCode: data.postalCode?.trim() || undefined,
        addressCountry: data.addressCountry?.trim() || undefined,
      }),
    };
  }

  // Base Salary
  const salaryNum = parseCleanNumber(data.baseSalary);
  if (salaryNum !== null) {
    schema.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: data.salaryCurrency?.trim() || 'USD',
      value: {
        '@type': 'QuantitativeValue',
        value: salaryNum,
        unitText: data.salaryUnit || 'MONTH',
      },
    };
  }

  return cleanObject(schema);
}

export function buildWebSiteSchema(data: WebSiteFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.url?.trim()) schema.url = data.url.trim();
  if (data.alternateName?.trim()) schema.alternateName = data.alternateName.trim();

  if (data.searchActionTarget?.trim()) {
    schema.potentialAction = {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: data.searchActionTarget.trim(),
      },
      'query-input': data.queryInput?.trim() || 'required name=search_term_string',
    };
  }

  return cleanObject(schema);
}

export function buildWebPageSchema(data: WebPageFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.url?.trim()) schema.url = data.url.trim();
  if (data.inLanguage?.trim()) schema.inLanguage = data.inLanguage.trim();
  if (data.breadcrumbUrl?.trim()) schema.breadcrumb = data.breadcrumbUrl.trim();

  if (data.isPartOfName?.trim() || data.isPartOfUrl?.trim()) {
    schema.isPartOf = cleanObject({
      '@type': 'WebSite',
      name: data.isPartOfName?.trim() || undefined,
      url: data.isPartOfUrl?.trim() || undefined,
    });
  }

  return cleanObject(schema);
}

export function buildSoftwareAppSchema(data: SoftwareAppFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.applicationCategory?.trim()) schema.applicationCategory = data.applicationCategory.trim();
  if (data.operatingSystem?.trim()) schema.operatingSystem = data.operatingSystem.trim();
  if (data.downloadUrl?.trim()) schema.downloadUrl = data.downloadUrl.trim();

  const priceNum = parseCleanNumber(data.price);
  if (priceNum !== null) {
    schema.offers = {
      '@type': 'Offer',
      price: priceNum,
      priceCurrency: data.priceCurrency?.trim() || 'USD',
    };
  }

  const rating = parseCleanNumber(data.ratingValue);
  const reviews = parseCleanNumber(data.reviewCount);
  if (rating !== null && reviews !== null && reviews > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: rating,
      reviewCount: Math.round(reviews),
    };
  }

  return cleanObject(schema);
}

export function buildCourseSchema(data: CourseFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.courseCode?.trim()) schema.courseCode = data.courseCode.trim();
  if (data.courseMode?.trim()) schema.courseMode = data.courseMode.trim();

  if (data.providerName?.trim()) {
    schema.provider = cleanObject({
      '@type': 'Organization',
      name: data.providerName.trim(),
      sameAs: data.providerUrl?.trim() || undefined,
    });
  }

  return cleanObject(schema);
}

export function buildDatasetSchema(data: DatasetFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.url?.trim()) schema.url = data.url.trim();
  if (data.license?.trim()) schema.license = data.license.trim();
  if (data.keywords?.trim()) schema.keywords = data.keywords.trim();

  if (data.creatorName?.trim()) {
    schema.creator = {
      '@type': 'Organization',
      name: data.creatorName.trim(),
    };
  }

  if (data.distributionDownloadUrl?.trim()) {
    schema.distribution = {
      '@type': 'DataDownload',
      encodingFormat: data.distributionFormat?.trim() || 'application/json',
      contentUrl: data.distributionDownloadUrl.trim(),
    };
  }

  return cleanObject(schema);
}

export function buildServiceSchema(data: ServiceFormState): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
  };

  if (data.name?.trim()) schema.name = data.name.trim();
  if (data.description?.trim()) schema.description = data.description.trim();
  if (data.serviceType?.trim()) schema.serviceType = data.serviceType.trim();
  if (data.serviceUrl?.trim()) schema.url = data.serviceUrl.trim();
  if (data.logo?.trim()) schema.logo = data.logo.trim();
  if (data.areaServed?.trim()) schema.areaServed = data.areaServed.trim();

  if (data.providerName?.trim()) {
    schema.provider = cleanObject({
      '@type': 'Organization',
      name: data.providerName.trim(),
      url: data.providerUrl?.trim() || undefined,
    });
  }

  const priceNum = parseCleanNumber(data.price);
  if (priceNum !== null) {
    schema.offers = {
      '@type': 'Offer',
      price: priceNum,
      priceCurrency: data.priceCurrency?.trim() || 'USD',
    };
  }

  return cleanObject(schema);
}

/**
 * Master dispatcher that executes the appropriate builder for any schema type
 */
export function buildSchemaObject(
  type: SupportedSchemaType,
  state: Record<string, unknown>
): Record<string, unknown> {
  switch (type) {
    case 'Article':
    case 'BlogPosting':
    case 'NewsArticle':
      return buildArticleSchema(state as unknown as ArticleFormState);
    case 'FAQPage':
      return buildFaqSchema(state as unknown as FaqFormState);
    case 'HowTo':
      return buildHowToSchema(state as unknown as HowToFormState);
    case 'LocalBusiness':
    case 'Restaurant':
      return buildLocalBusinessSchema(state as unknown as LocalBusinessFormState);
    case 'Organization':
      return buildOrganizationSchema(state as unknown as OrganizationFormState);
    case 'Person':
      return buildPersonSchema(state as unknown as PersonFormState);
    case 'Product':
      return buildProductSchema(state as unknown as ProductFormState);
    case 'Event':
      return buildEventSchema(state as unknown as EventFormState);
    case 'BreadcrumbList':
      return buildBreadcrumbSchema(state as unknown as BreadcrumbFormState);
    case 'Recipe':
      return buildRecipeSchema(state as unknown as RecipeFormState);
    case 'VideoObject':
      return buildVideoSchema(state as unknown as VideoFormState);
    case 'ImageObject':
      return buildImageObjectSchema(state as unknown as ImageFormState);
    case 'JobPosting':
      return buildJobPostingSchema(state as unknown as JobPostingFormState);
    case 'WebSite':
      return buildWebSiteSchema(state as unknown as WebSiteFormState);
    case 'WebPage':
      return buildWebPageSchema(state as unknown as WebPageFormState);
    case 'SoftwareApplication':
      return buildSoftwareAppSchema(state as unknown as SoftwareAppFormState);
    case 'Course':
      return buildCourseSchema(state as unknown as CourseFormState);
    case 'Dataset':
      return buildDatasetSchema(state as unknown as DatasetFormState);
    case 'Service':
      return buildServiceSchema(state as unknown as ServiceFormState);
    default:
      return cleanObject({
        '@context': 'https://schema.org',
        '@type': type,
        ...state,
      });
  }
}
