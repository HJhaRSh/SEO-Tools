import { DomainAge } from './domainAgeTypes';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Adds full years to a UTC date, clamping to end-of-month if target month has fewer days (e.g. Feb 29 -> Feb 28).
 */
export function addYearsUtc(d: Date, years: number): Date {
  const result = new Date(d.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  if (result.getUTCMonth() !== d.getUTCMonth()) {
    result.setUTCDate(0);
  }
  return result;
}

/**
 * Adds full months to a UTC date, clamping to end-of-month if target month has fewer days.
 */
export function addMonthsUtc(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  const origDay = d.getUTCDate();
  const targetYear = result.getUTCFullYear() + Math.floor((result.getUTCMonth() + months) / 12);
  const targetMonth = ((result.getUTCMonth() + months) % 12 + 12) % 12;

  result.setUTCFullYear(targetYear);
  result.setUTCMonth(targetMonth, 1);

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(origDay, daysInTargetMonth));

  return result;
}

/**
 * Performs calendar arithmetic from a start UTC date to an end UTC date.
 */
export function calculateDomainAge(
  startDate: Date,
  endDate: Date = new Date()
): {
  age: DomainAge;
  totalAgeDays: number;
  isFuture: boolean;
} {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  if (startMs > endMs) {
    return {
      age: { years: 0, months: 0, days: 0 },
      totalAgeDays: 0,
      isFuture: true
    };
  }

  const totalAgeDays = Math.floor((endMs - startMs) / 86400000);

  let years = 0;
  while (addYearsUtc(startDate, years + 1).getTime() <= endMs) {
    years++;
  }

  let curr = addYearsUtc(startDate, years);

  let months = 0;
  while (addMonthsUtc(curr, months + 1).getTime() <= endMs) {
    months++;
  }

  curr = addMonthsUtc(curr, months);

  const days = Math.floor((endMs - curr.getTime()) / 86400000);

  return {
    age: { years, months, days },
    totalAgeDays,
    isFuture: false
  };
}

/**
 * Calculates domain expiration state, days remaining, and human-readable label.
 */
export function calculateExpiryStatus(
  expiresAt: Date | null,
  now: Date = new Date()
): {
  daysUntilExpiry: number | null;
  expiryStatus: 'active' | 'passed' | 'unavailable';
  displayText: string;
} {
  if (!expiresAt || isNaN(expiresAt.getTime())) {
    return {
      daysUntilExpiry: null,
      expiryStatus: 'unavailable',
      displayText: 'Expiration date not available'
    };
  }

  const diffMs = expiresAt.getTime() - now.getTime();
  const days = Math.ceil(diffMs / 86400000);

  if (days > 0) {
    return {
      daysUntilExpiry: days,
      expiryStatus: 'active',
      displayText: `Expires in ${days.toLocaleString()} day${days === 1 ? '' : 's'}`
    };
  }

  return {
    daysUntilExpiry: days,
    expiryStatus: 'passed',
    displayText: 'Listed expiry date has passed — current registration status requires verification'
  };
}

/**
 * Formats a Date object as DD MMM YYYY in UTC.
 */
export function formatDateUtc(d: Date | string | null): string {
  if (!d) return 'Not available';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return 'Not available';

  const day = String(dateObj.getUTCDate()).padStart(2, '0');
  const month = MONTH_NAMES[dateObj.getUTCMonth()];
  const year = dateObj.getUTCFullYear();

  return `${day} ${month} ${year}`;
}
