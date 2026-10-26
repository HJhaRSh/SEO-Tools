import { RdapResponse, RdapEntity, DomainLookupStatus } from './domainAgeTypes';
import { isPrivateOrReservedIP, isBlockedHostname } from './ssrf';
import { isIP } from 'net';

export interface BootstrapService {
  tlds: string[];
  urls: string[];
}

export interface RdapQueryResult {
  status: DomainLookupStatus;
  data: RdapResponse | null;
  sourceUrl: string | null;
  error: string | null;
}

const IANA_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const BOOTSTRAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RDAP_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 512 * 1024;

let bootstrapServicesCache: BootstrapService[] | null = null;
let bootstrapLastFetchedAt = 0;
let bootstrapFetchPromise: Promise<BootstrapService[]> | null = null;

const FALLBACK_BOOTSTRAP_SERVICES: BootstrapService[] = [
  { tlds: ['com'], urls: ['https://rdap.verisign.com/com/v1/'] },
  { tlds: ['net'], urls: ['https://rdap.verisign.com/net/v1/'] },
  { tlds: ['org', 'ngo', 'ong', 'foundation'], urls: ['https://rdap.publicinterestregistry.org/rdap/'] },
  { tlds: ['info'], urls: ['https://rdap.afilias.net/rdap/info/'] },
  { tlds: ['biz'], urls: ['https://rdap.biz/rdap/'] },
  { tlds: ['in', 'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in'], urls: ['https://rdap.nixiregistry.in/rdap/'] },
  { tlds: ['uk', 'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk'], urls: ['https://rdap.nominet.uk/uk/'] },
  { tlds: ['au', 'com.au', 'net.au', 'org.au'], urls: ['https://rdap.auda.org.au/'] },
  { tlds: ['ca'], urls: ['https://rdap.ca.fury.ca/rdap/'] },
  { tlds: ['app', 'dev', 'page'], urls: ['https://rdap.nic.google/'] },
  { tlds: ['io'], urls: ['https://rdap.identitydigital.services/rdap/'] },
  { tlds: ['online', 'site', 'store', 'tech', 'website', 'space', 'fun', 'press', 'host'], urls: ['https://rdap.centralnic.com/'] },
  { tlds: ['xyz'], urls: ['https://rdap.centralnic.com/'] },
  { tlds: ['me'], urls: ['https://rdap.nic.me/'] },
  { tlds: ['co'], urls: ['https://rdap.nic.co/'] },
  { tlds: ['de'], urls: ['https://rdap.denic.de/'] },
  { tlds: ['fr'], urls: ['https://rdap.afnic.fr/'] },
  { tlds: ['nl'], urls: ['https://rdap.sidn.nl/'] },
  { tlds: ['br', 'com.br'], urls: ['https://rdap.registro.br/'] }
];

export async function getBootstrapServices(): Promise<BootstrapService[]> {
  const now = Date.now();
  if (bootstrapServicesCache && (now - bootstrapLastFetchedAt < BOOTSTRAP_CACHE_TTL_MS)) {
    return bootstrapServicesCache;
  }

  if (bootstrapFetchPromise) {
    return bootstrapFetchPromise;
  }

  bootstrapFetchPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(IANA_BOOTSTRAP_URL, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'IndianMarketers-DomainAgeChecker/1.0 (+https://indianmarketers.in/tools/domain-age-checker)'
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        if (json && Array.isArray(json.services)) {
          const parsedServices: BootstrapService[] = [];
          for (const s of json.services) {
            if (Array.isArray(s) && s.length >= 2 && Array.isArray(s[0]) && Array.isArray(s[1])) {
              parsedServices.push({
                tlds: s[0].map((t: string) => t.toLowerCase()),
                urls: s[1].map((u: string) => u.trim())
              });
            }
          }
          if (parsedServices.length > 0) {
            bootstrapServicesCache = parsedServices;
            bootstrapLastFetchedAt = Date.now();
            return parsedServices;
          }
        }
      }
    } catch {
      // Fallback silently if IANA request fails
    } finally {
      bootstrapFetchPromise = null;
    }

    if (!bootstrapServicesCache) {
      bootstrapServicesCache = FALLBACK_BOOTSTRAP_SERVICES;
      bootstrapLastFetchedAt = Date.now();
    }
    return bootstrapServicesCache;
  })();

  return bootstrapFetchPromise;
}

