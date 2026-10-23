import { ISO_LANGUAGES, ISO_REGIONS, ISO_SCRIPTS } from './constants';
import { HreflangIssue } from './types';

export interface ParsedLocale {
  isValid: boolean;
  isXDefault: boolean;
  language: string | null;
  languageName: string | null;
  region: string | null;
  regionName: string | null;
  script: string | null;
  scriptName: string | null;
  issues: HreflangIssue[];
}

/**
 * Validates hreflang syntax strictly according to Google specifications:
 * - Special "x-default"
 * - ISO 639-1 language (lowercase) e.g., "en", "de"
 * - Optional ISO 15924 script e.g., "zh-Hans", "zh-Hant"
 * - Optional ISO 3166-1 Alpha-2 region (uppercase) e.g., "en-US", "en-GB"
 * - Supported combinations like "zh-Hans-TW"
 * 
 * Accurately catches common SEO pitfalls like:
 * - "en-UK" (UK is not ISO 3166-1; GB is correct)
 * - "UK", "US" (Region-only is invalid)
 * - "english", "spanish" (Full words invalid)
 * - Underscore instead of hyphen ("en_US")
 */
export function validateHreflangCode(rawCode: string): ParsedLocale {
  const code = (rawCode || '').trim();
  const issues: HreflangIssue[] = [];

  if (!code) {
    issues.push({
      code: 'EMPTY_HREFLANG',
      severity: 'error',
      message: 'hreflang value cannot be empty.',
    });
    return {
      isValid: false,
      isXDefault: false,
      language: null,
      languageName: null,
      region: null,
      regionName: null,
      script: null,
      scriptName: null,
      issues,
    };
  }

  // Handle x-default
  if (code.toLowerCase() === 'x-default') {
    if (code !== 'x-default') {
      issues.push({
        code: 'CASING_CONVENTION',
        severity: 'info',
        message: `hreflang="${code}" should ideally be lowercase "x-default".`,
      });
    }
    return {
      isValid: true,
      isXDefault: true,
      language: 'x-default',
      languageName: 'Default / Language Selector Fallback',
      region: null,
      regionName: null,
      script: null,
      scriptName: null,
      issues,
    };
  }

  // Check for common formatting mistake: underscore instead of hyphen (e.g. en_US)
  if (code.includes('_')) {
    issues.push({
      code: 'INVALID_DELIMITER',
      severity: 'error',
      message: `hreflang contains an underscore ("${code}"). Google requires hyphens (e.g., "${code.replace(/_/g, '-')}").`,
    });
  }

  const parts = code.split(/[-_]/).map((p) => p.trim());

  if (parts.length === 1) {
    const langPart = parts[0].toLowerCase();

    // Check if user entered a region code alone (e.g. "US", "UK", "DE")
    if (ISO_REGIONS[langPart] && !ISO_LANGUAGES[langPart]) {
      issues.push({
        code: 'REGION_WITHOUT_LANGUAGE',
        severity: 'error',
        message: `"${code}" is a region code, not a language. Google hreflang requires a language code first (e.g. "en-${parts[0].toUpperCase()}").`,
      });
      return {
        isValid: false,
        isXDefault: false,
        language: null,
        languageName: null,
        region: langPart.toUpperCase(),
        regionName: ISO_REGIONS[langPart],
        script: null,
        scriptName: null,
        issues,
      };
    }

    if (ISO_LANGUAGES[langPart]) {
      return {
        isValid: issues.filter((i) => i.severity === 'error').length === 0,
        isXDefault: false,
        language: langPart,
        languageName: ISO_LANGUAGES[langPart],
        region: null,
        regionName: null,
        script: null,
        scriptName: null,
        issues,
      };
    }

    issues.push({
      code: 'INVALID_LANGUAGE_CODE',
      severity: 'error',
      message: `"${code}" is not a recognized ISO 639-1 language code.`,
    });

    return {
      isValid: false,
      isXDefault: false,
      language: langPart,
      languageName: null,
      region: null,
      regionName: null,
      script: null,
      scriptName: null,
      issues,
    };
  }

  if (parts.length === 2) {
    const p1 = parts[0].toLowerCase();
    const p2 = parts[1].toLowerCase();

    const isLang1 = Boolean(ISO_LANGUAGES[p1]);
    const isRegion2 = Boolean(ISO_REGIONS[p2]);
    const isScript2 = Boolean(ISO_SCRIPTS[p2]);

    // Check specifically for en-UK misconception
    if (p2 === 'uk') {
      issues.push({
        code: 'INVALID_UK_REGION',
        severity: 'error',
        message: '"uk" is not an official ISO 3166-1 country code. For the United Kingdom, use "gb" (e.g. "en-GB").',
      });
    }

    if (!isLang1) {
      issues.push({
        code: 'INVALID_LANGUAGE_CODE',
        severity: 'error',
        message: `"${parts[0]}" is not a valid ISO 639-1 language code.`,
      });
    }

    if (!isRegion2 && !isScript2 && p2 !== 'uk') {
      issues.push({
        code: 'INVALID_REGION_OR_SCRIPT',
        severity: 'error',
        message: `"${parts[1]}" is neither a valid ISO 3166-1 Alpha-2 region nor a supported ISO 15924 script.`,
      });
    }

    return {
      isValid: issues.filter((i) => i.severity === 'error').length === 0,
      isXDefault: false,
      language: isLang1 ? p1 : parts[0],
      languageName: isLang1 ? ISO_LANGUAGES[p1] : null,
      region: isRegion2 ? p2.toUpperCase() : null,
      regionName: isRegion2 ? ISO_REGIONS[p2] : null,
      script: isScript2 ? p2.charAt(0).toUpperCase() + p2.slice(1).toLowerCase() : null,
      scriptName: isScript2 ? ISO_SCRIPTS[p2] : null,
      issues,
    };
  }

  if (parts.length === 3) {
    // Language + Script + Region (e.g. zh-Hans-TW, sr-Latn-RS)
    const p1 = parts[0].toLowerCase();
    const p2 = parts[1].toLowerCase();
    const p3 = parts[2].toLowerCase();

    const isLang = Boolean(ISO_LANGUAGES[p1]);
    const isScript = Boolean(ISO_SCRIPTS[p2]);
    const isRegion = Boolean(ISO_REGIONS[p3]);

    if (!isLang) {
      issues.push({
        code: 'INVALID_LANGUAGE_CODE',
        severity: 'error',
        message: `"${parts[0]}" is not a recognized language code.`,
      });
    }
    if (!isScript) {
      issues.push({
        code: 'INVALID_SCRIPT_CODE',
        severity: 'error',
        message: `"${parts[1]}" is not a recognized 4-letter script code (e.g., Hans, Hant, Cyrl, Latn).`,
      });
    }
    if (!isRegion) {
      issues.push({
        code: 'INVALID_REGION_CODE',
        severity: 'error',
        message: `"${parts[2]}" is not a recognized ISO 3166-1 Alpha-2 region code.`,
      });
    }

    return {
      isValid: issues.filter((i) => i.severity === 'error').length === 0,
      isXDefault: false,
      language: isLang ? p1 : parts[0],
      languageName: isLang ? ISO_LANGUAGES[p1] : null,
      region: isRegion ? p3.toUpperCase() : parts[2],
      regionName: isRegion ? ISO_REGIONS[p3] : null,
      script: isScript ? p2.charAt(0).toUpperCase() + p2.slice(1).toLowerCase() : parts[1],
      scriptName: isScript ? ISO_SCRIPTS[p2] : null,
      issues,
    };
  }

  issues.push({
    code: 'MALFORMED_HREFLANG_SYNTAX',
    severity: 'error',
    message: `"${code}" has too many components. Expected format: language (e.g. "en"), language-region ("en-US"), or language-script-region ("zh-Hans-CN").`,
  });

  return {
    isValid: false,
    isXDefault: false,
    language: parts[0] || null,
    languageName: null,
    region: null,
    regionName: null,
    script: null,
    scriptName: null,
    issues,
  };
}

