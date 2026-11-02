/**
 * Gemini AI Provider for Page Focus Analyzer
 * Uses @google/genai v2.x with structured output (responseSchema)
 * Model: configurable via GEMINI_MODEL env var (default: gemini-2.0-flash)
 */

import { GoogleGenAI, Type } from '@google/genai';
import type { AIAnalysisOutput, ExtractedPage, PageSection } from './types';
import { AIAnalysisOutputSchema, PROMPT_VERSION } from './types';
import { SYSTEM_INSTRUCTION, buildAnalysisPrompt, buildComparisonPrompt } from './prompts';

export interface GeminiProviderConfig {
  apiKey: string;
  model: string;
  embeddingModel: string;
  timeoutMs: number;
}

export function getGeminiConfig(): GeminiProviderConfig {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable is not set');
  // If GEMINI_API_KEY is explicitly configured, align GOOGLE_API_KEY to prevent SDK internal conflicts
  if (process.env.GEMINI_API_KEY && process.env.GOOGLE_API_KEY !== process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
  }
  return {
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
    timeoutMs: 60000,
  };
}

// Define the Gemini response schema using the Type enum from @google/genai
// This enforces structured JSON output directly from the model
const RESPONSE_SCHEMA = {
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

export async function analyzeWithGemini(params: {
  page: ExtractedPage;
  targetTopic: string | null;
  timeoutMs?: number;
}): Promise<AIAnalysisOutput> {
  const config = getGeminiConfig();
  const genai = new GoogleGenAI({ apiKey: config.apiKey });
  
  // Hierarchical, token-aware content selection for AI prompt
  // For shorter pages (<= 2500 words), preserve comprehensive section content (up to 1500 chars).
  // For longer pages, select sections hierarchically: intro, conclusion, and highest-density sections.
  const isLongPage = params.page.wordCount > 2500 || params.page.sections.length > 15;
  const sectionsForPrompt = params.page.sections.map((s, index) => {
    let contentSnippet = s.content;
    const maxChars = isLongPage ? 600 : 1200;
    
    if (contentSnippet.length > maxChars) {
      // Hierarchical excerpt: first 400 chars + ellipsis + last 200 chars to retain thesis and conclusion
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

  // Configurable primary reasoning model: defaults to sustained, fast gemini-3.6-flash, or configurable via GEMINI_MODEL (e.g. gemini-3.8-flash)
  const primaryModel = config.model || 'gemini-3.6-flash';
  // If primary is 3.6, fallback is 3.8-flash; if primary is 3.8, fallback is 3.6-flash
  const fallbackModel = primaryModel === 'gemini-3.6-flash' ? 'gemini-3.8-flash' : 'gemini-3.6-flash';
  const candidateModels = [primaryModel, fallbackModel].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let responseText: string | undefined;
  let selectedModelUsed: string = primaryModel;
  let fallbackActivated = false;
  let totalApiRequestsUsed = 0;
  let lastError: unknown;

  // Bounded retry helper with exponential backoff and jitter (~1s, ~2s, ~4s)
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
    const currentModel = candidateModels[mIdx];
    const isFallback = mIdx > 0;
    if (isFallback) {
      fallbackActivated = true;
    }

    // Up to 3 attempts (1 initial + 2 backoff retries) per model for transient errors
    const maxAttempts = 3;
    let modelSuccess = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        totalApiRequestsUsed++;

        // Strict timeout per attempt (25s on primary 3.8-flash, 30s on fallback 3.6-flash)
        const attemptTimeoutMs = currentModel === primaryModel ? 25000 : 35000;
        const generatePromise = genai.models.generateContent({
          model: currentModel,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Model request timed out after ${attemptTimeoutMs}ms`)), attemptTimeoutMs);
        });

        const response = await Promise.race([generatePromise, timeoutPromise]);

        if (response.text) {
          responseText = response.text;
          selectedModelUsed = currentModel;
          modelSuccess = true;
          break;
        }
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || err);
        const status = err?.status || err?.code || 0;

        // HTTP 401 / 403: Stop immediately — fatal auth/permission configuration
        if (status === 401 || status === 403 || errStr.includes('PERMISSION_DENIED') || errStr.includes('API_KEY_INVALID')) {
          throw new Error(`Authentication/Permission error from Gemini API: ${errStr}`);
        }

        // HTTP 400: Invalid parameters — do not retry blindly
        if (status === 400 || errStr.includes('INVALID_ARGUMENT')) {
          throw new Error(`Invalid request parameters sent to Gemini: ${errStr}`);
        }

        // HTTP 429: Check if project quota is completely exhausted
        if (status === 429 || errStr.includes('RESOURCE_EXHAUSTED')) {
          if (errStr.includes('Quota exceeded') || errStr.includes('daily limit')) {
            throw new Error(`Gemini project daily quota exhausted (HTTP 429). Will not cycle models to evade quota limits: ${errStr}`);
          }
          // Temporary rate spike: backoff if retries remain
          if (attempt < maxAttempts) {
            const backoffMs = Math.pow(2, attempt - 1) * 1000 + Math.floor(Math.random() * 500);
            await delay(backoffMs);
            continue;
          }
          break; // move to fallback
        }

        // HTTP 500, 502, 503, 504 or network timeout / high demand
        const isTransientServerIssue = status === 500 || status === 502 || status === 503 || status === 504 ||
          errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || errStr.includes('fetch failed') ||
          errStr.includes('timeout') || errStr.includes('ECONNRESET');

        if (isTransientServerIssue) {
          if (attempt < maxAttempts) {
            // Exponential backoff: ~1s, ~2s, ~4s + jitter
            const backoffMs = Math.pow(2, attempt - 1) * 1000 + Math.floor(Math.random() * 500);
            await delay(backoffMs);
            continue;
          }
          // Retry budget exhausted for this model, step to fallback
          break;
        }

        // Model not found or deprecated: immediately attempt verified fallback
        if (status === 404 || errStr.includes('NOT_FOUND')) {
          break;
        }

        // Unclassified error: break to fallback
        break;
      }
    }

    if (modelSuccess && responseText) {
      break;
    }
  }

  const text = responseText;
  if (!text) throw (lastError || new Error('Gemini returned empty response after retries and fallback'));
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    // One controlled JSON repair attempt: trim markdown wrappers or trailing garbage if present
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
  
  // Validate section IDs referenced by AI against actual extracted sections
  const validSectionIds = new Set(params.page.sections.map(s => s.id));
  const validateSectionIds = (ids: string[]) => ids.filter(id => validSectionIds.has(id));
  
  // Clean up any hallucinated section IDs
  const output = result.data;
  output.primaryTopic.supportingSectionIds = validateSectionIds(output.primaryTopic.supportingSectionIds);
  output.secondaryTopics = output.secondaryTopics.map(t => ({
    ...t,
    supportingSectionIds: validateSectionIds(t.supportingSectionIds),
  }));

  // Recommendation Evidence Grounding Verification:
  // Strictly verify whether existingEvidence citations actually exist in extracted page content.
  const lowerFullText = (params.page.fullText || '').toLowerCase();
  output.recommendations = output.recommendations.map(rec => {
    let verifiedConfidence = rec.confidenceStatus;
    let verifiedPlacement = rec.suggestedPlacement;

    // Validate suggested placement
    if (verifiedPlacement && !validSectionIds.has(verifiedPlacement)) {
      verifiedPlacement = null;
    }

    // Validate existing evidence against page content
    if (rec.existingEvidence && rec.existingEvidence.trim().length > 0) {
      const cleanSnippet = rec.existingEvidence.trim().toLowerCase().replace(/['"“”]/g, '');
      // Check if either the full quote or a substantial fragment (>= 20 chars) exists in page text
      const fragment = cleanSnippet.slice(0, Math.min(30, cleanSnippet.length));
      const appearsInPage = lowerFullText.includes(fragment);

      if (!appearsInPage) {
        // Evidence could not be corroborated in page text — downgrade to inferred/requires-verification
        verifiedConfidence = 'requires-verification';
      } else {
        verifiedConfidence = 'evidence-based';
      }
    } else {
      // No empirical quote provided
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
 * Executes in bounded parallel batches to preserve quota and avoid throttling.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const config = getGeminiConfig();
  const genai = new GoogleGenAI({ apiKey: config.apiKey });
  
  // Bounded batch execution (max 5 parallel calls)
  const results: number[][] = [];
  const batchSize = 5;
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const chunkEmbeddings = await Promise.all(
      chunk.map(async (text) => {
        try {
          const res = await genai.models.embedContent({
            model: config.embeddingModel,
            contents: text.slice(0, 1000), // Cap length for embedding tokens
          });
          return res.embeddings?.[0]?.values || [];
        } catch (err) {
          console.warn('Embedding failed for text chunk:', err);
          return [];
        }
      })
    );
    results.push(...chunkEmbeddings);
  }
  return results;
}

export async function healthCheck(): Promise<{ available: boolean; model: string; embeddingModel: string; error?: string }> {
  try {
    const config = getGeminiConfig();
    const genai = new GoogleGenAI({ apiKey: config.apiKey });
    const response = await genai.models.generateContent({
      model: config.model,
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ready' }] }],
      config: { maxOutputTokens: 10, temperature: 0 },
    });
    return { available: !!response.text, model: config.model, embeddingModel: config.embeddingModel };
  } catch (e) {
    return {
      available: false,
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
      error: String(e),
    };
  }
}
