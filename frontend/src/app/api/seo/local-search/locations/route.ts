import { NextRequest, NextResponse } from 'next/server';
import { filterCuratedLocations } from '@/lib/seo/localSearchService';

export const dynamic = 'force-dynamic';

export interface LocationSuggestion {
  canonicalName: string;
  title: string;
  subtitle: string;
  countryCode: string;
}

interface PhotonFeature {
  properties: {
    name?: string;
    district?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
}

interface NominatimItem {
  name?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    neighbourhood?: string;
    state_district?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

function formatPhotonFeature(p: PhotonFeature['properties']): LocationSuggestion | null {
  if (!p || !p.name) return null;

  const parts: string[] = [];
  const add = (val?: string) => {
    if (!val) return;
    const items = String(val).split(',');
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed && !parts.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        parts.push(trimmed);
      }
    }
  };

  add(p.name);
  if (p.district && p.district.toLowerCase() !== p.name.toLowerCase()) {
    add(p.district);
  }
  add(p.city || p.town || p.village);
  add(p.state);
  add(p.country);

  const canonicalName = parts.join(', ');
  if (!canonicalName) return null;

  return {
    canonicalName,
    title: parts[0] || p.name,
    subtitle: parts.slice(1).join(', '),
    countryCode: (p.countrycode || '').toLowerCase()
  };
}

function formatNominatimItem(item: NominatimItem): LocationSuggestion | null {
  if (!item) return null;
  const addr = item.address || {};
  const primaryName =
    item.name ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.city ||
    addr.town ||
    addr.village;
  if (!primaryName) return null;

  const parts: string[] = [];
  const add = (val?: string) => {
    if (!val) return;
    const items = String(val).split(',');
    for (const it of items) {
      const trimmed = it.trim();
      if (trimmed && !parts.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
        parts.push(trimmed);
      }
    }
  };

  add(primaryName);
  add(addr.suburb || addr.neighbourhood);
  add(addr.city || addr.town || addr.village);
  add(addr.state);
  add(addr.country);

  const canonicalName = parts.join(', ');
  if (!canonicalName) return null;

  return {
    canonicalName,
    title: parts[0] || primaryName,
    subtitle: parts.slice(1).join(', '),
    countryCode: (addr.country_code || '').toLowerCase()
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() || '';

    if (query.length < 2) {
      return NextResponse.json({ locations: [] });
    }

    const cleanQuery = query.slice(0, 100);
    const suggestions: LocationSuggestion[] = [];
    const seen = new Set<string>();

    const addSuggestion = (s: LocationSuggestion | null) => {
      if (!s) return;
      const key = s.canonicalName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push(s);
      }
    };

    // 1. Try Photon (OpenStreetMap Autocomplete)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=8`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) IndianMarketers-SEOTools/1.0'
        }
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as { features?: PhotonFeature[] };
        for (const f of data.features || []) {
          addSuggestion(formatPhotonFeature(f.properties));
        }
      }
    } catch {
      // Ignore and continue to fallback
    }

    // 2. If Photon returned few or no results, query Nominatim
    if (suggestions.length < 3) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=6&addressdetails=1`,
          {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'IndianMarketers-SEOTools/1.0 (contact@indianmarketers.in)'
            }
          }
        );
        clearTimeout(timeout);

        if (res.ok) {
          const items = (await res.json()) as NominatimItem[];
          for (const item of items || []) {
            addSuggestion(formatNominatimItem(item));
          }
        }
      } catch {
        // Ignore and continue to curated fallback
      }
    }

    // 3. Fallback to matching curated locations if upstream networks are unreachable or rate-limited
    if (suggestions.length === 0) {
      const curated = filterCuratedLocations(cleanQuery, 8);
      for (const c of curated) {
        const parts = c.name.split(',');
        addSuggestion({
          canonicalName: c.name,
          title: parts[0]?.trim() || c.name,
          subtitle: parts.slice(1).join(', ').trim(),
          countryCode: c.countryCode
        });
      }
    }

    return NextResponse.json({ locations: suggestions });
  } catch {
    return NextResponse.json({ locations: [] });
  }
}
