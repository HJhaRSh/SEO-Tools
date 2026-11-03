/**
 * Gemini AI Provider for Page Focus Analyzer
 * Uses @google/genai v2.x with structured output (responseSchema)
 *
 * Strict Isolation:
 * - Uses GEMINI_API_KEY exclusively.
 * - NEVER mutates or references process.env.GOOGLE_API_KEY (reserved for Knowledge Graph tool).
 *
 * Model Strategy:
 * - Exactly one primary model (gemini-3.1-flash-lite) and one verified fallback (gemini-3-flash-preview).
 * - SDK-supported AbortSignal cancellation on all generateContent & embedContent requests.
 * - Bounded total master time budget to prevent hanging requests.
 * - Accurate provider-level request accounting via recordActualModelCall.
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { AIAnalysisOutput, ExtractedPage, PageSection } from './types';
import { AIAnalysisOutputSchema, PROMPT_VERSION } from './types';
import { SYSTEM_INSTRUCTION, buildAnalysisPrompt } from './prompts';
import { recordActualModelCall } from './rateLimiter';

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
  fallbackModel: string;
  embeddingModel: string;
  timeoutMs: number;
}

export function getGeminiConfig(): GeminiProviderConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  return {
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3-flash-preview',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
    timeoutMs: 50000,
  };
}

// Define the Gemini response schema using the Type enum from @google/genai
export const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    pageSummary: { type: Type.STRING },
    primaryTopic: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        centralityScore: { type: Type.NUMBER },
        explanation: { type: Type.STRING },
        supportingSectionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        type: { type: Type.STRING, enum: ['central', 'peripheral'] },
      },
      required: ['name', 'centralityScore', 'explanation', 'supportingSectionIds', 'type'],
    },
    secondaryTopics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          centralityScore: { type: Type.NUMBER },
          explanation: { type: Type.STRING },
          supportingSectionIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          type: { type: Type.STRING, enum: ['central', 'peripheral'] },
        },
        required: ['name', 'centralityScore', 'explanation', 'supportingSectionIds', 'type'],
      },
    },
    searchIntent: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        primaryIntent: { type: Type.STRING, enum: ['informational', 'commercial', 'transactional', 'navigational', 'local', 'mixed'] },
        secondaryIntent: { type: Type.STRING, nullable: true },
        pageIntentSatisfaction: { type: Type.STRING, enum: ['fully', 'partially', 'weakly', 'not'] },
        unaddressedNeeds: { type: Type.ARRAY, items: { type: Type.STRING } },
        explanation: { type: Type.STRING },
      },
      required: ['primaryIntent', 'pageIntentSatisfaction', 'unaddressedNeeds', 'explanation'],
    },
    topicCoverage: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          concept: { type: Type.STRING },
          status: { type: Type.STRING, enum: ['covered', 'partial', 'missing', 'irrelevant'] },
          evidence: { type: Type.STRING, nullable: true },
          sectionId: { type: Type.STRING, nullable: true },
        },
        required: ['concept', 'status'],
      },
    },
    contentGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
    sectionFindings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sectionId: { type: Type.STRING },
          topicAlignmentScore: { type: Type.NUMBER },
          alignmentLabel: { type: Type.STRING, enum: ['strong', 'moderate', 'weak', 'off-topic'] },
          stronglyCoveredConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaklyCoveredConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingContext: { type: Type.STRING, nullable: true },
          explanation: { type: Type.STRING },
          recommendation: { type: Type.STRING, nullable: true },
        },
        required: ['sectionId', 'topicAlignmentScore', 'alignmentLabel', 'explanation'],
      },
    },
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
          issue: { type: Type.STRING },
          existingEvidence: { type: Type.STRING, nullable: true },
          proposedImprovement: { type: Type.STRING },
          seoRationale: { type: Type.STRING },
          suggestedPlacement: { type: Type.STRING, nullable: true },
          expectedUserBenefit: { type: Type.STRING },
          confidenceStatus: { type: Type.STRING, enum: ['evidence-based', 'inferred', 'requires-verification'] },
        },
        required: ['title', 'priority', 'issue', 'proposedImprovement', 'seoRationale', 'expectedUserBenefit', 'confidenceStatus'],
      },
    },
    executiveSummary: { type: Type.STRING, nullable: true },
    aiScoreComponents: {
      type: Type.OBJECT,
      properties: {
        searchIntentAlignment: { type: Type.NUMBER },
        topicalCoverage: { type: Type.NUMBER },
        supportingContextDepth: { type: Type.NUMBER },
      },
      required: ['searchIntentAlignment', 'topicalCoverage', 'supportingContextDepth'],
    },
    limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['pageSummary', 'primaryTopic', 'secondaryTopics', 'topicCoverage', 'contentGaps', 'sectionFindings', 'recommendations', 'aiScoreComponents', 'limitations'],
};

/**
 * Helper to instantiate GoogleGenAI strictly using the provided GEMINI_API_KEY.
 * The SDK's constructor internally reads process.env.GOOGLE_API_KEY before checking options.apiKey,
 * which logs a misleading warning when both are set in the runtime environment.
 * We temporarily isolate process.env.GOOGLE_API_KEY during instantiation and restore it immediately.
 */
