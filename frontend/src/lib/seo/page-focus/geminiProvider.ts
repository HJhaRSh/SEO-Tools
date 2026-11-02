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
  return {
    apiKey,
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
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
  
  const userPrompt = buildAnalysisPrompt({
    targetTopic: params.targetTopic,
    pageTitle: params.page.title,
    metaDescription: params.page.metaDescription,
    h1: params.page.h1,
    headings: params.page.headings,
    sections: params.page.sections.map(s => ({
      id: s.id,
      heading: s.heading,
      content: s.content.slice(0, 800), // limit per section to control tokens
    })),
    wordCount: params.page.wordCount,
    language: params.page.language,
    extractionNote: params.page.extractionNote,
  });

  const candidateModels = [config.model, 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']
    .filter((m, idx, arr) => arr.indexOf(m) === idx);

  let responseText: string | undefined;
  let lastError: unknown;

  for (const model of candidateModels) {
    try {
      const response = await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      });
      if (response.text) {
        responseText = response.text;
        break;
      }
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code || 0;
      // If quota exceeded (429), model overloaded (503), or not found (404), fall back to next model
      if (status === 429 || status === 503 || status === 404 || String(err).includes('quota') || String(err).includes('demand')) {
        continue;
      }
      throw err;
    }
  }

  const text = responseText;
  if (!text) throw (lastError || new Error('Gemini returned empty response'));
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned invalid JSON: ' + text.slice(0, 200));
  }
  
  // Validate with Zod
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
