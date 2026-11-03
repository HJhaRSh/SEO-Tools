import type { AIAnalysisOutput, ExtractedPage } from './types';
import { analyzeWithGemini } from './geminiProvider';
import { analyzeWithCFWorkers, getCFConfig } from './cfWorkersProvider';

export type ProviderName = 'gemini' | 'cloudflare' | 'none';

export function getPreferredProvider(): ProviderName {
  const configured = process.env.PAGE_FOCUS_AI_PROVIDER || 'gemini';
  if (configured === 'cloudflare' && getCFConfig()) return 'cloudflare';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (getCFConfig()) return 'cloudflare';
  return 'none';
}

export async function runAIAnalysis(params: {
  page: ExtractedPage;
  targetTopic: string | null;
}): Promise<{ output: AIAnalysisOutput | null; provider: ProviderName; error: string | null }> {
  const preferred = getPreferredProvider();
  
  if (preferred === 'gemini') {
    try {
      const output = await analyzeWithGemini(params);
      return { output, provider: 'gemini', error: null };
    } catch (e) {
      const geminiError = String(e);
      // Try CF fallback
      if (getCFConfig()) {
        try {
          const output = await analyzeWithCFWorkers(params);
          return { output, provider: 'cloudflare', error: null };
        } catch (e2) {
          return { output: null, provider: 'none', error: `Gemini: ${geminiError}. Cloudflare: ${String(e2)}` };
        }
      }
      return { output: null, provider: 'none', error: geminiError };
    }
  }
  
  if (preferred === 'cloudflare') {
    try {
      const output = await analyzeWithCFWorkers(params);
      return { output, provider: 'cloudflare', error: null };
    } catch (e) {
      return { output: null, provider: 'none', error: String(e) };
    }
  }
  
  return { output: null, provider: 'none', error: 'No AI provider configured. Set GEMINI_API_KEY in environment variables.' };
}
