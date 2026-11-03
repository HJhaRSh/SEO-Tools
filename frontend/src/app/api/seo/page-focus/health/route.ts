import { NextRequest, NextResponse } from 'next/server';
import { healthCheck } from '@/lib/seo/page-focus/geminiProvider';
import { cfHealthCheck } from '@/lib/seo/page-focus/cfWorkersProvider';
import { getPreferredProvider } from '@/lib/seo/page-focus/aiProviderFactory';

export const runtime = 'nodejs';

// 10-minute cache for live health probes to prevent quota exhaustion from diagnostic scripts
interface CachedHealth {
  timestamp: number;
  data: any;
}
let cachedLiveHealth: CachedHealth | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const wantsLiveProbe = searchParams.get('live') === 'true';

  const provider = getPreferredProvider();

  // Non-consuming configuration check (default for public/monitoring requests)
  if (!wantsLiveProbe) {
    const [geminiResult, cfResult] = await Promise.allSettled([
      healthCheck({ live: false }),
      cfHealthCheck({ live: false }),
    ]);

    return NextResponse.json({
      status: provider !== 'none' ? 'operational' : 'degraded',
      preferredProvider: provider,
      checkType: 'configuration-non-consuming',
      providers: {
        gemini: geminiResult.status === 'fulfilled' ? geminiResult.value : { available: false, error: 'check failed' },
        cloudflare: cfResult.status === 'fulfilled' ? cfResult.value : false,
      },
      quotaNote: 'Zero AI quota consumed for this static configuration check.',
      timestamp: new Date().toISOString(),
    });
  }

  // Live AI Probe: Requires authorization to prevent public users exhausting quotas
  const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const secretKey = searchParams.get('key');
  const adminSecret = process.env.ADMIN_SECRET || process.env.SESSION_SECRET;

  const isAuthorized = adminSecret && (authHeader === adminSecret || secretKey === adminSecret);

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: 'Live AI provider health probe requires administrative authorization. Use non-consuming check without ?live=true.',
        hint: 'Public monitoring should use GET /api/seo/page-focus/health (non-consuming).',
      },
      { status: 401 }
    );
  }

  // Return cached live result if still within 10-minute window
  const now = Date.now();
  if (cachedLiveHealth && now - cachedLiveHealth.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cachedLiveHealth.data,
      cached: true,
      cacheAgeMs: now - cachedLiveHealth.timestamp,
    });
  }

  // Execute protected live probe
  const [geminiResult, cfResult] = await Promise.allSettled([
    healthCheck({ live: true }),
    cfHealthCheck({ live: true }),
  ]);

  const responseData = {
    status: provider !== 'none' ? 'operational' : 'degraded',
    preferredProvider: provider,
    checkType: 'live-probe',
    providers: {
      gemini: geminiResult.status === 'fulfilled' ? geminiResult.value : { available: false, error: 'check failed' },
      cloudflare: cfResult.status === 'fulfilled' ? cfResult.value : false,
    },
    timestamp: new Date().toISOString(),
  };

  cachedLiveHealth = {
    timestamp: now,
    data: responseData,
  };

  return NextResponse.json(responseData);
}
