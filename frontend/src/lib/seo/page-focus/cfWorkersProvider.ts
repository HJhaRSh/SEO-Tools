/**
 * Cloudflare Workers AI Provider — fallback provider
 * Uses @cf/meta/llama-3.1-8b-instruct (free tier eligible)
 * Validates output against the full AIAnalysisOutputSchema.
 */

import type { AIAnalysisOutput, ExtractedPage, PageSection } from './types';
import { AIAnalysisOutputSchema } from './types';
import { SYSTEM_INSTRUCTION, buildAnalysisPrompt } from './prompts';

export function getCFConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!accountId || !apiToken) return null;
  const model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  return { accountId, apiToken, model };
}

/**
 * Samples sections across the full page (beginning, middle, end)
 * preserving comprehensive context within token budgets.
 */
function sampleSectionsAcrossDocument(sections: PageSection[]): { id: string; heading: string | null; content: string }[] {
  const maxSections = 16;
  let selectedSections: PageSection[] = [];

  if (sections.length <= maxSections) {
    selectedSections = sections;
  } else {
    // Preserve first 3 (introduction/hero)
    const intro = sections.slice(0, 3);
    // Preserve last 2 (conclusion/summary)
    const conclusion = sections.slice(-2);
    // Evenly sample middle sections
    const middlePool = sections.slice(3, -2);
    const middleCount = maxSections - intro.length - conclusion.length;
    const step = middlePool.length / middleCount;
    const middle: PageSection[] = [];
    for (let i = 0; i < middleCount; i++) {
      middle.push(middlePool[Math.floor(i * step)]);
    }
    selectedSections = [...intro, ...middle, ...conclusion];
  }

  return selectedSections.map(s => {
    let text = s.content;
    const maxChars = 700;
    if (text.length > maxChars) {
      text = `${text.slice(0, 450).trim()} ... [excerpted] ... ${text.slice(-200).trim()}`;
    }
    return {
      id: s.id,
      heading: s.heading,
      content: text,
    };
  });
}

export async function analyzeWithCFWorkers(params: {
  page: ExtractedPage;
  targetTopic: string | null;
}): Promise<AIAnalysisOutput> {
  const config = getCFConfig();
  if (!config) throw new Error('Cloudflare Workers AI not configured');

  const sampledSections = sampleSectionsAcrossDocument(params.page.sections);

  const userPrompt = buildAnalysisPrompt({
    targetTopic: params.targetTopic,
    pageTitle: params.page.title,
    metaDescription: params.page.metaDescription,
    h1: params.page.h1,
    headings: params.page.headings,
    sections: sampledSections,
    wordCount: params.page.wordCount,
    language: params.page.language,
    extractionNote: params.page.extractionNote,
  });

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION + '\n\nReturn a valid JSON object matching the schema exactly.' },
        { role: 'user', content: userPrompt + '\n\nRespond with valid JSON only.' },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Cloudflare Workers AI error ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as { result?: { response?: string }; success?: boolean };
  const text = data?.result?.response;
  if (!text) throw new Error('Cloudflare Workers AI returned empty response');

  // Extract JSON from text (model may add prose around it)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object found in Cloudflare AI response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Invalid JSON from Cloudflare AI');
  }

  const result = AIAnalysisOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Cloudflare AI response failed schema validation: ${result.error.message.slice(0, 300)}`);
  }

  // Validate section IDs
  const validSectionIds = new Set(params.page.sections.map(s => s.id));
  const output = result.data;
  output.primaryTopic.supportingSectionIds = output.primaryTopic.supportingSectionIds.filter(id => validSectionIds.has(id));
  output.secondaryTopics = output.secondaryTopics.map(t => ({
    ...t,
    supportingSectionIds: t.supportingSectionIds.filter(id => validSectionIds.has(id)),
  }));

  return output;
}

export async function cfHealthCheck(options: { live?: boolean } = {}): Promise<boolean> {
  const config = getCFConfig();
  if (!config) return false;

  if (!options.live) {
    return true; // configuration check
  }

  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Say ready' }], max_tokens: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
