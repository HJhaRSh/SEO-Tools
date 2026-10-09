import { NextResponse } from 'next/server';
import { HTACCESS_EXAMPLES } from '@/lib/seo/htaccessExamples';

export async function GET() {
  return NextResponse.json({
    success: true,
    examples: HTACCESS_EXAMPLES
  });
}
