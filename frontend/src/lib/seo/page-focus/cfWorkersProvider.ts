/**
 * Cloudflare Workers AI Provider — optional fallback
 * Uses @cf/meta/llama-3-8b-instruct (free tier eligible)
 * NOTE: Structured output support is limited; we parse JSON from text response
 */

import type { AIAnalysisOutput, ExtractedPage } from './types';
import { AIAnalysisOutputSchema } from './types';
import { SYSTEM_INSTRUCTION, buildAnalysisPrompt } from './prompts';

export function getCFConfig() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!accountId || !apiToken) return null;
  // Use @cf/meta/llama-3.1-8b-instruct (current maintained, free-tier eligible model on Cloudflare Workers AI)
  const model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  return { accountId, apiToken, model };
}

export async function analyzeWithCFWorkers(params: {
  page: ExtractedPage;
  targetTopic: string | null;
}): Promise<AIAnalysisOutput> {
  const config = getCFConfig();
  if (!config) throw new Error('Cloudflare Workers AI not configured');

  const userPrompt = buildAnalysisPrompt({
    targetTopic: params.targetTopic,
    pageTitle: params.page.title,
    metaDescription: params.page.metaDescription,
    h1: params.page.h1,
    headings: params.page.headings,
    sections: params.page.sections.slice(0, 10).map(s => ({
      id: s.id,
      heading: s.heading,
      content: s.content.slice(0, 500),
    })),
    wordCount: params.page.wordCount,
    language: params.page.language,
    extractionNote: params.page.extractionNote,
  });

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
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

  const data = await response.json() as { result?: { response?: string }; success?: boolean };
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
    throw new Error('Cloudflare AI response failed schema validation');
  }
  return result.data;
}

export async function cfHealthCheck(): Promise<boolean> {
  try {
    const config = getCFConfig();
    if (!config) return false;
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Say ready' }], max_tokens: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch { return false; }
}
