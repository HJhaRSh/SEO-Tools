import { NextRequest, NextResponse } from 'next/server';

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q')?.trim() || '';

    if (query.length < 2) {
      return NextResponse.json({ locations: [] });
    }

    const cleanQuery = query.slice(0, 100);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=8`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'IndianMarketers-SEOTools/1.0'
      }
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ locations: [] });
    }

    const data = (await res.json()) as { features?: PhotonFeature[] };
    const rawFeatures = data.features || [];

    const suggestions: LocationSuggestion[] = [];
    const seen = new Set<string>();

    for (const f of rawFeatures) {
      const formatted = formatPhotonFeature(f.properties);
      if (formatted) {
        const key = formatted.canonicalName.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          suggestions.push(formatted);
        }
      }
    }

    return NextResponse.json({ locations: suggestions });
  } catch {
    return NextResponse.json({ locations: [] });
  }
}

