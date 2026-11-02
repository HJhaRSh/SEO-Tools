import { z } from 'zod';

// Prompt version & scoring version
export const PROMPT_VERSION = 'v1.0.0';
export const SCORING_VERSION = 'v1.0.0';

// PageSection — a meaningful chunk of extracted page content
export interface PageSection {
  id: string;          // e.g. "section-0", "section-1"
  heading: string | null;
  headingLevel: number | null; // 1,2,3 or null
  content: string;
  wordCount: number;
  charOffset: number;  // approximate character position in full text
}

// ExtractedPage — result of URL fetch + content extraction
export interface ExtractedPage {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  language: string | null;
  h1: string | null;
  headings: { level: number; text: string }[];
  sections: PageSection[];
  fullText: string;
  wordCount: number;
  extractionQuality: 'high' | 'medium' | 'low' | 'failed';
  extractionNote: string | null;
  isTruncated: boolean;
  fetchDurationMs: number;
  timestamp: string;
}

// Topic detected on the page
export interface DetectedTopic {
  name: string;
  centralityScore: number;  // 0-100
  isPrimary: boolean;
  explanation: string;
  supportingSectionIds: string[];
  type: 'central' | 'peripheral';
}

export type ComponentStatus = 'available' | 'failed' | 'partial' | 'skipped';

// Component scores for the relevance index
export interface ScoreComponents {
  semanticSimilarity: number | null;         // 0-100, weight 35%
  searchIntentAlignment: number | null;      // 0-100, weight 20%
  topicalCoverage: number | null;            // 0-100, weight 20%
  headingStructuralAlignment: number | null; // 0-100, weight 10%
  supportingContextDepth: number | null;     // 0-100, weight 10%
  topicalCoherence: number | null;           // 0-100, weight 5%
  statuses: {
    semanticSimilarity: ComponentStatus;
    searchIntentAlignment: ComponentStatus;
    topicalCoverage: ComponentStatus;
    headingStructuralAlignment: ComponentStatus;
    supportingContextDepth: ComponentStatus;
    topicalCoherence: ComponentStatus;
  };
}

export interface TopicCoverageItem {
  concept: string;
  status: 'covered' | 'partial' | 'missing' | 'irrelevant';
  evidence?: string | null;
  sectionId?: string | null;
}

export interface SearchIntentAnalysis {
  primaryIntent: 'informational' | 'commercial' | 'transactional' | 'navigational' | 'local' | 'mixed';
  secondaryIntent?: string | null;
  pageIntentSatisfaction: 'fully' | 'partially' | 'weakly' | 'not';
  unaddressedNeeds: string[];
  explanation: string;
}

export interface SectionAnalysis {
  sectionId: string;
  heading: string | null;
  topicAlignmentScore: number; // 0-100
  alignmentLabel: 'strong' | 'moderate' | 'weak' | 'off-topic';
  stronglyCoveredConcepts: string[];
  weaklyCoveredConcepts: string[];
  missingContext: string | null;
  explanation: string;
  recommendation: string | null;
}

export interface ContentRecommendation {
  title: string;
  priority: 'high' | 'medium' | 'low';
  issue: string;
  existingEvidence: string | null;
  proposedImprovement: string;
  seoRationale: string;
  suggestedPlacement: string | null;
  expectedUserBenefit: string;
  confidenceStatus: 'evidence-based' | 'inferred' | 'requires-verification';
}

export interface CompetitorComparison {
  competitorUrl: string;
  ourScore: number | null;
  competitorScore: number | null;
  ourComponents: ScoreComponents | null;
  competitorComponents: ScoreComponents | null;
  isPartialReport: boolean;
  missingComponents: string[];
  verdict: string;
  topicGaps: string[];          // topics competitor covers we don't
  ourAdvantages: string[];      // topics we cover better
  sectionComparisons: {
    ourSectionId: string;
    competitorSectionId: string | null;
    similarity: number;
    notes: string;
  }[];
  improvements: ContentRecommendation[];
}

export interface PageFocusReport {
  // Metadata
  analysisId: string;
  timestamp: string;
  promptVersion: string;
  scoringVersion: string;
  aiProvider: string;
  
  // Inputs
  targetUrl: string;
  targetTopic: string | null;
  competitorUrl: string | null;
  
  // Extraction
  page: ExtractedPage;
  competitorPage: ExtractedPage | null;
  
