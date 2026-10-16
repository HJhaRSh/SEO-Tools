/**
 * Field utilities, duration conversion, URL safety, escaping, and sanitization
 */

/**
 * Convert user string duration (e.g. "30 mins", "1 hr 45 min", "90m", "PT1H30M") to standard ISO 8601 duration (e.g. "PT30M", "PT1H45M").
 * If already in ISO 8601 format (starting with P or PT), validates and returns.
 */
export function formatIsoDuration(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already standard ISO 8601 format (e.g. PT30M, P1DT2H, PT1H30M)
  if (/^P(T|\d)/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // Parse natural language: e.g. "1 hour 30 mins", "45 minutes", "2h 15m", "90 mins"
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  const hoursMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minutesMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i);
  const secondsMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i);

  if (hoursMatch) {
    hours = parseFloat(hoursMatch[1]);
  }
  if (minutesMatch) {
    minutes = parseFloat(minutesMatch[1]);
  }
  if (secondsMatch) {
    seconds = parseFloat(secondsMatch[1]);
  }

  // If plain number with no unit given, assume minutes (e.g. "45")
  if (!hoursMatch && !minutesMatch && !secondsMatch) {
    const plainNumber = parseFloat(trimmed);
    if (!isNaN(plainNumber) && plainNumber > 0) {
      minutes = plainNumber;
    } else {
      return null;
    }
  }

  // Convert decimal hours into minutes if needed
  if (hours % 1 !== 0) {
    const fraction = hours % 1;
    hours = Math.floor(hours);
    minutes += Math.round(fraction * 60);
  }

  if (minutes >= 60) {
    hours += Math.floor(minutes / 60);
    minutes = minutes % 60;
  }

  if (hours === 0 && minutes === 0 && seconds === 0) {
    return null;
  }

  let result = 'PT';
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0) result += `${minutes}M`;
  if (seconds > 0) result += `${seconds}S`;

  return result;
}

/**
 * Validate URL strictly: accepts http/https protocol, rejects javascript:, file:, data:, blob:.
 */
export function isValidWebUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject dangerous schemes
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss+HH:mm)
 */
export function isValidDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!trimmed) return false;

  // Check general pattern
  const dateRegex = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:?\d{2}|Z)?)?$/;
  if (!dateRegex.test(trimmed)) return false;

  const timestamp = Date.parse(trimmed);
  return !isNaN(timestamp);
}

/**
 * Clean and parse positive number
 */
export function parseCleanNumber(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') {
    return isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const clean = val.replace(/[^0-9.-]/g, '').trim();
    if (!clean) return null;
    const num = parseFloat(clean);
    return isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Generate a unique random string ID for dynamic form rows
 */
export function generateRowId(): string {
  return 'row_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
}

/**
 * Split multiline textarea or comma-separated text into a clean non-empty string array
 */
export function parseStringList(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Safely format script tag wrapping for HTML output.
 * Escapes closing script tags </script>, <script>, <!--, and --> to avoid
 * breaking the surrounding HTML document parser or causing XSS (per OWASP guidelines).
 */
export function escapeJsonForHtmlScript(jsonString: string): string {
  return jsonString
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<script/gi, '<\\/script')
    .replace(/<!--/g, '<\\!--')
    .replace(/-->/g, '--\\>');
}
