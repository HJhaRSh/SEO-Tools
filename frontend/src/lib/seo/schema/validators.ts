import {
  ArticleFormState,
  BreadcrumbFormState,
  EventFormState,
  FaqFormState,
  HowToFormState,
  JobPostingFormState,
  LocalBusinessFormState,
  OrganizationFormState,
  PersonFormState,
  ProductFormState,
  RecipeFormState,
  SupportedSchemaType,
  ValidationIssue,
  VideoFormState,
  WebSiteFormState,
} from './types';
import { isValidDateString, isValidWebUrl, parseCleanNumber } from './fieldUtils';

/**
 * Validate form inputs according to Schema.org and Google Search guidelines.
 * Returns classified list of Errors (must fix), Warnings (recommended by Google), and Info notices.
 */
export function validateSchema(
  type: SupportedSchemaType,
  data: Record<string, unknown>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  switch (type) {
    case 'Article':
    case 'BlogPosting':
    case 'NewsArticle': {
      const state = data as unknown as ArticleFormState;
      if (!state.headline?.trim()) {
        issues.push({
          field: 'headline',
          message: 'Headline is required by Google for Article structured data.',
          severity: 'error',
        });
      }
      if (!state.image?.trim()) {
        issues.push({
          field: 'image',
          message: 'Google recommends at least one high-resolution image URL (min 1200px wide).',
          severity: 'warning',
        });
      } else if (!isValidWebUrl(state.image)) {
        issues.push({
          field: 'image',
          message: 'Image must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      if (!state.authorName?.trim()) {
        issues.push({
          field: 'authorName',
          message: 'Author name is required by Google for proper attribution and rich results.',
          severity: 'error',
        });
      }
      if (!state.datePublished?.trim()) {
        issues.push({
          field: 'datePublished',
          message: 'Publication date is required by Google for Articles.',
          severity: 'error',
        });
      } else if (!isValidDateString(state.datePublished)) {
        issues.push({
          field: 'datePublished',
          message: 'Publication date must be formatted in ISO 8601 (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+HH:mm).',
          severity: 'error',
        });
      }
      if (state.dateModified?.trim()) {
        if (!isValidDateString(state.dateModified)) {
          issues.push({
            field: 'dateModified',
            message: 'Date modified must be a valid ISO 8601 date string.',
            severity: 'error',
          });
        } else if (
          state.datePublished?.trim() &&
          isValidDateString(state.datePublished) &&
          Date.parse(state.dateModified) < Date.parse(state.datePublished)
        ) {
          issues.push({
            field: 'dateModified',
            message: 'Modified date precedes publication date. Ensure the update timestamp is correct.',
            severity: 'warning',
          });
        }
      }
      if (state.url?.trim() && !isValidWebUrl(state.url)) {
        issues.push({
          field: 'url',
          message: 'Article URL must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      break;
    }

    case 'FAQPage': {
      const state = data as unknown as FaqFormState;
      issues.push({
        message: 'Notice: Google restricted FAQ rich results in August 2023 to authoritative government and health sites. This Schema.org markup remains valid for semantic search and knowledge graphs.',
        severity: 'info',
      });

      if (!state.questions || state.questions.length === 0) {
        issues.push({
          field: 'questions',
          message: 'At least one Question and Answer pair is required for FAQPage.',
          severity: 'error',
        });
      } else {
        state.questions.forEach((q, idx) => {
          if (!q.question?.trim()) {
            issues.push({
              field: `questions[${idx}].question`,
              message: `Question #${idx + 1} has an empty question title.`,
              severity: 'error',
            });
          }
          if (!q.answer?.trim()) {
            issues.push({
              field: `questions[${idx}].answer`,
              message: `Question #${idx + 1} is missing an accepted answer.`,
              severity: 'error',
            });
          }
        });
      }
      break;
    }

    case 'HowTo': {
      const state = data as unknown as HowToFormState;
      issues.push({
        message: 'Notice: Google How-to rich results are deprecated. HowTo markup is retained for Schema.org linked data, assistants, and site semantics.',
        severity: 'info',
      });
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'HowTo name/title is required.',
          severity: 'error',
        });
      }
      if (!state.steps || state.steps.length === 0) {
        issues.push({
          field: 'steps',
          message: 'At least one HowTo step is required.',
          severity: 'error',
        });
      } else {
        state.steps.forEach((s, idx) => {
          if (!s.name?.trim() && !s.text?.trim()) {
            issues.push({
              field: `steps[${idx}]`,
              message: `Step #${idx + 1} must have either a step title or instructional text.`,
              severity: 'error',
            });
          }
        });
      }
      break;
    }

    case 'LocalBusiness':
    case 'Restaurant': {
      const state = data as unknown as LocalBusinessFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'Business name is required.',
          severity: 'error',
        });
      }
      if (!state.streetAddress?.trim() && !state.addressLocality?.trim()) {
        issues.push({
          field: 'streetAddress',
          message: 'Street address and locality (city) are recommended for LocalBusiness.',
          severity: 'warning',
        });
      }
      if (state.url?.trim() && !isValidWebUrl(state.url)) {
        issues.push({
          field: 'url',
          message: 'Website must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      if (state.latitude?.trim() || state.longitude?.trim()) {
        const lat = parseCleanNumber(state.latitude);
        const lng = parseCleanNumber(state.longitude);
        if (lat === null || lat < -90 || lat > 90) {
          issues.push({
            field: 'latitude',
            message: 'Latitude must be a valid decimal number between -90 and 90.',
            severity: 'error',
          });
        }
        if (lng === null || lng < -180 || lng > 180) {
          issues.push({
            field: 'longitude',
            message: 'Longitude must be a valid decimal number between -180 and 180.',
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'Organization': {
      const state = data as unknown as OrganizationFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'Organization name is required.',
          severity: 'error',
        });
      }
      if (!state.url?.trim()) {
        issues.push({
          field: 'url',
          message: 'Official website URL is required for Organization structured data.',
          severity: 'error',
        });
      } else if (!isValidWebUrl(state.url)) {
        issues.push({
          field: 'url',
          message: 'Website URL must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      if (state.logo?.trim() && !isValidWebUrl(state.logo)) {
        issues.push({
          field: 'logo',
          message: 'Logo must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      break;
    }

    case 'Person': {
      const state = data as unknown as PersonFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'Person name is required.',
          severity: 'error',
        });
      }
      if (state.url?.trim() && !isValidWebUrl(state.url)) {
        issues.push({
          field: 'url',
          message: 'Profile URL must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      break;
    }

    case 'Product': {
      const state = data as unknown as ProductFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'Product name is required for Google Merchant and rich results.',
          severity: 'error',
        });
      }
      if (!state.image?.trim()) {
        issues.push({
          field: 'image',
          message: 'Image URL is required by Google for Product rich results.',
          severity: 'warning',
        });
      } else if (!isValidWebUrl(state.image)) {
        issues.push({
          field: 'image',
          message: 'Product image must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      if (state.price?.trim()) {
        const p = parseCleanNumber(state.price);
        if (p === null || p < 0) {
          issues.push({
            field: 'price',
            message: 'Price must be a valid non-negative number.',
            severity: 'error',
          });
        }
        if (!state.priceCurrency?.trim()) {
          issues.push({
            field: 'priceCurrency',
            message: 'Price currency (ISO 4217 code, e.g. USD, EUR, INR) is required when price is provided.',
            severity: 'error',
          });
        }
      }
      if (state.ratingValue?.trim()) {
        const rating = parseCleanNumber(state.ratingValue);
        const count = parseCleanNumber(state.reviewCount);
        if (rating === null || rating < 0 || rating > 5) {
          issues.push({
            field: 'ratingValue',
            message: 'Rating value must be between 1 and 5.',
            severity: 'error',
          });
        }
        if (!count || count <= 0) {
          issues.push({
            field: 'reviewCount',
            message: 'Review count is required when ratingValue is specified.',
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'Event': {
      const state = data as unknown as EventFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'Event name is required.',
          severity: 'error',
        });
      }
      if (!state.startDate?.trim()) {
        issues.push({
          field: 'startDate',
          message: 'Event start date is required.',
          severity: 'error',
        });
      } else if (!isValidDateString(state.startDate)) {
        issues.push({
          field: 'startDate',
          message: 'Start date must be ISO 8601 (e.g. 2026-11-20T19:00:00+05:30).',
          severity: 'error',
        });
      }
      if (state.endDate?.trim()) {
        if (!isValidDateString(state.endDate)) {
          issues.push({
            field: 'endDate',
            message: 'End date must be ISO 8601.',
            severity: 'error',
          });
        } else if (
          state.startDate?.trim() &&
          isValidDateString(state.startDate) &&
          Date.parse(state.endDate) < Date.parse(state.startDate)
        ) {
          issues.push({
            field: 'endDate',
            message: 'Event end date/time cannot precede start date/time.',
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'BreadcrumbList': {
      const state = data as unknown as BreadcrumbFormState;
      if (!state.items || state.items.length === 0) {
        issues.push({
          field: 'items',
          message: 'BreadcrumbList requires at least one breadcrumb item.',
          severity: 'error',
        });
      } else {
        state.items.forEach((item, idx) => {
          if (!item.name?.trim()) {
            issues.push({
              field: `items[${idx}].name`,
              message: `Breadcrumb item #${idx + 1} has an empty title.`,
              severity: 'error',
            });
          }
          if (item.url?.trim() && !isValidWebUrl(item.url)) {
            issues.push({
              field: `items[${idx}].url`,
              message: `Breadcrumb #${idx + 1} URL must be a valid HTTP/HTTPS URL.`,
              severity: 'error',
            });
          }
        });
      }
      break;
    }

    case 'Recipe': {
      const state = data as unknown as RecipeFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'Recipe name is required.',
          severity: 'error',
        });
      }
      if (!state.image?.trim()) {
        issues.push({
          field: 'image',
          message: 'Image URL is required by Google for Recipe rich results.',
          severity: 'warning',
        });
      }
      if (!state.ingredients || state.ingredients.length === 0) {
        issues.push({
          field: 'ingredients',
          message: 'At least one ingredient is recommended for recipes.',
          severity: 'warning',
        });
      }
      break;
    }

    case 'VideoObject': {
      const state = data as unknown as VideoFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'Video title (name) is required.',
          severity: 'error',
        });
      }
      if (!state.description?.trim()) {
        issues.push({
          field: 'description',
          message: 'Video description is required by Google.',
          severity: 'error',
        });
      }
      if (!state.thumbnailUrl?.trim()) {
        issues.push({
          field: 'thumbnailUrl',
          message: 'Thumbnail URL is required by Google.',
          severity: 'error',
        });
      } else if (!isValidWebUrl(state.thumbnailUrl)) {
        issues.push({
          field: 'thumbnailUrl',
          message: 'Thumbnail must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      if (!state.uploadDate?.trim()) {
        issues.push({
          field: 'uploadDate',
          message: 'Upload date is required.',
          severity: 'error',
        });
      }
      break;
    }

    case 'JobPosting': {
      const state = data as unknown as JobPostingFormState;
      if (!state.title?.trim()) {
        issues.push({
          field: 'title',
          message: 'Job title is required.',
          severity: 'error',
        });
      }
      if (!state.description?.trim()) {
        issues.push({
          field: 'description',
          message: 'Job description is required.',
          severity: 'error',
        });
      }
      if (!state.hiringOrganizationName?.trim()) {
        issues.push({
          field: 'hiringOrganizationName',
          message: 'Hiring organization name is required by Google for Jobs.',
          severity: 'error',
        });
      }
      if (!state.datePosted?.trim()) {
        issues.push({
          field: 'datePosted',
          message: 'Date posted is required.',
          severity: 'error',
        });
      }
      if (state.validThrough?.trim() && state.datePosted?.trim()) {
        if (Date.parse(state.validThrough) < Date.parse(state.datePosted)) {
          issues.push({
            field: 'validThrough',
            message: 'Valid-through expiry date cannot precede date posted.',
            severity: 'error',
          });
        }
      }
      break;
    }

    case 'WebSite': {
      const state = data as unknown as WebSiteFormState;
      if (!state.name?.trim()) {
        issues.push({
          field: 'name',
          message: 'WebSite name is required.',
          severity: 'error',
        });
      }
      if (!state.url?.trim()) {
        issues.push({
          field: 'url',
          message: 'WebSite canonical URL is required.',
          severity: 'error',
        });
      } else if (!isValidWebUrl(state.url)) {
        issues.push({
          field: 'url',
          message: 'WebSite URL must be a valid HTTP/HTTPS URL.',
          severity: 'error',
        });
      }
      break;
    }

    default:
      break;
  }

  return issues;
}