export async function resolveRdapBaseUrl(domain: string, services?: BootstrapService[]): Promise<string | null> {
  const activeServices = services || await getBootstrapServices();
  const lowerDomain = domain.toLowerCase().trim();
  const labels = lowerDomain.split('.');

  for (let i = 1; i < labels.length; i++) {
    const candidateSuffix = labels.slice(i).join('.');
    for (const service of activeServices) {
      if (service.tlds.includes(candidateSuffix)) {
        const httpsUrl = service.urls.find(u => u.startsWith('https://'));
        return httpsUrl || service.urls[0] || null;
      }
    }
  }

  for (let i = 1; i < labels.length; i++) {
    const candidateSuffix = labels.slice(i).join('.');
    for (const service of FALLBACK_BOOTSTRAP_SERVICES) {
      if (service.tlds.includes(candidateSuffix)) {
        const httpsUrl = service.urls.find(u => u.startsWith('https://'));
        return httpsUrl || service.urls[0] || null;
      }
    }
  }

  return null;
}

function validateSafeTargetUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;

    const hostname = u.hostname.toLowerCase();
    if (isBlockedHostname(hostname)) return false;

    const cleanHost = hostname.split(':')[0].replace(/^\[|\]$/g, '');
    if (isIP(cleanHost) !== 0 && isPrivateOrReservedIP(cleanHost)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function queryRdapRecord(
  domain: string,
  customBaseUrl?: string
): Promise<RdapQueryResult> {
  const baseUrl = customBaseUrl || await resolveRdapBaseUrl(domain);

  if (!baseUrl) {
    return {
      status: 'unsupported',
      data: null,
      sourceUrl: null,
      error: 'Public registration lookup is not currently available for this TLD.'
    };
  }

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  let currentTargetUrl = `${normalizedBase}domain/${encodeURIComponent(domain)}`;

  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    if (!validateSafeTargetUrl(currentTargetUrl)) {
      return {
        status: 'error',
        data: null,
        sourceUrl: currentTargetUrl,
        error: 'Security restriction: Invalid or blocked destination address.'
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);

    try {
      const res = await fetch(currentTargetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/rdap+json, application/json',
          'User-Agent': 'IndianMarketers-DomainAgeChecker/1.0 (+https://indianmarketers.in/tools/domain-age-checker)'
        },
        redirect: 'manual',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          return {
            status: 'error',
            data: null,
            sourceUrl: currentTargetUrl,
            error: 'Received redirect response without Location header.'
          };
        }

        const resolvedLocation = new URL(location, currentTargetUrl).href;
        currentTargetUrl = resolvedLocation;
        redirectCount++;
        continue;
      }

      if (res.status === 404) {
        return {
          status: 'not_found',
          data: null,
          sourceUrl: currentTargetUrl,
          error: 'Domain not found in authoritative registry.'
        };
      }

      if (res.status === 429) {
        return {
          status: 'rate_limited',
          data: null,
          sourceUrl: currentTargetUrl,
          error: 'Authoritative registry has temporarily rate limited requests. Please try again in a few moments.'
        };
      }

      if (res.status >= 500) {
        return {
          status: 'error',
          data: null,
          sourceUrl: currentTargetUrl,
          error: `Authoritative registry service unavailable (HTTP ${res.status}).`
        };
      }

      if (!res.ok) {
        return {
          status: 'error',
          data: null,
          sourceUrl: currentTargetUrl,
          error: `Authoritative registry returned HTTP error ${res.status}.`
        };
      }

      const text = await res.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        return {
          status: 'error',
          data: null,
          sourceUrl: currentTargetUrl,
          error: 'Authoritative registry response exceeded maximum safe size limit.'
        };
      }

      let parsed: RdapResponse;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {
          status: 'error',
          data: null,
          sourceUrl: currentTargetUrl,
          error: 'Received malformed JSON response from authoritative registry.'
        };
      }

      return {
        status: 'success',
        data: parsed,
        sourceUrl: currentTargetUrl,
        error: null
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('aborted')) {
        return {
          status: 'timeout',
          data: null,
          sourceUrl: currentTargetUrl,
          error: 'Authoritative registry request timed out.'
        };
      }

      return {
        status: 'error',
        data: null,
        sourceUrl: currentTargetUrl,
        error: 'Unable to connect to the authoritative registry.'
      };
    }
  }

  return {
    status: 'error',
    data: null,
    sourceUrl: currentTargetUrl,
    error: 'Too many redirects encountered while querying registry.'
  };
}