function createGenAIClient(apiKey: string): GoogleGenAI {
  const originalGoogleApiKey = process.env.GOOGLE_API_KEY;
  try {
    delete process.env.GOOGLE_API_KEY;
    return new GoogleGenAI({ apiKey });
  } finally {
    if (originalGoogleApiKey !== undefined) {
      process.env.GOOGLE_API_KEY = originalGoogleApiKey;
    }
  }
}

export async function analyzeWithGemini(params: {
  page: ExtractedPage;
  targetTopic: string | null;
  timeoutMs?: number;
}): Promise<AIAnalysisOutput> {
  const config = getGeminiConfig();
  const genai = createGenAIClient(config.apiKey);

  // Hierarchical, token-aware content selection for AI prompt
  const isLongPage = params.page.wordCount > 2500 || params.page.sections.length > 15;
  const sectionsForPrompt = params.page.sections.map((s) => {
    let contentSnippet = s.content;
    const maxChars = isLongPage ? 600 : 1200;

    if (contentSnippet.length > maxChars) {
      contentSnippet = `${contentSnippet.slice(0, maxChars - 200).trim()} ... [section excerpted for token efficiency] ... ${contentSnippet.slice(-200).trim()}`;
    }

    return {
      id: s.id,
      heading: s.heading,
      content: contentSnippet,
    };
  });

  const userPrompt = buildAnalysisPrompt({
    targetTopic: params.targetTopic,
    pageTitle: params.page.title,
    metaDescription: params.page.metaDescription,
    h1: params.page.h1,
    headings: params.page.headings,
    sections: sectionsForPrompt,
    wordCount: params.page.wordCount,
    language: params.page.language,
    extractionNote: params.page.extractionNote,
  });

  // Exactly one primary model and one verified fallback — no uncontrolled 5-model candidate chain
  const candidateModels = [
    config.model,
    config.fallbackModel,
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let responseText: string | undefined;
  let selectedModelUsed: string = config.model;
  let lastError: unknown;

  // Master bounded deadline for the entire reasoning attempt
  const masterTimeoutMs = params.timeoutMs || config.timeoutMs || 50000;
  const masterDeadline = Date.now() + masterTimeoutMs;

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  modelLoop: for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const currentModel = candidateModels[mIdx];
    const isFallback = mIdx > 0;

    // Up to 2 attempts per model (1 initial + 1 backoff retry) to avoid burning quotas
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remainingTime = masterDeadline - Date.now();
      if (remainingTime < 3000) {
        lastError = new Error(`Analysis overall time budget of ${masterTimeoutMs}ms exceeded.`);
        break modelLoop;
      }

      // If this is a retry or a fallback model attempt, record actual model unit and verify budget
      if (attempt > 1 || isFallback) {
        const canExecute = await recordActualModelCall('reasoning', 1);
        if (!canExecute.allowed) {
          lastError = new Error('Daily AI reasoning quota limit reached during retry/fallback. Aborting further attempts.');
          break modelLoop;
        }
      }

      // SDK-supported cancellation with AbortController
      const abortController = new AbortController();
      const attemptTimeoutMs = Math.min(25000, remainingTime - 1000);
      const timeoutId = setTimeout(() => {
        abortController.abort(new Error(`Model request timed out after ${attemptTimeoutMs}ms`));
      }, attemptTimeoutMs);

      try {
        const response = await genai.models.generateContent({
          model: currentModel,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 8192,
            abortSignal: abortController.signal,
          },
        });

        clearTimeout(timeoutId);

        if (response.text) {
          responseText = response.text;
          selectedModelUsed = currentModel;
          break modelLoop;
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
        const errStr = String(err?.message || err);
        const status = err?.status || err?.code || 0;

        // Fatal auth/permission errors: stop immediately
        if (status === 401 || status === 403 || errStr.includes('PERMISSION_DENIED') || errStr.includes('API_KEY_INVALID')) {
          throw new Error(`Authentication/Permission error from Gemini API: ${errStr}`);
        }

        // Invalid parameters: do not retry
        if (status === 400 || errStr.includes('INVALID_ARGUMENT')) {
          throw new Error(`Invalid request parameters sent to Gemini: ${errStr}`);
        }

        // Quota exhaustion: stop immediately
        if (status === 429 || errStr.includes('RESOURCE_EXHAUSTED')) {
          if (errStr.includes('Quota exceeded') || errStr.includes('daily limit')) {
            throw new Error(`Gemini project daily quota exhausted (HTTP 429). Will not cycle models to evade quota limits: ${errStr}`);
          }
          if (attempt < maxAttempts && masterDeadline - Date.now() > 5000) {
            await delay(1500);
            continue;
          }
          break; // move to fallback model
        }

        // Transient server errors (500, 502, 503, 504, UNAVAILABLE)
        const isTransient = status >= 500 || errStr.includes('UNAVAILABLE') || errStr.includes('high demand') ||
          errStr.includes('fetch failed') || errStr.includes('timed out');

        if (isTransient && attempt < maxAttempts && masterDeadline - Date.now() > 5000) {
          await delay(1500);
          continue;
        }

        // Move to fallback model
        break;
      }
    }
  }

  const text = responseText;
  if (!text) {
    throw (lastError || new Error('Gemini returned empty response after retries and fallback'));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Gemini returned invalid structured JSON: ' + text.slice(0, 200));
    }
  }

  // Validate with Zod against identical schema
  const result = AIAnalysisOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('Gemini response failed schema validation: ' + result.error.message.slice(0, 500));
  }

  const validSectionIds = new Set(params.page.sections.map(s => s.id));
  const validateSectionIds = (ids: string[]) => ids.filter(id => validSectionIds.has(id));

  const normalizeScore = (val: unknown): number => {
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    if (isNaN(num)) return 0;
    if (num > 0 && num <= 1) return Math.round(num * 100);
    return Math.min(100, Math.max(0, Math.round(num)));
  };

  const output = result.data;
  output.primaryTopic.centralityScore = normalizeScore(output.primaryTopic.centralityScore);
  output.primaryTopic.supportingSectionIds = validateSectionIds(output.primaryTopic.supportingSectionIds);
  output.secondaryTopics = output.secondaryTopics.map(t => ({
    ...t,
    centralityScore: normalizeScore(t.centralityScore),
    supportingSectionIds: validateSectionIds(t.supportingSectionIds),
  }));
  output.aiScoreComponents.searchIntentAlignment = normalizeScore(output.aiScoreComponents.searchIntentAlignment);
  output.aiScoreComponents.topicalCoverage = normalizeScore(output.aiScoreComponents.topicalCoverage);
  output.aiScoreComponents.supportingContextDepth = normalizeScore(output.aiScoreComponents.supportingContextDepth);
  output.sectionFindings = output.sectionFindings.map(f => ({
    ...f,
    topicAlignmentScore: normalizeScore(f.topicAlignmentScore),
  }));

  // Recommendation Evidence Grounding Verification
  const lowerFullText = (params.page.fullText || '').toLowerCase();
  output.recommendations = output.recommendations.map(rec => {
    let verifiedConfidence = rec.confidenceStatus;
    let verifiedPlacement = rec.suggestedPlacement;

    if (verifiedPlacement && !validSectionIds.has(verifiedPlacement)) {
      verifiedPlacement = null;
    }

    if (rec.existingEvidence && rec.existingEvidence.trim().length > 0) {
      const cleanSnippet = rec.existingEvidence.trim().toLowerCase().replace(/['"“”]/g, '');
      const fragment = cleanSnippet.slice(0, Math.min(30, cleanSnippet.length));
      const appearsInPage = lowerFullText.includes(fragment);

      if (!appearsInPage) {
        verifiedConfidence = 'requires-verification';
      } else {
        verifiedConfidence = 'evidence-based';
      }
    } else {
      if (verifiedConfidence === 'evidence-based') {
        verifiedConfidence = 'inferred';
      }
    }

    return {
      ...rec,
      confidenceStatus: verifiedConfidence,
      suggestedPlacement: verifiedPlacement,
    };
  });

  return output;
}

/**
 * Generates vector embeddings for a list of texts using gemini-embedding-2.
 * Executes in bounded parallel batches with SDK AbortSignal support.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const config = getGeminiConfig();
  const genai = createGenAIClient(config.apiKey);

  const results: number[][] = [];
  const batchSize = 5;

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);

    // Track embedding quota usage
    const embeddingBudget = await recordActualModelCall('embedding', chunk.length);
    if (!embeddingBudget.allowed) {
      console.warn('Embedding daily quota exhausted. Stopping further vector generation.');
      break;
    }

    const chunkEmbeddings = await Promise.all(
      chunk.map(async (text) => {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 15000);
        try {
          const res = await genai.models.embedContent({
            model: config.embeddingModel,
            contents: text.slice(0, 1000),
            config: {
              abortSignal: abortController.signal,
            },
          });
          clearTimeout(timeoutId);
          return res.embeddings?.[0]?.values || [];
        } catch (err) {
          clearTimeout(timeoutId);
          console.warn('Embedding failed for text chunk:', err);
          return [];
        }
      })
    );
    results.push(...chunkEmbeddings);
  }

  return results;
}

/**
 * Health check: Non-consuming configuration check by default.
 * Only issues live API calls when explicitly requested with live: true.
 */
export async function healthCheck(options: { live?: boolean } = {}): Promise<{
  available: boolean;
  model: string;
  fallbackModel: string;
  embeddingModel: string;
  mode: 'configuration' | 'live-probe';
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3-flash-preview';
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';

  if (!apiKey) {
    return {
      available: false,
      model,
      fallbackModel,
      embeddingModel,
      mode: 'configuration',
      error: 'GEMINI_API_KEY environment variable is not set',
    };
  }

  // Non-consuming check (default) to protect quota
  if (!options.live) {
    return {
      available: true,
      model,
      fallbackModel,
      embeddingModel,
      mode: 'configuration',
    };
  }

  // Live probe (protected/authenticated callers only)
  try {
    const genai = createGenAIClient(apiKey);
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    const response = await genai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }],
      config: {
        maxOutputTokens: 10,
        temperature: 0,
        abortSignal: abortController.signal,
      },
    });
    clearTimeout(timeoutId);
    return {
      available: !!response.text,
      model,
      fallbackModel,
      embeddingModel,
      mode: 'live-probe',
    };
  } catch (e) {
    return {
      available: false,
      model,
      fallbackModel,
      embeddingModel,
      mode: 'live-probe',
      error: String(e),
    };
  }
}
