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
 */
export function computeFinalScore(components: ScoreComponents): number {
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
 * Grounded in empirical vector space distribution of gemini-embedding-2 / transformer embeddings:
 * - Cosine <= 0.55 (unrelated baseline): maps to 0 - 20
 * - Cosine 0.55 to 0.70 (peripheral context): maps to 20 - 50
 * - Cosine 0.70 to 0.82 (good topical match): maps to 50 - 80
 * - Cosine > 0.82 (highly focused match): maps to 80 - 100
 */
export function calibrateCosineSimilarity(sim: number): number {
  if (isNaN(sim) || sim <= 0) return 0;
  if (sim <= 0.55) {
    return Math.max(0, (sim / 0.55) * 20);
  }
  if (sim <= 0.70) {
    return 20 + ((sim - 0.55) / 0.15) * 30;
  }
  if (sim <= 0.82) {
    return 50 + ((sim - 0.70) / 0.12) * 30;
  }
  return Math.min(100, 80 + ((sim - 0.82) / 0.18) * 20);
}

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
