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
import { generateEmbeddings, getGeminiConfig } from '@/lib/seo/page-focus/geminiProvider';
import { hashCacheKey, hashContent, analysisCache } from '@/lib/seo/page-focus/cacheService';
import { checkRateLimitAsync, extractClientIp, getRateLimitConfig } from '@/lib/seo/page-focus/rateLimiter';
import { SCORING_VERSION, PROMPT_VERSION } from '@/lib/seo/page-focus/types';
import type { PageFocusReport, ScoreComponents, SectionAnalysis, ComponentStatus } from '@/lib/seo/page-focus/types';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 90; // Vercel Pro allows 90s; free tier 60s

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Concurrency-safe distributed rate limiting & reasoning quota budgeting (1 reasoning unit per single-page analysis)
  const ip = extractClientIp(req.headers);
  const rateCheck = await checkRateLimitAsync(ip, 1);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: rateCheck.reason || 'Rate limit exceeded. Please wait before retrying.', retryAfterMs: rateCheck.retryAfterMs, reason: rateCheck.reason },
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

  // Check cache (strictly bypassed for manual text inputs to protect privacy)
  const contentHash = hashContent(page.fullText);
  let activeModel = 'gemini-3.5-flash';
  try {
    activeModel = getGeminiConfig().model;
  } catch {}

  const cacheKey = await hashCacheKey({
    url,
    contentHash,
    targetTopic: targetTopic || null,
    model: activeModel,
    isManualText: !!(manualText && manualText.length > 100),
  });

  if (cacheKey) {
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  // Run AI analysis
  const { output: aiOutput, provider: aiProvider, error: aiError } = await runAIAnalysis({
    page,
    targetTopic: targetTopic || null,
  });

  // Explicit component tracking — NEVER fabricate or estimate missing scores
  let scoreComponents: ScoreComponents | null = null;
  let overallScore: number | null = null;
  let scoreInterpretation: string | null = null;
  const missingComponents: string[] = [];
  const sectionSimilarityMap = new Map<string, number>();

  let semanticSimilarityScore: number | null = null;
  let semanticStatus: ComponentStatus = 'failed';

  const effectiveTopic = targetTopic || (aiOutput?.primaryTopic?.name !== 'Unknown' ? aiOutput?.primaryTopic?.name : null) || page.h1 || page.title || null;

  if (effectiveTopic) {
    // Generate real vector embeddings using gemini-embedding-2 for effective topic and page sections
    try {
      if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        const textsToEmbed = [
          effectiveTopic,
          ...page.sections.map(s => `${s.heading || ''} ${s.content}`.slice(0, 1000)),
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

          if (sectionSimilarities.length > 0 && targetTopic) {
            // Aggregate top 5 sections for overall semantic similarity
            const sorted = [...sectionSimilarities].sort((a, b) => b - a);
            const top5 = sorted.slice(0, Math.min(5, sorted.length));
            semanticSimilarityScore = Math.round(top5.reduce((a, b) => a + b, 0) / top5.length);
            semanticStatus = 'available';
          }
        }
      }
    } catch (embErr) {
      console.warn('Real embedding generation failed:', embErr);
      if (targetTopic) {
        semanticSimilarityScore = null;
        semanticStatus = 'failed';
      }
    }

    if (targetTopic && !semanticSimilarityScore && semanticSimilarityScore !== 0) {
      missingComponents.push('Semantic Vector Similarity (Embeddings)');
    }

    const topicForHeadings = targetTopic || effectiveTopic;
    const headingAlignment = topicForHeadings ? computeHeadingAlignmentScore(topicForHeadings, page.headings) : 0;
    const headingStatus: ComponentStatus = 'available';

    let topicalCoherence: number | null = null;
    let coherenceStatus: ComponentStatus = 'failed';

    if (page.sections.length > 0) {
      const sectionScores = page.sections.map(s => {
        const vecScore = sectionSimilarityMap.get(s.id);
        const aiScore = aiOutput?.sectionFindings.find(f => f.sectionId === s.id)?.topicAlignmentScore;
        if (vecScore !== undefined && aiScore !== undefined) {
          return Math.round(vecScore * 0.6 + aiScore * 0.4);
        }
        return vecScore !== undefined ? vecScore : (aiScore !== undefined ? aiScore : 0);
      });
      topicalCoherence = computeTopicalCoherence(sectionScores);
      coherenceStatus = 'available';
    }

    const searchIntentScore = aiOutput ? Math.round(aiOutput.aiScoreComponents.searchIntentAlignment) : null;
    const topicalCoverageScore = aiOutput ? Math.round(aiOutput.aiScoreComponents.topicalCoverage) : null;
    const contextDepthScore = aiOutput ? Math.round(aiOutput.aiScoreComponents.supportingContextDepth) : null;

    if (!aiOutput) {
      missingComponents.push('AI Search Intent & Topical Depth Analysis');
    }

    scoreComponents = {
      semanticSimilarity: semanticSimilarityScore,
      searchIntentAlignment: searchIntentScore,
      topicalCoverage: topicalCoverageScore,
      headingStructuralAlignment: Math.round(headingAlignment),
      supportingContextDepth: contextDepthScore,
      topicalCoherence,
      statuses: {
        semanticSimilarity: semanticStatus,
        searchIntentAlignment: aiOutput ? 'available' : 'failed',
        topicalCoverage: aiOutput ? 'available' : 'failed',
        headingStructuralAlignment: headingStatus,
        supportingContextDepth: aiOutput ? 'available' : 'failed',
        topicalCoherence: coherenceStatus,
      },
    };

    if (missingComponents.length === 0) {
      overallScore = computeFinalScore(scoreComponents);
      scoreInterpretation = overallScore !== null ? interpretScore(overallScore) : null;
    } else {
      // Partial report — never present estimated fallback values as completed AI analysis
      overallScore = null;
      scoreInterpretation = 'Partial Report: Mandatory AI / Vector components unavailable';
    }
  }

  const isPartialReport = missingComponents.length > 0;

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
    isPartialReport,
    missingComponents,
    scoreComponents,
    scoreInterpretation,
    topicCoverage: aiOutput?.topicCoverage || [],
    contentGaps: aiOutput?.contentGaps || [],
    sectionAnalyses: page.sections.map(s => {
      const aiFinding = aiOutput?.sectionFindings.find(f => f.sectionId === s.id);
      const vecScore = sectionSimilarityMap.get(s.id);
      const combinedScore = vecScore !== undefined && aiFinding
        ? Math.round(vecScore * 0.6 + aiFinding.topicAlignmentScore * 0.4)
        : (vecScore !== undefined ? vecScore : (aiFinding ? aiFinding.topicAlignmentScore : 0));

      let alignmentLabel: 'strong' | 'moderate' | 'weak' | 'off-topic' = 'moderate';
      if (combinedScore >= 75) alignmentLabel = 'strong';
      else if (combinedScore >= 50) alignmentLabel = 'moderate';
      else if (combinedScore >= 25) alignmentLabel = 'weak';
      else alignmentLabel = 'off-topic';

      const defaultExplanation = vecScore !== undefined
        ? `Section evaluated via 3072-dimensional semantic embeddings (calibrated relevance: ${combinedScore}/100).`
        : 'Section content analyzed for topical consistency and semantic focus.';

      return {
        sectionId: s.id,
        heading: s.heading || null,
        topicAlignmentScore: combinedScore,
        alignmentLabel,
        stronglyCoveredConcepts: aiFinding?.stronglyCoveredConcepts || [],
        weaklyCoveredConcepts: aiFinding?.weaklyCoveredConcepts || [],
        missingContext: aiFinding?.missingContext || null,
        explanation: aiFinding?.explanation || defaultExplanation,
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
      ...(isPartialReport ? [`Partial Report: Missing ${missingComponents.join(', ')}.`] : []),
      'Indian Marketers Topic Relevance Index reflects this tool\'s empirical methodology, not Google\'s ranking signals.',
    ],
    aiAvailable: aiOutput !== null,
    rateLimit: {
      remainingMinute: rateCheck.remainingMinute,
      remainingDay: rateCheck.remainingDay,
      perMinute: getRateLimitConfig().perMinute,
      perDay: getRateLimitConfig().perDay,
    },
  };

  // Cache the result only if valid cacheKey exists (manual texts return null and are bypassed)
  if (cacheKey && !isPartialReport) {
    analysisCache.set(cacheKey, report);
  }

  return NextResponse.json(report, {
    headers: {
      'X-RateLimit-Limit-Minute': String(getRateLimitConfig().perMinute),
      'X-RateLimit-Remaining-Minute': String(rateCheck.remainingMinute),
      'X-RateLimit-Limit-Day': String(getRateLimitConfig().perDay),
      'X-RateLimit-Remaining-Day': String(rateCheck.remainingDay),
    },
  });
}
