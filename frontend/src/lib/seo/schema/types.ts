/**
 * Schema.org & JSON-LD Generator Types
 */

export type SupportedSchemaType =
  | 'Article'
  | 'BlogPosting'
  | 'NewsArticle'
  | 'FAQPage'
  | 'HowTo'
  | 'LocalBusiness'
  | 'Restaurant'
  | 'Organization'
  | 'Person'
  | 'Product'
  | 'Event'
  | 'BreadcrumbList'
  | 'Recipe'
  | 'VideoObject'
  | 'ImageObject'
  | 'JobPosting'
  | 'WebSite'
  | 'WebPage'
  | 'SoftwareApplication'
  | 'Course'
  | 'Dataset'
  | 'Service';

export type OutputFormat = 'script' | 'json';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  field?: string;
  message: string;
  severity: ValidationSeverity;
}

export type RichResultStatus =
  | 'supported'
  | 'deprecated'
  | 'not-specific-rich-result'
  | 'eligible-with-guidelines';

export interface RichResultMeta {
  status: RichResultStatus;
  statusBadge: string;
  badgeClass: 'badge-success' | 'badge-warning' | 'badge-error' | 'badge-neutral';
  note: string;
  docUrl: string;
}

// ----------------------------------------------------
// Schema Field Data Structures
// ----------------------------------------------------

