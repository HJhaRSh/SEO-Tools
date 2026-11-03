import { NextRequest, NextResponse } from 'next/server';
import { CompareRequestSchema } from '@/lib/seo/page-focus/types';
import { extractPage } from '@/lib/seo/page-focus/extractionService';
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
import { checkRateLimitAsync, extractClientIp, getRateLimitConfig } from '@/lib/seo/page-focus/rateLimiter';
import { SCORING_VERSION, PROMPT_VERSION } from '@/lib/seo/page-focus/types';
import type { PageFocusReport, ScoreComponents, CompetitorComparison, ComponentStatus } from '@/lib/seo/page-focus/types';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Evaluates genuine semantic equivalence between two topical concepts using:
 * 1. Primary: 3072-dimensional vector embedding cosine similarity (threshold >= 0.75)
 * 2. Secondary fallback: Normalized token Jaccard overlap when embeddings are offline.
 */
function areConceptsSemanticallyEquivalent(
  a: string,
  b: string,
  vectorMap?: Map<string, number[]>
): boolean {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();

  if (normA === normB) return true;

  // 1. Primary: Genuine Vector Cosine Similarity
  if (vectorMap) {
    const vecA = vectorMap.get(normA);
    const vecB = vectorMap.get(normB);
    if (vecA && vecB && vecA.length > 0 && vecB.length > 0) {
      const cos = cosineSimilarity(vecA, vecB);
      return cos >= 0.75;
    }
  }

  // 2. Secondary lexical fallback (only if embeddings offline)
  const getTokens = (str: string) =>
    str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const tokensA = getTokens(normA);
  const tokensB = getTokens(normB);

  if (tokensA.length > 0 && tokensB.length > 0) {
    const setB = new Set(tokensB);
    const matches = tokensA.filter(t => setB.has(t)).length;
    const overlap = matches / Math.min(tokensA.length, tokensB.length);
    if (overlap >= 0.7) return true;
  }

  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Parse + validate request parameters first (0 quota consumed on invalid input)
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const parsed = CompareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request parameters.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { url, competitorUrl, targetTopic } = parsed.data;

  // 2. Fetch both pages in parallel (0 quota consumed if page fetches fail)
  const [ourPageResult, compPageResult] = await Promise.allSettled([
    extractPage(url),
    extractPage(competitorUrl),
  ]);

  if (ourPageResult.status === 'rejected') {
    return NextResponse.json({ error: `Failed to fetch your page: ${ourPageResult.reason}` }, { status: 502 });
  }
  if (compPageResult.status === 'rejected') {
    return NextResponse.json({ error: `Failed to fetch competitor page: ${compPageResult.reason}` }, { status: 502 });
  }

  const ourPage = ourPageResult.value;
  const competitorPage = compPageResult.value;

  // 3. Rate limiting & Quota Admission (admit and reserve 2 reasoning units for target + competitor)
  const ip = extractClientIp(req.headers);
  const rateCheck = await checkRateLimitAsync(ip, 2);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: rateCheck.reason || 'Rate limit exceeded.', retryAfterMs: rateCheck.retryAfterMs },
      { status: 429 }
    );
  }

  // 4. Run AI analysis on both pages sequentially to protect free-tier concurrency limits
  const ourAI = await runAIAnalysis({ page: ourPage, targetTopic });
  const compAI = await runAIAnalysis({ page: competitorPage, targetTopic });

  const ourAIOutput = ourAI.output;
  const compAIOutput = compAI.output;
  const aiProvider = ourAI.provider !== 'none' ? ourAI.provider : compAI.provider;

  // Generate real vector embeddings for target topic and both pages' sections
  let ourEmbeddingSim: number | null = null;
  let compEmbeddingSim: number | null = null;
  const sectionComparisons: CompetitorComparison['sectionComparisons'] = [];

  try {
    if (process.env.GEMINI_API_KEY) {
      const allTexts = [
        targetTopic,
        ...ourPage.sections.map(s => `${s.heading || ''} ${s.content}`.slice(0, 1000)),
        ...competitorPage.sections.map(s => `${s.heading || ''} ${s.content}`.slice(0, 1000)),
      ];
      const vectors = await generateEmbeddings(allTexts);
      const topicVec = vectors[0];

      if (topicVec && topicVec.length > 0) {
        const ourOffset = 1;
        const compOffset = 1 + ourPage.sections.length;

        // Our section similarities
        const ourSims: number[] = [];
        for (let i = 0; i < ourPage.sections.length; i++) {
          const v = vectors[ourOffset + i];
          if (v && v.length > 0) {
            const score = calibrateCosineSimilarity(cosineSimilarity(topicVec, v));
            ourSims.push(score);
          }
        }
        if (ourSims.length > 0) {
          ourSims.sort((a, b) => b - a);
          ourEmbeddingSim = Math.round(ourSims.slice(0, Math.min(5, ourSims.length)).reduce((a, b) => a + b, 0) / Math.min(5, ourSims.length));
        }

        // Competitor section similarities
        const compSims: number[] = [];
        for (let i = 0; i < competitorPage.sections.length; i++) {
          const v = vectors[compOffset + i];
          if (v && v.length > 0) {
            const score = calibrateCosineSimilarity(cosineSimilarity(topicVec, v));
            compSims.push(score);
          }
        }
        if (compSims.length > 0) {
          compSims.sort((a, b) => b - a);
          compEmbeddingSim = Math.round(compSims.slice(0, Math.min(5, compSims.length)).reduce((a, b) => a + b, 0) / Math.min(5, compSims.length));
        }

        // Cross-match sections
        const minSections = Math.min(ourPage.sections.length, competitorPage.sections.length, 10);
        for (let i = 0; i < minSections; i++) {
          const ourSec = ourPage.sections[i];
          const compSec = competitorPage.sections[i];
          const ourV = vectors[ourOffset + i];
          const compV = vectors[compOffset + i];
          const rawSim = ourV && compV ? cosineSimilarity(ourV, compV) : 0;
          const simScore = Math.round(calibrateCosineSimilarity(rawSim));

          sectionComparisons.push({
            ourSectionId: ourSec.id,
            competitorSectionId: compSec.id,
            similarity: simScore,
            notes: `Cross-page topic alignment for ${ourSec.heading || compSec.heading || `Section ${i + 1}`}`,
          });
        }
      }
    }
  } catch (embErr) {
    console.warn('Real embedding generation failed in comparison:', embErr);
    ourEmbeddingSim = null;
    compEmbeddingSim = null;
  }

  // Calculate scores for both pages
  const calculatePageScore = (
    page: typeof ourPage,
    aiOutput: typeof ourAIOutput,
    embeddingSim: number | null,
    pageLabel: string
  ): { components: ScoreComponents; score: number | null; missing: string[] } => {
    const missing: string[] = [];

    const headingScore = computeHeadingAlignmentScore(targetTopic, page.headings);
    const semanticStatus: ComponentStatus = embeddingSim !== null ? 'available' : 'failed';
    if (embeddingSim === null) {
      missing.push(`${pageLabel}: Semantic Vector Embeddings`);
    }

    let coherenceScore: number | null = null;
    let coherenceStatus: ComponentStatus = 'failed';
    if (aiOutput) {
      const sectionScores = aiOutput.sectionFindings.map(f => f.topicAlignmentScore);
      if (sectionScores.length > 0) {
        coherenceScore = computeTopicalCoherence(sectionScores);
        coherenceStatus = 'available';
      }
    }

    if (!aiOutput) {
      missing.push(`${pageLabel}: AI Intent & Depth Analysis`);
    }

    const components: ScoreComponents = {
      semanticSimilarity: embeddingSim,
      searchIntentAlignment: aiOutput ? Math.round(aiOutput.aiScoreComponents.searchIntentAlignment) : null,
      topicalCoverage: aiOutput ? Math.round(aiOutput.aiScoreComponents.topicalCoverage) : null,
      headingStructuralAlignment: Math.round(headingScore),
      supportingContextDepth: aiOutput ? Math.round(aiOutput.aiScoreComponents.supportingContextDepth) : null,
      topicalCoherence: coherenceScore,
      statuses: {
        semanticSimilarity: semanticStatus,
        searchIntentAlignment: aiOutput ? 'available' : 'failed',
        topicalCoverage: aiOutput ? 'available' : 'failed',
        headingStructuralAlignment: 'available',
        supportingContextDepth: aiOutput ? 'available' : 'failed',
        topicalCoherence: coherenceStatus,
      },
    };

    let score: number | null = null;
    if (missing.length === 0) {
      score = computeFinalScore(components);
    }

    return { components, score, missing };
  };

  const ourResult = calculatePageScore(ourPage, ourAIOutput, ourEmbeddingSim, 'Your Page');
  const compResult = calculatePageScore(competitorPage, compAIOutput, compEmbeddingSim, 'Competitor Page');

  const missingComparisonComponents = [...ourResult.missing, ...compResult.missing];
  const isPartialReport = missingComparisonComponents.length > 0;

  // Extract topics covered
  const ourRawConcepts = Array.from(new Set(
    (ourAIOutput?.topicCoverage || []).filter(c => c.status === 'covered' || c.status === 'partial').map(c => c.concept.trim())
  ));
  const compRawConcepts = Array.from(new Set(
    (compAIOutput?.topicCoverage || []).filter(c => c.status === 'covered' || c.status === 'partial').map(c => c.concept.trim())
  ));

  if (compRawConcepts.length === 0 && competitorPage.headings.length > 0) {
    competitorPage.headings.slice(0, 8).forEach(h => compRawConcepts.push(h.text.trim()));
  }
  if (ourRawConcepts.length === 0 && ourPage.headings.length > 0) {
    ourPage.headings.slice(0, 8).forEach(h => ourRawConcepts.push(h.text.trim()));
  }

  // Generate vector embeddings for concepts
  const allConcepts = Array.from(new Set([...ourRawConcepts, ...compRawConcepts]));
  const conceptVectorMap = new Map<string, number[]>();
  if (allConcepts.length > 0) {
    try {
      const cVectors = await generateEmbeddings(allConcepts);
      allConcepts.forEach((c, idx) => {
        if (cVectors[idx] && cVectors[idx].length > 0) {
          conceptVectorMap.set(c.toLowerCase(), cVectors[idx]);
        }
      });
    } catch (cErr) {
      console.warn('Concept embedding generation fallback:', cErr);
    }
  }

  // Topic Gaps & Advantages
  const topicGaps = compRawConcepts.filter(compConcept => {
    return !ourRawConcepts.some(ourConcept => areConceptsSemanticallyEquivalent(compConcept, ourConcept, conceptVectorMap));
  });

  const ourAdvantages = ourRawConcepts.filter(ourConcept => {
    return !compRawConcepts.some(compConcept => areConceptsSemanticallyEquivalent(ourConcept, compConcept, conceptVectorMap));
  });

  let verdict = '';
  if (ourResult.score !== null && compResult.score !== null) {
    const diff = ourResult.score - compResult.score;
    if (Math.abs(diff) < 3) {
      verdict = `Both pages demonstrate highly comparable topical relevance (${ourResult.score.toFixed(1)} vs ${compResult.score.toFixed(1)}) under the Indian Marketers Topic Relevance Index.`;
    } else if (diff > 0) {
      verdict = `Your page demonstrates stronger topical relevance (${ourResult.score.toFixed(1)} vs ${compResult.score.toFixed(1)}) under the Indian Marketers Topic Relevance Index.`;
    } else {
      verdict = `The competitor page demonstrates stronger topical relevance (${compResult.score.toFixed(1)} vs ${ourResult.score.toFixed(1)}) under the Indian Marketers Topic Relevance Index. Note: a higher relevance index does not guarantee search rankings.`;
    }
  } else {
    verdict = `Comparison partial: AI analysis or semantic vector embeddings could not be completed for one or both pages (${missingComparisonComponents.join(', ')}).`;
  }

  const competitorComparison: CompetitorComparison = {
    competitorUrl,
    ourScore: ourResult.score,
    competitorScore: compResult.score,
    ourComponents: ourResult.components,
    competitorComponents: compResult.components,
    isPartialReport,
    missingComponents: missingComparisonComponents,
    verdict,
    topicGaps,
    ourAdvantages,
    sectionComparisons,
    improvements: (ourAIOutput?.recommendations || []).map(r => ({
      ...r,
      existingEvidence: r.existingEvidence || null,
      suggestedPlacement: r.suggestedPlacement || null,
    })),
  };

  const analysisId = crypto.randomUUID();
  const report: PageFocusReport = {
    analysisId,
    timestamp: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    scoringVersion: SCORING_VERSION,
    aiProvider,
    targetUrl: url,
    targetTopic,
    competitorUrl,
    page: ourPage,
    competitorPage,
    pageSummary: ourAIOutput?.pageSummary || 'AI analysis unavailable.',
    primaryTopic: ourAIOutput ? { ...ourAIOutput.primaryTopic, isPrimary: true } : { name: 'Unknown', centralityScore: null, isPrimary: true, explanation: 'AI unavailable', supportingSectionIds: [], type: 'central' },
    secondaryTopics: (ourAIOutput?.secondaryTopics || []).map(t => ({ ...t, isPrimary: false })),
    searchIntent: ourAIOutput?.searchIntent || null,
    overallRelevanceScore: ourResult.score,
    isPartialReport,
    missingComponents: missingComparisonComponents,
    scoreComponents: ourResult.components,
    scoreInterpretation: ourResult.score !== null ? interpretScore(ourResult.score) : 'Partial Comparison Report',
    topicCoverage: ourAIOutput?.topicCoverage || [],
    contentGaps: ourAIOutput?.contentGaps || [],
    sectionAnalyses: ourPage.sections.map(s => {
      const sim = ourEmbeddingSim;
      let label: 'strong' | 'moderate' | 'weak' | 'off-topic' | 'unavailable' = 'unavailable';
      if (sim !== null) {
        if (sim >= 75) label = 'strong';
        else if (sim >= 50) label = 'moderate';
        else if (sim >= 25) label = 'weak';
        else label = 'off-topic';
      }
      return {
        sectionId: s.id,
        heading: s.heading || null,
        topicAlignmentScore: sim,
        alignmentLabel: label,
        stronglyCoveredConcepts: [],
        weaklyCoveredConcepts: [],
        missingContext: null,
        explanation: sim !== null
          ? `Evaluated in competitor comparison mode via semantic embeddings (${sim}/100).`
          : 'Section analysis unavailable: semantic vectors offline.',
        recommendation: null,
      };
    }),
    recommendations: (ourAIOutput?.recommendations || []).map(r => ({
      ...r,
      existingEvidence: r.existingEvidence || null,
      suggestedPlacement: r.suggestedPlacement || null,
    })),
    executiveSummary: ourAIOutput?.executiveSummary || null,
    competitorReport: competitorComparison,
    limitations: [
      ...(ourAIOutput?.limitations || []),
      ...(isPartialReport ? [`Partial Report: ${missingComparisonComponents.join('; ')}`] : []),
      'Indian Marketers Topic Relevance Index reflects this tool\'s empirical methodology, not Google\'s ranking signals.',
    ],
    aiAvailable: ourAIOutput !== null && compAIOutput !== null,
    rateLimit: {
      remainingMinute: rateCheck.remainingMinute,
      remainingDay: rateCheck.remainingDay,
      perMinute: getRateLimitConfig().perMinute,
      perDay: getRateLimitConfig().perDay,
    },
  };

  return NextResponse.json(report, {
    headers: {
      'X-RateLimit-Limit-Minute': String(getRateLimitConfig().perMinute),
      'X-RateLimit-Remaining-Minute': String(rateCheck.remainingMinute),
      'X-RateLimit-Limit-Day': String(getRateLimitConfig().perDay),
      'X-RateLimit-Remaining-Day': String(rateCheck.remainingDay),
    },
  });
}
