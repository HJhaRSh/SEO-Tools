import { OrganizationSubType, RichResultMeta, SupportedSchemaType } from './types';

export const SUPPORTED_SCHEMA_TYPES: { id: SupportedSchemaType; label: string; group: string; description?: string }[] = [
  // Entity & Brand
  { id: 'Organization', label: 'Organization', group: 'Entity & Brand', description: 'Brand identity, company logo, and Knowledge Panel' },
  { id: 'LocalBusiness', label: 'Local Business', group: 'Entity & Brand', description: 'Store, clinic, agency with physical location & hours' },
  { id: 'Person', label: 'Person', group: 'Entity & Brand', description: 'Author, executive, consultant, or public figure' },
  { id: 'Service', label: 'Service', group: 'Entity & Brand', description: 'Professional, consulting, or business services' },

  // Content & Editorial
  { id: 'Article', label: 'Article / Blog Posting / News', group: 'Content & Editorial', description: 'Blog posts, news articles, and editorials' },
  { id: 'FAQPage', label: 'FAQ Page', group: 'Content & Editorial', description: 'Frequently asked questions with rich accordion answers' },
  { id: 'HowTo', label: 'How-To (Schema.org)', group: 'Content & Editorial', description: 'Step-by-step instructional guides' },
  { id: 'Recipe', label: 'Recipe', group: 'Content & Editorial', description: 'Culinary recipes with ingredients and cooking times' },

  // Commerce & Jobs
  { id: 'Product', label: 'Product', group: 'Commerce & Jobs', description: 'E-commerce items with prices, ratings, and stock' },
  { id: 'JobPosting', label: 'Job Posting', group: 'Commerce & Jobs', description: 'Employment opportunities, salary, and remote status' },

  // Navigation & Site
  { id: 'BreadcrumbList', label: 'Breadcrumb List', group: 'Navigation & Site', description: 'URL hierarchy trail shown in search snippets' },
  { id: 'WebSite', label: 'WebSite (Sitelinks Searchbox)', group: 'Navigation & Site', description: 'Site identity & Google Sitelinks Searchbox' },
  { id: 'WebPage', label: 'WebPage', group: 'Navigation & Site', description: 'Web page entity and primary subject' },

  // Media & Creative
  { id: 'VideoObject', label: 'Video Object', group: 'Media & Creative', description: 'Video media with thumbnail, upload date, and duration' },
  { id: 'ImageObject', label: 'Image Object', group: 'Media & Creative', description: 'Image metadata, licensing, author, and Google Image badges' },

  // Events & Places
  { id: 'Event', label: 'Event', group: 'Events & Places', description: 'Concerts, webinars, conferences, and festivals' },

  // Specialized
  { id: 'SoftwareApplication', label: 'Software Application', group: 'Specialized', description: 'Web, mobile, desktop software and SaaS apps' },
  { id: 'Course', label: 'Course', group: 'Specialized', description: 'Educational courses and learning curricula' },
  { id: 'Dataset', label: 'Dataset', group: 'Specialized', description: 'Public or scientific data tables and repositories' },
];

