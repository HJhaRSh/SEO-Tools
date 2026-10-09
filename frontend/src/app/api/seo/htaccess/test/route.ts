import { NextRequest, NextResponse } from 'next/server';
import { testHtaccessRules } from '@/lib/seo/htaccessService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, htaccess, serverVariables, settings } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid target URL is required.' },
        { status: 400 }
      );
    }

    if (!htaccess || typeof htaccess !== 'string') {
      return NextResponse.json(
        { success: false, error: 'The .htaccess content is required.' },
        { status: 400 }
      );
    }

    const result = await testHtaccessRules({
      url,
      htaccess,
      serverVariables: serverVariables || {},
      settings: settings || {}
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'An error occurred while evaluating .htaccess rules.'
      },
      { status: 400 }
    );
  }
}
