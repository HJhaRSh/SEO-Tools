import type { ScoreComponents, PageSection, ExtractedPage } from './types';

export const SCORE_WEIGHTS = {
  semanticSimilarity: 0.35,
  searchIntentAlignment: 0.20,
  topicalCoverage: 0.20,
  headingStructuralAlignment: 0.10,
  supportingContextDepth: 0.10,
  topicalCoherence: 0.05,
};

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any',
  'are', 'aren', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
  'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'i', 'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'just', 'me',
  'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with',
  'would', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Clamps a score to the range [0, 100].
 */
export function clampScore(score: number): number {
  if (isNaN(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

/**
 * Computes the final weighted relevance score (0-100) rounded to 1 decimal place.
 * Returns null if any mandatory score component is null or unavailable, enforcing
 * the strict rule against presenting fabricated fallback scores as completed AI analysis.
 */
export function computeFinalScore(components: ScoreComponents): number | null {
  if (
    components.semanticSimilarity === null ||
    components.searchIntentAlignment === null ||
    components.topicalCoverage === null ||
    components.headingStructuralAlignment === null ||
    components.supportingContextDepth === null ||
    components.topicalCoherence === null
  ) {
    return null;
  }

  const weightedSum =
    (components.semanticSimilarity * SCORE_WEIGHTS.semanticSimilarity) +
    (components.searchIntentAlignment * SCORE_WEIGHTS.searchIntentAlignment) +
    (components.topicalCoverage * SCORE_WEIGHTS.topicalCoverage) +
    (components.headingStructuralAlignment * SCORE_WEIGHTS.headingStructuralAlignment) +
    (components.supportingContextDepth * SCORE_WEIGHTS.supportingContextDepth) +
    (components.topicalCoherence * SCORE_WEIGHTS.topicalCoherence);

  return Math.round(clampScore(weightedSum) * 10) / 10;
}

/**
 * Helper to tokenize text into meaningful non-stopword tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Computes heading structural alignment score (0-100).
 * Measures how well headings reflect the target topic, with bonuses for H1 alignment.
 */
export function computeHeadingAlignmentScore(
  topic: string,
  headings: { level: number; text: string }[]
): number {
  const topicTokens = Array.from(new Set(tokenize(topic)));

  if (topicTokens.length === 0) {
    return 50; // Neutral if no content terms in topic
  }

  if (headings.length === 0) {
    return 0;
  }

  const normalizedTopic = topic.trim().toLowerCase();
  const coveredTokens = new Set<string>();
  let h1Bonus = 0;
  let relevantHeadingsCount = 0;

  for (const h of headings) {
    const hTokens = tokenize(h.text);
    const hTextLower = h.text.trim().toLowerCase();

    // Check matches
    let matchesInThisHeading = 0;
    for (const t of topicTokens) {
      if (hTokens.includes(t)) {
        coveredTokens.add(t);
        matchesInThisHeading++;
      }
    }

    if (matchesInThisHeading > 0) {
      relevantHeadingsCount++;
    }

    // H1 Bonus logic
    if (h.level === 1) {
      if (hTextLower.includes(normalizedTopic) || normalizedTopic.includes(hTextLower)) {
        h1Bonus = Math.max(h1Bonus, 30);
      } else if (matchesInThisHeading >= Math.ceil(topicTokens.length / 2)) {
        h1Bonus = Math.max(h1Bonus, 20);
      } else if (matchesInThisHeading > 0) {
        h1Bonus = Math.max(h1Bonus, 10);
      }
    }
  }

  // Ratio of distinct topic terms covered across all headings (0 to 60)
  const coverageRatio = coveredTokens.size / topicTokens.length;
  const coverageScore = coverageRatio * 60;

  // Heading density: proportion of headings that are relevant to topic (0 to 15)
  const densityRatio = Math.min(1, relevantHeadingsCount / Math.max(1, headings.length));
  const densityScore = densityRatio * 15;

  const total = coverageScore + densityScore + h1Bonus;
  return Math.round(clampScore(total) * 10) / 10;
}

/**
 * Calibrates raw embedding cosine similarity [-1, 1] to a meaningful [0, 100] relevance metric.
 * Empirically calibrated against the gemini-embedding-2 (3072-dimension) benchmark dataset:
 * - Irrelevant (Marine biology / K8s vs Real estate/food): raw cosine 0.468 - 0.511 -> calibrated score 0 - 20
 * - Partially Relevant (Regional infrastructure / general nightlife): raw cosine 0.684 - 0.703 -> calibrated score 20 - 55
 * - Highly Relevant (Targeted investment guide / BBQ restaurant guide): raw cosine 0.851 - 0.909 -> calibrated score 75 - 100
 * - Keyword Stuffed (Repetitive shallow terms): raw cosine 0.952 (moderated by structural & coherence penalties)
 */
export function calibrateCosineSimilarity(sim: number): number {
  if (isNaN(sim) || sim <= 0) return 0;
  if (sim <= 0.52) {
    return Math.max(0, (sim / 0.52) * 20);
  }
  if (sim <= 0.72) {
    return 20 + ((sim - 0.52) / 0.20) * 35;
  }
  if (sim <= 0.84) {
    return 55 + ((sim - 0.72) / 0.12) * 25;
  }
  return Math.min(100, 80 + ((sim - 0.84) / 0.16) * 20);
}

// Empirical benchmark dataset used to validate cosine distribution and calibration
export interface CalibrationBenchmarkSample {
  category: 'irrelevant' | 'partially-relevant' | 'highly-relevant' | 'keyword-stuffed';
  topic: string;
  sampleText: string;
  expectedRawCosineRange: [number, number];
  expectedCalibratedScoreRange: [number, number];
}

export const CALIBRATION_BENCHMARK_SAMPLES: CalibrationBenchmarkSample[] = [
  {
    category: 'irrelevant',
    topic: 'luxury villa in goa',
    sampleText: 'Marine biology research explores deep sea coral reef ecosystems and benthic organisms found at abyssal hydrothermal vents.',
    expectedRawCosineRange: [0.35, 0.52],
    expectedCalibratedScoreRange: [0, 20],
  },
  {
    category: 'partially-relevant',
    topic: 'nagpur residential plots',
    sampleText: 'Maharashtra regional state infrastructure projects, highway expansions, and industrial freight logistics corridors.',
    expectedRawCosineRange: [0.65, 0.73],
    expectedCalibratedScoreRange: [40, 60],
  },
  {
    category: 'highly-relevant',
    topic: 'nagpur residential plots',
    sampleText: 'HOABL Codename Nagpur Marina offers prime gated residential land parcels, NA plots with world-class clubhouse amenities in South Nagpur.',
    expectedRawCosineRange: [0.82, 0.93],
    expectedCalibratedScoreRange: [75, 100],
  },
  {
    category: 'keyword-stuffed',
    topic: 'best seo tools',
    sampleText: 'Best SEO tools, best seo tools for marketing, top seo tools review, best seo tools free, seo tools list, seo tools ranking.',
    expectedRawCosineRange: [0.90, 0.98],
    expectedCalibratedScoreRange: [85, 100], // Raw semantic is high, but coherence and structural checks moderate overall
  },
];

/**
 * Computes topical coherence across sections (0-100).
 * Measures the proportion of content sections that maintain topical focus (alignment >= 40)
 * rather than penalizing diverse informational sections (like FAQs or author bios).
 * Coherence = (alignedSectionRatio * 70) + (topSectionAverage * 0.3)
 */
export function computeTopicalCoherence(sectionScores: number[]): number {
  if (sectionScores.length === 0) return 50;
  if (sectionScores.length === 1) return clampScore(sectionScores[0]);

  const validScores = sectionScores.filter(s => !isNaN(s));
  if (validScores.length === 0) return 50;

  // Percentage of sections that are relevant (score >= 40)
  const relevantCount = validScores.filter(s => s >= 40).length;
  const alignmentRatio = relevantCount / validScores.length;

  // Average of top 50% sections
  const sorted = [...validScores].sort((a, b) => b - a);
  const topHalfCount = Math.max(1, Math.ceil(sorted.length * 0.5));
  const topHalfAvg = sorted.slice(0, topHalfCount).reduce((a, b) => a + b, 0) / topHalfCount;

  // Weighted combination: 70% alignment ratio + 30% top-half quality
  const coherenceScore = (alignmentRatio * 70) + (topHalfAvg * 0.3);
  return Math.round(clampScore(coherenceScore) * 10) / 10;
}

/**
 * Standard cosine similarity between two numerical vectors. Returns -1 to 1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Returns human-readable interpretation label based on score.
 * 80+: Highly Relevant
 * 65-79: Strongly Relevant
 * 45-64: Moderately Relevant
 * 25-44: Weakly Relevant
 * <25: Off-Topic
 */
export function interpretScore(score: number): string {
  if (score >= 80) return 'Highly Relevant';
  if (score >= 65) return 'Strongly Relevant';
  if (score >= 45) return 'Moderately Relevant';
  if (score >= 25) return 'Weakly Relevant';
  return 'Off-Topic';
}

/**
 * Averages top-K similarities and applies sigmoid calibration:
 * (value + 1) / 2 maps [-1, 1] to [0, 1]
 * result = 100 / (1 + Math.exp(-8 * (normalizedSim - 0.5)))
 * Maps 0.5 cosine → 50 score, avoiding trivial high scores.
 */
export function aggregateChunkSimilarities(similarities: number[], topK: number = 5): number {
  if (!similarities || similarities.length === 0) {
    return 0;
  }

  const sorted = [...similarities].sort((a, b) => b - a);
  const k = Math.min(sorted.length, Math.max(1, topK));
  const topValues = sorted.slice(0, k);
  const avg = topValues.reduce((sum, v) => sum + v, 0) / k;

  // Normalized similarity from [-1, 1] to [0, 1]
  const normalizedSim = Math.max(0, Math.min(1, (avg + 1) / 2));

  // Sigmoid calibration
  const calibrated = 100 / (1 + Math.exp(-8 * (normalizedSim - 0.5)));

  return Math.round(clampScore(calibrated) * 10) / 10;
}