export interface ArticleFormState {
  subType: 'Article' | 'BlogPosting' | 'NewsArticle';
  headline: string;
  description: string;
  url: string;
  image: string;
  authorType: 'Person' | 'Organization';
  authorName: string;
  authorUrl: string;
  publisherName: string;
  publisherLogo: string;
  datePublished: string;
  dateModified: string;
  mainEntityOfPage: string;
  articleSection: string;
  keywords: string;
  inLanguage: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface FaqFormState {
  questions: FaqItem[];
}

export interface HowToStepItem {
  id: string;
  name: string;
  text: string;
  url: string;
  image: string;
}

export interface HowToFormState {
  name: string;
  description: string;
  image: string;
  totalTime: string; // e.g. "30 mins" or "PT30M"
  estimatedCost: string;
  costCurrency: string;
  tools: string[]; // repeatable
  supplies: string[]; // repeatable
  steps: HowToStepItem[];
}

export interface OpeningHourItem {
  id: string;
  dayOfWeek: string; // 'Monday' | 'Tuesday' etc.
  opens: string; // '09:00'
  closes: string; // '18:00'
  closed: boolean;
}

export interface LocalBusinessFormState {
  subType: 'LocalBusiness' | 'Restaurant' | 'Store' | 'Dentist' | 'MedicalClinic' | 'ProfessionalService' | 'AutomotiveBusiness';
  name: string;
  description: string;
  url: string;
  telephone: string;
  email: string;
  priceRange: string;
  logo: string;
  image: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  latitude: string;
  longitude: string;
  openingHours: OpeningHourItem[];
  sameAs: string[];
  areaServed: string;
  // Restaurant specific
  servesCuisine?: string;
  menu?: string;
  acceptsReservations?: boolean;
}

export type OrganizationSubType =
  | 'Organization'
  | 'Corporation'
  | 'Airline'
  | 'Consortium'
  | 'EducationalOrganization'
  | 'GovernmentOrganization'
  | 'MedicalOrganization'
  | 'NGO'
  | 'NewsMediaOrganization'
  | 'OnlineBusiness'
  | 'PerformingGroup'
  | 'SportsOrganization';

export interface OrganizationFormState {
  subType?: OrganizationSubType;
  name: string;
  url: string;
  logo: string;
  description: string;
  email: string;
  telephone: string;
  foundingDate: string;
  sameAs: string[];
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  contactPointTelephone: string;
  contactPointContactType: string;
  contactPointAreaServed: string;
}

export interface PersonFormState {
  name: string;
  url: string;
  image: string;
  description: string;
  jobTitle: string;
  worksForName: string;
  worksForUrl: string;
  alumniOf: string;
  knowsAbout: string;
  sameAs: string[];
}

export interface ProductFormState {
  name: string;
  description: string;
  image: string;
  sku: string;
  mpn: string;
  gtin: string;
  brand: string;
  url: string;
  price: string;
  priceCurrency: string;
  availability: 'InStock' | 'OutOfStock' | 'PreOrder' | 'BackOrder' | 'Discontinued';
  itemCondition: 'NewCondition' | 'UsedCondition' | 'RefurbishedCondition' | 'DamagedCondition';
  priceValidUntil: string;
  sellerName: string;
  ratingValue: string;
  reviewCount: string;
  bestRating: string;
  worstRating: string;
}

export interface EventFormState {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  eventStatus: 'EventScheduled' | 'EventPostponed' | 'EventRescheduled' | 'EventCancelled';
  eventAttendanceMode: 'OfflineEventAttendanceMode' | 'OnlineEventAttendanceMode' | 'MixedEventAttendanceMode';
  locationName: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  virtualLocationUrl: string;
  organizerName: string;
  organizerUrl: string;
  performerName: string;
  image: string;
  ticketPrice: string;
  ticketCurrency: string;
  ticketUrl: string;
  ticketAvailability: 'InStock' | 'SoldOut' | 'PreOrder';
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  url: string;
}

export interface BreadcrumbFormState {
  items: BreadcrumbItem[];
}

export interface RecipeInstructionItem {
  id: string;
  name: string;
  text: string;
}

export interface RecipeFormState {
  name: string;
  description: string;
  authorName: string;
  image: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  recipeYield: string;
  recipeCategory: string;
  recipeCuisine: string;
  keywords: string;
  ingredients: string[];
  instructions: RecipeInstructionItem[];
  calories: string;
  ratingValue: string;
  reviewCount: string;
}

export interface VideoFormState {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  duration: string; // "PT10M" or "10 mins"
  contentUrl: string;
  embedUrl: string;
  publisherName: string;
  publisherLogo: string;
}

export interface ImageFormState {
  name: string;
  contentUrl: string;
  caption: string;
  description: string;
  creatorType: 'Person' | 'Organization';
  creatorName: string;
  creatorUrl: string;
  creditText: string;
  copyrightNotice: string;
  license: string;
  acquireLicensePage: string;
  datePublished: string;
  width: string;
  height: string;
}

export interface JobPostingFormState {
  title: string;
  description: string;
  datePosted: string;
  validThrough: string;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'TEMPORARY' | 'INTERN' | 'OTHER';
  hiringOrganizationName: string;
  hiringOrganizationUrl: string;
  hiringOrganizationLogo: string;
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
  isRemote: boolean;
  applicantLocationRequirements: string;
  baseSalary: string;
  salaryCurrency: string;
  salaryUnit: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  directApply: boolean;
}

export interface WebSiteFormState {
  name: string;
  url: string;
  alternateName: string;
  searchActionTarget: string; // e.g. "https://example.com/search?q={search_term_string}"
  queryInput: string;
}

export interface WebPageFormState {
  name: string;
  description: string;
  url: string;
  inLanguage: string;
  breadcrumbUrl: string;
  isPartOfName: string;
  isPartOfUrl: string;
}

export interface SoftwareAppFormState {
  name: string;
  description: string;
  applicationCategory: string;
  operatingSystem: string;
  price: string;
  priceCurrency: string;
  ratingValue: string;
  reviewCount: string;
  downloadUrl: string;
}

export interface CourseFormState {
  name: string;
  description: string;
  providerName: string;
  providerUrl: string;
  courseMode: string; // online, in-person
  courseCode: string;
}

export interface DatasetFormState {
  name: string;
  description: string;
  url: string;
  license: string;
  keywords: string;
  creatorName: string;
  distributionFormat: string;
  distributionDownloadUrl: string;
}

export interface ServiceFormState {
  name: string;
  description: string;
  serviceType: string;
  providerName: string;
  providerUrl: string;
  areaServed: string;
  price: string;
  priceCurrency: string;
  serviceUrl: string;
  logo: string;
}

export interface AllSchemasState {
  Article: ArticleFormState;
  BlogPosting: ArticleFormState;
  NewsArticle: ArticleFormState;
  FAQPage: FaqFormState;
  HowTo: HowToFormState;
  LocalBusiness: LocalBusinessFormState;
  Restaurant: LocalBusinessFormState;
  Organization: OrganizationFormState;
  Person: PersonFormState;
  Product: ProductFormState;
  Event: EventFormState;
  BreadcrumbList: BreadcrumbFormState;
  Recipe: RecipeFormState;
  VideoObject: VideoFormState;
  ImageObject: ImageFormState;
  JobPosting: JobPostingFormState;
  WebSite: WebSiteFormState;
  WebPage: WebPageFormState;
  SoftwareApplication: SoftwareAppFormState;
  Course: CourseFormState;
  Dataset: DatasetFormState;
  Service: ServiceFormState;
}