export interface HtmlLangValidationResult {
  isValid: boolean;
  status: 'valid' | 'missing' | 'invalid';
  language: string | null;
  region: string | null;
  message: string;
  issues: HreflangIssue[];
}

/**
 * Validates the <html lang="..."> attribute according to W3C and Google SEO guidelines.
 */
export function validateHtmlLang(htmlLang: string | null | undefined): HtmlLangValidationResult {
  const issues: HreflangIssue[] = [];

  if (!htmlLang || !htmlLang.trim()) {
    issues.push({
      code: 'MISSING_HTML_LANG',
      severity: 'warning',
      message: 'The <html> tag is missing a "lang" attribute (e.g. <html lang="en">). W3C and search engines recommend specifying the document language.',
    });
    return {
      isValid: false,
      status: 'missing',
      language: null,
      region: null,
      message: 'Missing lang attribute on <html> element.',
      issues,
    };
  }

  const locale = validateHreflangCode(htmlLang);

  if (!locale.isValid || !locale.language) {
    issues.push({
      code: 'INVALID_HTML_LANG',
      severity: 'warning',
      message: `The <html> tag specifies an invalid or non-standard language code: "${htmlLang}". Ensure it uses a valid ISO 639-1 language code.`,
    });
    return {
      isValid: false,
      status: 'invalid',
      language: locale.language,
      region: locale.region,
      message: `Invalid language code in <html lang="${htmlLang}">.`,
      issues,
    };
  }

  return {
    isValid: true,
    status: 'valid',
    language: locale.language,
    region: locale.region,
    message: `Valid ISO language declaration (<html lang="${htmlLang}">).`,
    issues: [],
  };
}

