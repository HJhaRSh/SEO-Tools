import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/seo/page-focus/geminiProvider';
import { cfHealthCheck } from '@/lib/seo/page-focus/cfWorkersProvider';
import { getPreferredProvider } from '@/lib/seo/page-focus/aiProviderFactory';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const provider = getPreferredProvider();
  
  const [geminiResult, cfResult] = await Promise.allSettled([
    healthCheck(),
    cfHealthCheck(),
  ]);

  return NextResponse.json({
    status: provider !== 'none' ? 'operational' : 'degraded',
    preferredProvider: provider,
    providers: {
      gemini: geminiResult.status === 'fulfilled' ? geminiResult.value : { available: false, error: 'check failed' },
      cloudflare: cfResult.status === 'fulfilled' ? cfResult.value : false,
    },
    timestamp: new Date().toISOString(),
  });
}