export const RICH_RESULT_META_MAP: Record<SupportedSchemaType, RichResultMeta> = {
  Organization: {
    status: 'eligible-with-guidelines',
    statusBadge: 'Google Knowledge Panel & Logo',
    badgeClass: 'badge-success',
    note: 'Used by Google for Knowledge Panels, Brand identity, logos, and sameAs social verification.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/organization',
  },
  LocalBusiness: {
    status: 'supported',
    statusBadge: 'Google Maps & Local Pack',
    badgeClass: 'badge-success',
    note: 'Powers Local Knowledge Graph cards, Google Maps information, opening hours, and contact details.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/local-business',
  },
  Restaurant: {
    status: 'supported',
    statusBadge: 'Google Local & Menu Snippet',
    badgeClass: 'badge-success',
    note: 'Eligible for rich local restaurant cards, menus, reservation links, and cuisine tags.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/restaurant',
  },
  Person: {
    status: 'not-specific-rich-result',
    statusBadge: 'Entity & Author Authority',
    badgeClass: 'badge-neutral',
    note: 'Schema.org vocabulary widely recognized for E-E-A-T author attribution, Knowledge Graph, and citations.',
    docUrl: 'https://schema.org/Person',
  },
  Product: {
    status: 'supported',
    statusBadge: 'Google Merchant & Rich Snippet',
    badgeClass: 'badge-success',
    note: 'Eligible for rich search results, Merchant Center listings, price drop alerts, in-stock badges, and star ratings.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/product',
  },
  JobPosting: {
    status: 'supported',
    statusBadge: 'Google for Jobs',
    badgeClass: 'badge-success',
    note: 'Eligible for dedicated Google for Jobs search experience with salary, employment type, and direct apply tags.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/job-posting',
  },
  Article: {
    status: 'supported',
    statusBadge: 'Google Top Stories & Rich Snippet',
    badgeClass: 'badge-success',
    note: 'Enables headline, preview images, and author badges in standard search and Google Discover.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/article',
  },
  BlogPosting: {
    status: 'supported',
    statusBadge: 'Google Top Stories & Article',
    badgeClass: 'badge-success',
    note: 'Subtype of Article for blog publications. Supports author, datePublished, and image rich previews.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/article',
  },
  NewsArticle: {
    status: 'supported',
    statusBadge: 'Google News & Top Stories',
    badgeClass: 'badge-success',
    note: 'Specialized Article type for news publishers eligible for Top Stories and News tabs.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/article',
  },
  FAQPage: {
    status: 'deprecated',
    statusBadge: 'Google FAQ Snippets Discontinued (May 2026)',
    badgeClass: 'badge-warning',
    note: 'FAQPage remains a standard Schema.org type, but Google discontinued general FAQ rich snippets in May 2026. Only authoritative government/health domains may receive visibility.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/faqpage',
  },
  HowTo: {
    status: 'deprecated',
    statusBadge: 'Google HowTo Snippets Deprecated',
    badgeClass: 'badge-warning',
    note: 'Google deprecated HowTo rich results on mobile and desktop search. Schema.org syntax is retained for semantic linked data, voice assistants, and semantic search.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/how-to',
  },
  Recipe: {
    status: 'supported',
    statusBadge: 'Google Recipe Rich Card',
    badgeClass: 'badge-success',
    note: 'Eligible for recipe carousels, cooking time badges, calorie information, and step-by-step guidance.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/recipe',
  },
  VideoObject: {
    status: 'supported',
    statusBadge: 'Google Video Rich Snippet',
    badgeClass: 'badge-success',
    note: 'Enables video badges, timestamps, thumbnails, and preview clips in Google Search results and Video tab.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/video',
  },
  ImageObject: {
    status: 'supported',
    statusBadge: 'Google Licensable Image Badge',
    badgeClass: 'badge-success',
    note: 'Enables Licensable badge and metadata (creator, credit, copyright, and licensing URLs) on Google Images.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata',
  },
  Event: {
    status: 'supported',
    statusBadge: 'Google Event Listing',
    badgeClass: 'badge-success',
    note: 'Eligible for rich event listings showing date, venue, ticketing status, and online streaming URLs.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/event',
  },
  BreadcrumbList: {
    status: 'supported',
    statusBadge: 'Google Breadcrumbs',
    badgeClass: 'badge-success',
    note: 'Replaces raw URL paths with structured hierarchical breadcrumb navigation links in search snippets.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb',
  },
  WebSite: {
    status: 'supported',
    statusBadge: 'Google Sitelinks Searchbox',
    badgeClass: 'badge-success',
    note: 'Used for homepage structured data and the optional Google Sitelinks search box feature.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/sitelinks-searchbox',
  },
  WebPage: {
    status: 'not-specific-rich-result',
    statusBadge: 'Semantic Web Structure',
    badgeClass: 'badge-neutral',
    note: 'Provides granular machine-readable context for individual pages, language, and parent site relationships.',
    docUrl: 'https://schema.org/WebPage',
  },
  SoftwareApplication: {
    status: 'supported',
    statusBadge: 'Google Software App Snippet',
    badgeClass: 'badge-success',
    note: 'Eligible for application details, operating system tags, app category, ratings, and download badges.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/software-app',
  },
  Course: {
    status: 'supported',
    statusBadge: 'Google Course List & Info',
    badgeClass: 'badge-success',
    note: 'Displays title, provider name, and course details in dedicated education search features.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/course',
  },
  Dataset: {
    status: 'supported',
    statusBadge: 'Google Dataset Search',
    badgeClass: 'badge-success',
    note: 'Indexes scientific, governmental, and open data sets for discovery on Google Dataset Search.',
    docUrl: 'https://developers.google.com/search/docs/appearance/structured-data/dataset',
  },
  Service: {
    status: 'not-specific-rich-result',
    statusBadge: 'Semantic Service Entity',
    badgeClass: 'badge-neutral',
    note: 'Standard Schema.org markup describing commercial, professional, or digital services offered by an organization.',
    docUrl: 'https://schema.org/Service',
  },
};

export const ORGANIZATION_SUBTYPES: { value: OrganizationSubType; label: string }[] = [
  { value: 'Organization', label: 'Organization (General)' },
  { value: 'Corporation', label: 'Corporation / Enterprise' },
  { value: 'EducationalOrganization', label: 'EducationalOrganization (School, University)' },
  { value: 'GovernmentOrganization', label: 'GovernmentOrganization' },
  { value: 'MedicalOrganization', label: 'MedicalOrganization (Hospital, Clinic)' },
  { value: 'NGO', label: 'NGO (Non-Governmental Organization / Non-profit)' },
  { value: 'NewsMediaOrganization', label: 'NewsMediaOrganization' },
  { value: 'OnlineBusiness', label: 'OnlineBusiness (Digital Agency, E-commerce Brand)' },
  { value: 'PerformingGroup', label: 'PerformingGroup (Music Band, Theater Troupe)' },
  { value: 'SportsOrganization', label: 'SportsOrganization (Sports Team, Club, League)' },
  { value: 'Airline', label: 'Airline' },
  { value: 'Consortium', label: 'Consortium' },
];

export const LOCAL_BUSINESS_SUBTYPES: { value: string; label: string }[] = [
  { value: 'LocalBusiness', label: 'LocalBusiness (General)' },
  { value: 'Restaurant', label: 'Restaurant' },
  { value: 'Store', label: 'Store / Retail Shop' },
  { value: 'Dentist', label: 'Dentist' },
  { value: 'MedicalClinic', label: 'MedicalClinic' },
  { value: 'ProfessionalService', label: 'ProfessionalService' },
  { value: 'AutomotiveBusiness', label: 'AutomotiveBusiness' },
];
