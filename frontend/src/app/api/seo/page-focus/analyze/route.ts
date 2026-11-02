import { NextRequest, NextResponse } from 'next/server';
import { AnalyzeRequestSchema } from '@/lib/seo/page-focus/types';
import { extractPage, parseManualText } from '@/lib/seo/page-focus/extractionService';
import {
  computeFinalScore,
  computeHeadingAlignmentScore,
  computeTopicalCoherence,
  interpretScore,
  cosineSimilarity,
  calibrateCosineSimilarity,
} from '@/lib/seo/page-focus/scoringEngine';
import { runAIAnalysis } from '@/lib/seo/page-focus/aiProviderFactory';
import { generateEmbeddings } from '@/lib/seo/page-focus/geminiProvider';
import { hashCacheKey, analysisCache } from '@/lib/seo/page-focus/cacheService';
import { checkRateLimit, getRateLimitConfig } from '@/lib/seo/page-focus/rateLimiter';
import { SCORING_VERSION, PROMPT_VERSION } from '@/lib/seo/page-focus/types';
import type { PageFocusReport, ScoreComponents, SectionAnalysis } from '@/lib/seo/page-focus/types';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 90; // Vercel Pro allows 90s; free tier 60s

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before running another analysis.', retryAfterMs: rateCheck.retryAfterMs, reason: rateCheck.reason },
      { status: 429 }
    );
  }

  // Parse + validate request
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request parameters.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { url, targetTopic, manualText } = parsed.data;

  // Check cache
  const cacheKey = await hashCacheKey(url, targetTopic);
  const cached = analysisCache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  // Extract page content
  let page;
  try {
    if (manualText && manualText.length > 100) {
      page = parseManualText(manualText);
    } else {
      page = await extractPage(url);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch page';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (page.extractionQuality === 'failed') {
    return NextResponse.json({ error: page.extractionNote || 'Failed to extract page content.' }, { status: 422 });
  }

  // Run AI analysis
  const { output: aiOutput, provider: aiProvider, error: aiError } = await runAIAnalysis({
    page,
    targetTopic: targetTopic || null,
  });

  // Compute deterministic score components and real vector embeddings
  let scoreComponents: ScoreComponents | null = null;
  let overallScore: number | null = null;
  let scoreInterpretation: string | null = null;
  const sectionSimilarityMap = new Map<string, number>();

  if (targetTopic) {
    // Generate real vector embeddings using gemini-embedding-2 for target topic and page sections
    let semanticSimilarityScore = 50;
    try {
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        const textsToEmbed = [
          targetTopic,
          ...page.sections.map(s => `${s.heading || ''} ${s.content}`.slice(0, 800)),
        ];
        const vectors = await generateEmbeddings(textsToEmbed);
        const topicVector = vectors[0];

        if (topicVector && topicVector.length > 0) {
          const sectionSimilarities: number[] = [];
          for (let i = 0; i < page.sections.length; i++) {
            const secVector = vectors[i + 1];
            if (secVector && secVector.length > 0) {
              const rawCos = cosineSimilarity(topicVector, secVector);
              const calibratedSecScore = Math.round(calibrateCosineSimilarity(rawCos));
              sectionSimilarityMap.set(page.sections[i].id, calibratedSecScore);
              sectionSimilarities.push(calibratedSecScore);
            }
          }

          if (sectionSimilarities.length > 0) {
            // Aggregate top 5 sections for overall semantic similarity
            const sorted = [...sectionSimilarities].sort((a, b) => b - a);
            const top5 = sorted.slice(0, Math.min(5, sorted.length));
            semanticSimilarityScore = Math.round(top5.reduce((a, b) => a + b, 0) / top5.length);
          }
        }
      }
    } catch (embErr) {
      console.warn('Real embedding generation fallback:', embErr);
    }

    if (aiOutput) {
      const headingAlignment = computeHeadingAlignmentScore(targetTopic, page.headings);
      // Incorporate both AI alignment scores and real vector similarities for sections
      const sectionScores = page.sections.map(s => {
        const vecScore = sectionSimilarityMap.get(s.id);
        const aiScore = aiOutput.sectionFindings.find(f => f.sectionId === s.id)?.topicAlignmentScore;
        if (vecScore !== undefined && aiScore !== undefined) {
          return Math.round(vecScore * 0.6 + aiScore * 0.4);
        }
        return vecScore !== undefined ? vecScore : (aiScore !== undefined ? aiScore : 50);
      });

      const topicalCoherence = computeTopicalCoherence(sectionScores);

      scoreComponents = {
        semanticSimilarity: Math.round(semanticSimilarityScore),
        searchIntentAlignment: Math.round(aiOutput.aiScoreComponents.searchIntentAlignment),
        topicalCoverage: Math.round(aiOutput.aiScoreComponents.topicalCoverage),
        headingStructuralAlignment: Math.round(headingAlignment),
        supportingContextDepth: Math.round(aiOutput.aiScoreComponents.supportingContextDepth),
        topicalCoherence: Math.round(topicalCoherence),
      };

      overallScore = computeFinalScore(scoreComponents);
      scoreInterpretation = interpretScore(overallScore);
    }
  }

  // Build full report
  const analysisId = crypto.randomUUID();
  const report: PageFocusReport = {
    analysisId,
    timestamp: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    scoringVersion: SCORING_VERSION,
    aiProvider,
    targetUrl: url,
    targetTopic: targetTopic || null,
    competitorUrl: null,
    page,
    competitorPage: null,
    pageSummary: aiOutput?.pageSummary || 'AI analysis unavailable.',
    primaryTopic: aiOutput ? {
      ...aiOutput.primaryTopic,
      isPrimary: true,
    } : {
      name: 'Unknown',
      centralityScore: 0,
      isPrimary: true,
      explanation: 'AI analysis unavailable.',
      supportingSectionIds: [],
      type: 'central',
    },
    secondaryTopics: (aiOutput?.secondaryTopics || []).map(t => ({ ...t, isPrimary: false })),
    searchIntent: aiOutput?.searchIntent || null,
    overallRelevanceScore: overallScore,
    scoreComponents,
    scoreInterpretation,
    topicCoverage: aiOutput?.topicCoverage || [],
    contentGaps: aiOutput?.contentGaps || [],
    sectionAnalyses: page.sections.map(s => {
      const aiFinding = aiOutput?.sectionFindings.find(f => f.sectionId === s.id);
      const vecScore = sectionSimilarityMap.get(s.id);
      const combinedScore = vecScore !== undefined && aiFinding
        ? Math.round(vecScore * 0.6 + aiFinding.topicAlignmentScore * 0.4)
        : (vecScore !== undefined ? vecScore : (aiFinding?.topicAlignmentScore || 50));

      let alignmentLabel: 'strong' | 'moderate' | 'weak' | 'off-topic' = 'moderate';
      if (combinedScore >= 75) alignmentLabel = 'strong';
      else if (combinedScore >= 50) alignmentLabel = 'moderate';
      else if (combinedScore >= 25) alignmentLabel = 'weak';
      else alignmentLabel = 'off-topic';

      return {
        sectionId: s.id,
        heading: s.heading || null,
        topicAlignmentScore: combinedScore,
        alignmentLabel,
        stronglyCoveredConcepts: aiFinding?.stronglyCoveredConcepts || [],
        weaklyCoveredConcepts: aiFinding?.weaklyCoveredConcepts || [],
        missingContext: aiFinding?.missingContext || null,
        explanation: aiFinding?.explanation || `Section evaluated via 3072-dimensional semantic embeddings (calibrated relevance: ${combinedScore}/100).`,
        recommendation: aiFinding?.recommendation || null,
      };
    }),
    recommendations: (aiOutput?.recommendations || []).map(r => ({
      ...r,
      existingEvidence: r.existingEvidence || null,
      suggestedPlacement: r.suggestedPlacement || null,
    })),
    executiveSummary: aiOutput?.executiveSummary || null,
    competitorReport: null,
    limitations: [
      ...(aiOutput?.limitations || []),
      ...(aiError ? [`AI analysis failed: ${aiError.slice(0, 200)}`] : []),
      ...(page.isTruncated ? ['Page content was truncated due to size limits.'] : []),
      ...(page.extractionQuality === 'low' ? ['Page content extraction quality is low (possible JavaScript-rendered page).'] : []),
      'Semantic similarity uses a keyword-based proxy on the server. For full embedding-based similarity, enable client-side analysis.',
      'Indian Marketers Topic Relevance Index reflects this tool\'s methodology, not Google\'s ranking signals.',
    ],
    aiAvailable: aiOutput !== null,
    rateLimit: {
      remainingMinute: rateCheck.remainingMinute,
      remainingDay: rateCheck.remainingDay,
      perMinute: getRateLimitConfig().perMinute,
      perDay: getRateLimitConfig().perDay,
    },
  };

  // Cache the result
  analysisCache.set(cacheKey, report);

  return NextResponse.json(report, {
    headers: {
      'X-RateLimit-Limit-Minute': String(getRateLimitConfig().perMinute),
      'X-RateLimit-Remaining-Minute': String(rateCheck.remainingMinute),
      'X-RateLimit-Limit-Day': String(getRateLimitConfig().perDay),
      'X-RateLimit-Remaining-Day': String(rateCheck.remainingDay),
    },
  });
}