  // Analysis
  pageSummary: string;
  primaryTopic: DetectedTopic;
  secondaryTopics: DetectedTopic[];
  searchIntent: SearchIntentAnalysis | null;
  
  // Scoring
  overallRelevanceScore: number | null;  // null if no target topic or partial report
  isPartialReport: boolean;
  missingComponents: string[];
  scoreComponents: ScoreComponents | null;
  scoreInterpretation: string | null;
  
  // Coverage
  topicCoverage: TopicCoverageItem[];
  contentGaps: string[];
  
  // Section analysis
  sectionAnalyses: SectionAnalysis[];
  
  // Recommendations
  recommendations: ContentRecommendation[];
  executiveSummary: string | null;
  
  // Competitor (if provided)
  competitorReport: CompetitorComparison | null;
  
  // Limitations
  limitations: string[];
  aiAvailable: boolean;

  // Rate Limiting
  rateLimit?: {
    remainingMinute: number;
    remainingDay: number;
    perMinute: number;
    perDay: number;
  };
}

// Zod schemas for API request validation
export const AnalyzeRequestSchema = z.object({
  url: z.string().url().max(2048),
  targetTopic: z.string().max(200).optional(),
  manualText: z.string().max(50000).optional(),
  mode: z.enum(['topics', 'relevance', 'sections', 'recommendations', 'all']).default('all'),
});

export const CompareRequestSchema = z.object({
  url: z.string().url().max(2048),
  competitorUrl: z.string().url().max(2048),
  targetTopic: z.string().max(200),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type CompareRequest = z.infer<typeof CompareRequestSchema>;

// Zod schema for Gemini AI structured output validation
export const AIAnalysisOutputSchema = z.object({
  pageSummary: z.string(),
  primaryTopic: z.object({
    name: z.string(),
    centralityScore: z.number().min(0).max(100),
    explanation: z.string(),
    supportingSectionIds: z.array(z.string()),
    type: z.enum(['central', 'peripheral']),
  }),
  secondaryTopics: z.array(z.object({
    name: z.string(),
    centralityScore: z.number().min(0).max(100),
    explanation: z.string(),
    supportingSectionIds: z.array(z.string()),
    type: z.enum(['central', 'peripheral']),
  })).max(12),
  searchIntent: z.object({
    primaryIntent: z.enum(['informational', 'commercial', 'transactional', 'navigational', 'local', 'mixed']),
    secondaryIntent: z.string().nullable().optional(),
    pageIntentSatisfaction: z.enum(['fully', 'partially', 'weakly', 'not']),
    unaddressedNeeds: z.array(z.string()),
    explanation: z.string(),
  }).nullable(),
  topicCoverage: z.array(z.object({
    concept: z.string(),
    status: z.enum(['covered', 'partial', 'missing', 'irrelevant']),
    evidence: z.string().nullable().optional(),
    sectionId: z.string().nullable().optional(),
  })),
  contentGaps: z.array(z.string()),
  sectionFindings: z.array(z.object({
    sectionId: z.string(),
    topicAlignmentScore: z.number().min(0).max(100),
    alignmentLabel: z.enum(['strong', 'moderate', 'weak', 'off-topic']),
    stronglyCoveredConcepts: z.array(z.string()).optional().default([]),
    weaklyCoveredConcepts: z.array(z.string()).optional().default([]),
    missingContext: z.string().nullable().optional(),
    explanation: z.string(),
    recommendation: z.string().nullable().optional(),
  })),
  recommendations: z.array(z.object({
    title: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    issue: z.string(),
    existingEvidence: z.string().nullable().optional(),
    proposedImprovement: z.string(),
    seoRationale: z.string(),
    suggestedPlacement: z.string().nullable().optional(),
    expectedUserBenefit: z.string(),
    confidenceStatus: z.enum(['evidence-based', 'inferred', 'requires-verification']),
  })).min(0).max(10),
  executiveSummary: z.string().nullable(),
  aiScoreComponents: z.object({
    searchIntentAlignment: z.number().min(0).max(100),
    topicalCoverage: z.number().min(0).max(100),
    supportingContextDepth: z.number().min(0).max(100),
  }),
  limitations: z.array(z.string()),
});

export type AIAnalysisOutput = z.infer<typeof AIAnalysisOutputSchema>;
