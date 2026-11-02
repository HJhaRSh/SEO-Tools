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
import { checkRateLimit, getRateLimitConfig } from '@/lib/seo/page-focus/rateLimiter';
import { SCORING_VERSION, PROMPT_VERSION } from '@/lib/seo/page-focus/types';
import type { PageFocusReport, ScoreComponents, CompetitorComparison } from '@/lib/seo/page-focus/types';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = CompareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.', details: parsed.error.flatten() }, { status: 400 });
  }

  const { url, competitorUrl, targetTopic } = parsed.data;

  // Fetch both pages in parallel
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

  // Run AI analysis on both in parallel
  const [ourAI, compAI] = await Promise.allSettled([
    runAIAnalysis({ page: ourPage, targetTopic }),
    runAIAnalysis({ page: competitorPage, targetTopic }),
  ]);

  const ourAIOutput = ourAI.status === 'fulfilled' ? ourAI.value.output : null;
  const compAIOutput = compAI.status === 'fulfilled' ? compAI.value.output : null;
  const aiProvider = ourAI.status === 'fulfilled' ? ourAI.value.provider : 'none';

  // Generate real vector embeddings for target topic and both pages' sections
  let ourEmbeddingSim = 50;
  let compEmbeddingSim = 50;
  const sectionComparisons: CompetitorComparison['sectionComparisons'] = [];

  try {
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      const allTexts = [
        targetTopic,
        ...ourPage.sections.map(s => `${s.heading || ''} ${s.content}`.slice(0, 800)),
        ...competitorPage.sections.map(s => `${s.heading || ''} ${s.content}`.slice(0, 800)),
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
        for (let j = 0; j < competitorPage.sections.length; j++) {
          const v = vectors[compOffset + j];
          if (v && v.length > 0) {
            const score = calibrateCosineSimilarity(cosineSimilarity(topicVec, v));
            compSims.push(score);
          }
        }
        if (compSims.length > 0) {
          compSims.sort((a, b) => b - a);
          compEmbeddingSim = Math.round(compSims.slice(0, Math.min(5, compSims.length)).reduce((a, b) => a + b, 0) / Math.min(5, compSims.length));
        }

        // Cross-page section matching: for each of our top sections, find most similar competitor section
        for (let i = 0; i < Math.min(5, ourPage.sections.length); i++) {
          const ourVec = vectors[ourOffset + i];
          let bestMatchId: string | null = null;
          let bestSim = 0;

          for (let j = 0; j < competitorPage.sections.length; j++) {
            const compVec = vectors[compOffset + j];
            if (ourVec && compVec && ourVec.length > 0 && compVec.length > 0) {
              const sim = cosineSimilarity(ourVec, compVec);
              if (sim > bestSim) {
                bestSim = sim;
                bestMatchId = competitorPage.sections[j].id;
              }
            }
          }

          sectionComparisons.push({
            ourSectionId: ourPage.sections[i].id,
            competitorSectionId: bestMatchId,
            similarity: Math.round(bestSim * 100) / 100,
            notes: bestSim > 0.75
              ? 'Closely aligned subject coverage across both sites.'
              : bestSim > 0.55
              ? 'Partially related themes addressed from different perspectives.'
              : 'Distinctive section with unique coverage not mirrored by competitor.',
          });
        }
      }
    }
  } catch (embErr) {
    console.warn('Competitor comparison embedding fallback:', embErr);
  }

  // Compute scores for both pages using identical scoring engine
  function computePageScore(
    page: typeof ourPage,
    aiOutput: typeof ourAIOutput,
    semanticSimScore: number
  ): { score: number | null; components: ScoreComponents | null } {
    const headingAlignment = computeHeadingAlignmentScore(targetTopic, page.headings);

    if (aiOutput) {
      const sectionScores = aiOutput.sectionFindings.map(s => s.topicAlignmentScore);
      const topicalCoherence = computeTopicalCoherence(sectionScores);

      const components: ScoreComponents = {
        semanticSimilarity: Math.round(semanticSimScore),
        searchIntentAlignment: Math.round(aiOutput.aiScoreComponents.searchIntentAlignment),
        topicalCoverage: Math.round(aiOutput.aiScoreComponents.topicalCoverage),
        headingStructuralAlignment: Math.round(headingAlignment),
        supportingContextDepth: Math.round(aiOutput.aiScoreComponents.supportingContextDepth),
        topicalCoherence: Math.round(topicalCoherence),
      };
      return { score: computeFinalScore(components), components };
    }

    // Resilient fallback: compute deterministic score from vector embeddings, headings, and page length
    const contextDepth = Math.min(100, Math.round((page.wordCount / 800) * 80 + 20));
    const intentEst = Math.round(semanticSimScore * 0.9);
    const coverageEst = Math.round((semanticSimScore * 0.7) + (Math.min(10, page.headings.length) * 3));
    const components: ScoreComponents = {
      semanticSimilarity: Math.round(semanticSimScore),
      searchIntentAlignment: Math.min(100, Math.max(15, intentEst)),
      topicalCoverage: Math.min(100, Math.max(15, coverageEst)),
      headingStructuralAlignment: Math.round(headingAlignment),
      supportingContextDepth: Math.min(100, Math.max(15, contextDepth)),
      topicalCoherence: Math.min(100, Math.max(15, Math.round(semanticSimScore * 0.85))),
    };
    return { score: computeFinalScore(components), components };
  }

  const { score: ourScore, components: ourComponents } = computePageScore(ourPage, ourAIOutput, ourEmbeddingSim);
  const { score: compScore, components: compComponents } = computePageScore(competitorPage, compAIOutput, compEmbeddingSim);

  // Determine topic gaps and advantages
  const ourCoveredConcepts = new Set(
    (ourAIOutput?.topicCoverage || []).filter(c => c.status === 'covered' || c.status === 'partial').map(c => c.concept.toLowerCase())
  );
  const compCoveredConcepts = new Set(
    (compAIOutput?.topicCoverage || []).filter(c => c.status === 'covered' || c.status === 'partial').map(c => c.concept.toLowerCase())
  );

  // If one page lacked AI coverage concepts, infer coverage from headings
  if (compCoveredConcepts.size === 0 && competitorPage.headings.length > 0) {
    competitorPage.headings.slice(0, 8).forEach(h => compCoveredConcepts.add(h.text.toLowerCase()));
  }
  if (ourCoveredConcepts.size === 0 && ourPage.headings.length > 0) {
    ourPage.headings.slice(0, 8).forEach(h => ourCoveredConcepts.add(h.text.toLowerCase()));
  }

  const topicGaps = Array.from(compCoveredConcepts).filter(c => !ourCoveredConcepts.has(c));
  const ourAdvantages = Array.from(ourCoveredConcepts).filter(c => !compCoveredConcepts.has(c));

  let verdict = '';
  if (ourScore !== null && compScore !== null) {
    const diff = ourScore - compScore;
    if (Math.abs(diff) < 3) verdict = `Both pages demonstrate highly comparable topical relevance (${ourScore.toFixed(1)} vs ${compScore.toFixed(1)}) under the Indian Marketers Topic Relevance Index.`;
    else if (diff > 0) verdict = `Your page demonstrates stronger topical relevance (${ourScore.toFixed(1)} vs ${compScore.toFixed(1)}) under the Indian Marketers Topic Relevance Index.`;
    else verdict = `The competitor page demonstrates stronger topical relevance (${compScore.toFixed(1)} vs ${ourScore.toFixed(1)}) under the Indian Marketers Topic Relevance Index. Note: a higher relevance index does not guarantee search rankings.`;
  } else {
    verdict = 'Comparison complete with calibrated passage-level semantic alignment.';
  }

  const competitorComparison: CompetitorComparison = {
    competitorUrl,
    ourScore,
    competitorScore: compScore,
    ourComponents,
    competitorComponents: compComponents,
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
    primaryTopic: ourAIOutput ? { ...ourAIOutput.primaryTopic, isPrimary: true } : { name: 'Unknown', centralityScore: 0, isPrimary: true, explanation: 'AI unavailable', supportingSectionIds: [], type: 'central' },
    secondaryTopics: (ourAIOutput?.secondaryTopics || []).map(t => ({ ...t, isPrimary: false })),
    searchIntent: ourAIOutput?.searchIntent || null,
    overallRelevanceScore: ourScore,
    scoreComponents: ourComponents,
    scoreInterpretation: ourScore !== null ? interpretScore(ourScore) : null,
    topicCoverage: ourAIOutput?.topicCoverage || [],
    contentGaps: ourAIOutput?.contentGaps || [],
    sectionAnalyses: (ourAIOutput?.sectionFindings || []).map(f => ({
      sectionId: f.sectionId,
      heading: ourPage.sections.find(s => s.id === f.sectionId)?.heading || null,
      topicAlignmentScore: f.topicAlignmentScore,
      alignmentLabel: f.alignmentLabel,
      stronglyCoveredConcepts: f.stronglyCoveredConcepts || [],
      weaklyCoveredConcepts: f.weaklyCoveredConcepts || [],
      missingContext: f.missingContext || null,
      explanation: f.explanation,
      recommendation: f.recommendation || null,
    })),
    recommendations: (ourAIOutput?.recommendations || []).map(r => ({ ...r, existingEvidence: r.existingEvidence || null, suggestedPlacement: r.suggestedPlacement || null })),
    executiveSummary: ourAIOutput?.executiveSummary || null,
    competitorReport: competitorComparison,
    limitations: [
      'Indian Marketers Topic Relevance Index reflects this tool\'s methodology, not Google\'s ranking signals.',
      'A higher relevance score does not guarantee higher rankings.',
      'Section-to-section comparison uses AI classifications, not embedding-based alignment in this version.',
    ],
    aiAvailable: ourAIOutput !== null,
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