export function extractRegistrar(entities?: RdapEntity[]): string | null {
  if (!entities || !Array.isArray(entities)) return null;

  for (const entity of entities) {
    if (entity.roles && entity.roles.includes('registrar')) {
      if (Array.isArray(entity.vcardArray) && entity.vcardArray.length >= 2) {
        const vcards = entity.vcardArray[1];
        if (Array.isArray(vcards)) {
          const fnEntry = vcards.find((v: any) => Array.isArray(v) && v[0] === 'fn');
          if (fnEntry && typeof fnEntry[3] === 'string' && fnEntry[3].trim()) {
            return fnEntry[3].trim();
          }
          const orgEntry = vcards.find((v: any) => Array.isArray(v) && v[0] === 'org');
          if (orgEntry && typeof orgEntry[3] === 'string' && orgEntry[3].trim()) {
            return orgEntry[3].trim();
          }
        }
      }

      if (entity.name && typeof entity.name === 'string') return entity.name.trim();
      if (entity.handle && typeof entity.handle === 'string') return entity.handle.trim();
    }

    if (entity.entities && Array.isArray(entity.entities)) {
      const nested = extractRegistrar(entity.entities);
      if (nested) return nested;
    }
  }

  return null;
}

export function extractRdapEvents(events?: { eventAction: string; eventDate: string }[]): {
  createdAt: Date | null;
  updatedAt: Date | null;
  expiresAt: Date | null;
} {
  let createdAt: Date | null = null;
  let updatedAt: Date | null = null;
  let expiresAt: Date | null = null;

  if (!events || !Array.isArray(events)) {
    return { createdAt, updatedAt, expiresAt };
  }

  for (const ev of events) {
    if (!ev || !ev.eventAction || !ev.eventDate) continue;
    const action = ev.eventAction.toLowerCase().trim();
    const parsedDate = new Date(ev.eventDate);
    if (isNaN(parsedDate.getTime())) continue;

    if (action === 'registration') {
      createdAt = parsedDate;
    } else if (action === 'last changed' || action === 'last update') {
      updatedAt = parsedDate;
    } else if (action === 'expiration') {
      expiresAt = parsedDate;
    }
  }

  return { createdAt, updatedAt, expiresAt };
}

export function normalizeRegistrationStatuses(statuses?: string[]): string[] {
  if (!statuses || !Array.isArray(statuses)) return [];

  const readable = statuses
    .filter(s => typeof s === 'string' && s.trim())
    .map(s => {
      const clean = s.trim();
      return clean
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    });

  return Array.from(new Set(readable));
}

export function extractNameservers(nameservers?: { ldhName?: string; unicodeName?: string; handle?: string }[]): string[] {
  if (!nameservers || !Array.isArray(nameservers)) return [];

  const nsList = nameservers
    .map(ns => (ns.ldhName || ns.unicodeName || ns.handle || '').toLowerCase().trim())
    .filter(Boolean);

  return Array.from(new Set(nsList));
}
