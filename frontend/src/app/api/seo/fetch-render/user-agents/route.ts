import { NextResponse } from 'next/server';
import { FETCH_RENDER_USER_AGENTS } from '@/lib/seo/fetch-render/fetchRenderUserAgents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    success: true,
    userAgents: FETCH_RENDER_USER_AGENTS
  });
}