export interface HreflangHtmlLangComparison {
  status: 'match' | 'mismatch' | 'missing' | 'untested';
  message: string;
  isCompatible: boolean;
  issues: HreflangIssue[];
}

/**
 * Compares an hreflang declaration against the destination page's <html lang="..."> attribute.
 * Detects language mismatches (e.g., hreflang="ar-AE" pointing to a page with <html lang="en">).
 */
export function compareHreflangWithHtmlLang(
  hreflang: string,
  htmlLang: string | null | undefined,
  targetUrl?: string
): HreflangHtmlLangComparison {
  const issues: HreflangIssue[] = [];

  if (!htmlLang || !htmlLang.trim()) {
    issues.push({
      code: 'MISSING_HTML_LANG_ALTERNATE',
      severity: 'warning',
      message: `Target page "${targetUrl || ''}" is missing a "lang" attribute in its <html> tag.`,
      alternateUrl: targetUrl,
      hreflang,
    });
    return {
      status: 'missing',
      message: 'Missing lang attribute in <html> tag.',
      isCompatible: false,
      issues,
    };
  }

  const cleanHreflang = hreflang.trim().toLowerCase();
  const cleanHtmlLang = htmlLang.trim().toLowerCase();

  // x-default is a fallback / country selector and can contain any language
  if (cleanHreflang === 'x-default') {
    return {
      status: 'match',
      message: `x-default fallback page specifies <html lang="${htmlLang}">.`,
      isCompatible: true,
      issues: [],
    };
  }

  // Parse hreflang code
  const hrefLocale = validateHreflangCode(cleanHreflang);
  const htmlLocale = validateHreflangCode(cleanHtmlLang);

  const hrefLang = hrefLocale.language?.toLowerCase() || '';
  const htmlLangCode = htmlLocale.language?.toLowerCase() || '';

  // Language subtag mismatch (e.g., 'ar' vs 'en')
  if (hrefLang && htmlLangCode && hrefLang !== htmlLangCode) {
    const errorMsg = `Language mismatch: hreflang specifies "${hreflang}" (${hrefLocale.languageName || hrefLang}), but the target page declares <html lang="${htmlLang}"> (${htmlLocale.languageName || htmlLangCode}).`;
    issues.push({
      code: 'HTML_LANG_MISMATCH',
      severity: 'error',
      message: errorMsg,
      alternateUrl: targetUrl,
      hreflang,
    });
    return {
      status: 'mismatch',
      message: errorMsg,
      isCompatible: false,
      issues,
    };
  }

  // Regional conflict (e.g., hreflang="en-GB" but <html lang="en-US">)
  const hrefRegion = hrefLocale.region?.toLowerCase();
  const htmlRegion = htmlLocale.region?.toLowerCase();
  if (hrefRegion && htmlRegion && hrefRegion !== htmlRegion) {
    const warningMsg = `Regional targeting divergence: hreflang targets "${hrefLocale.regionName || hrefRegion.toUpperCase()}" (${hreflang}), but target page specifies region "${htmlLocale.regionName || htmlRegion.toUpperCase()}" (<html lang="${htmlLang}">).`;
    issues.push({
      code: 'HTML_LANG_REGION_MISMATCH',
      severity: 'warning',
      message: warningMsg,
      alternateUrl: targetUrl,
      hreflang,
    });
    return {
      status: 'mismatch',
      message: warningMsg,
      isCompatible: false,
      issues,
    };
  }

  return {
    status: 'match',
    message: `<html lang="${htmlLang}"> is consistent with hreflang="${hreflang}".`,
    isCompatible: true,
    issues: [],
  };
}
