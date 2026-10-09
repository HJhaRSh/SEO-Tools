import { NextRequest, NextResponse } from 'next/server';
import { AI_BOT_REGISTRY } from '@/lib/seo/aiBotRegistry';

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      bots: AI_BOT_REGISTRY,
      totalBots: AI_BOT_REGISTRY.length
    },
    { status: 200 }
  );
}
