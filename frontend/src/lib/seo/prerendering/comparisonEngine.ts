import { AgentTestResult, ComparisonFieldResult, AuditSummary, PrerenderingClassification } from './types';

/**
 * Compares SEO fields across user-agent test results and computes audit summary & classifications.
 */
export function compareAgentResults(results: AgentTestResult[]): {
  comparisons: ComparisonFieldResult[];
  summary: AuditSummary;
} {
  const successfulResults = results.filter((r) => r.status === 'success');
  const userAgentsTested = results.length;
  const successfulResponses = successfulResults.length;
  const failedResponses = results.filter((r) => r.status === 'error').length;

  if (successfulResponses === 0) {
    const summary: AuditSummary = {
      userAgentsTested,
      successfulResponses,
      failedResponses,
      differentHttpStatuses: false,
      differentRedirects: false,
      differentTitles: false,
      differentMetaDescriptions: false,
      differentH1s: false,
      canonicalConflicts: false,
      robotsConflicts: false,
      rawHtmlDifferences: false,
      classification: 'Unable to Determine',
      classificationReason: 'All user-agent requests failed or timed out. No response content could be analyzed.',
    };
    return { comparisons: [], summary };
  }

  const comparisons: ComparisonFieldResult[] = [];

  // Helper to build value map
  const getValues = <T>(fn: (r: AgentTestResult) => T): Record<string, any> => {
    const vals: Record<string, any> = {};
    for (const r of results) {
      vals[r.userAgentId] = r.status === 'success' ? fn(r) : null;
    }
    return vals;
  };

  // 1. HTTP Status Code
  const statusValues = getValues((r) => r.statusCode);
  const distinctStatuses = new Set(successfulResults.map((r) => r.statusCode));
  const differentHttpStatuses = distinctStatuses.size > 1;
  comparisons.push({
    field: 'statusCode',
    label: 'HTTP Status',
    status: differentHttpStatuses ? 'different' : 'matched',
    severity: differentHttpStatuses ? 'warning' : 'info',
    values: statusValues,
    explanation: differentHttpStatuses
      ? `Different HTTP status codes returned across user agents (${Array.from(distinctStatuses).join(', ')}). Check for bot blocking or agent-specific redirects.`
      : `Identical HTTP status (${Array.from(distinctStatuses)[0]}) returned to all tested agents.`,
  });

  // 2. Final URL / Redirects
  const finalUrls = getValues((r) => r.finalUrl);
  const distinctFinalUrls = new Set(successfulResults.map((r) => r.finalUrl));
  const distinctRedirectCounts = new Set(successfulResults.map((r) => r.redirectChain.length));
  const differentRedirects = distinctFinalUrls.size > 1 || distinctRedirectCounts.size > 1;
  comparisons.push({
    field: 'finalUrl',
    label: 'Redirect Destination & Chain',
    status: differentRedirects ? 'different' : 'matched',
    severity: differentRedirects ? 'warning' : 'info',
    values: finalUrls,
    explanation: differentRedirects
      ? `Responses redirected to different destinations or experienced divergent redirect chains.`
      : `All successful agents reached identical final destinations.`,
  });

  // 3. Page Title
  const titleValues = getValues((r) => r.title);
  const rawTitles = successfulResults.map((r) => (r.title ? r.title.trim().toLowerCase() : null));
  const missingTitlesCount = rawTitles.filter((t) => t === null).length;
  let titleStatus: 'matched' | 'different' | 'missing' = 'matched';
  let titleSeverity: 'error' | 'warning' | 'info' = 'info';
  let titleExplanation = 'Titles match across all successful user agents.';

  if (missingTitlesCount === successfulResponses) {
    titleStatus = 'missing';
    titleSeverity = 'error';
    titleExplanation = 'No <title> tag found on any user-agent response.';
  } else if (missingTitlesCount > 0 && missingTitlesCount < successfulResponses) {
    titleStatus = 'different';
    titleSeverity = 'error';
    titleExplanation = 'Title tag is missing on some user agents while present on others.';
  } else {
    const distinctTitles = new Set(rawTitles);
    if (distinctTitles.size > 1) {
      titleStatus = 'different';
      titleSeverity = 'warning';
      titleExplanation = 'Page title text differs across user agents.';
    }
  }
  const differentTitles = titleStatus === 'different' || (titleStatus === 'missing' && successfulResponses > 1);
  comparisons.push({
    field: 'title',
    label: 'Page Title',
    status: titleStatus,
    severity: titleSeverity,
    values: titleValues,
    explanation: titleExplanation,
  });

  // 4. Meta Description
  const descValues = getValues((r) => r.metaDescription);
  const rawDescs = successfulResults.map((r) => (r.metaDescription ? r.metaDescription.trim().toLowerCase() : null));
  const missingDescCount = rawDescs.filter((d) => d === null).length;
  let descStatus: 'matched' | 'different' | 'missing' = 'matched';
  let descSeverity: 'error' | 'warning' | 'info' = 'info';
  let descExplanation = 'Meta descriptions match across all successful user agents.';

  if (missingDescCount === successfulResponses) {
    descStatus = 'missing';
    descSeverity = 'info';
    descExplanation = 'Meta description tag is absent on all user agents.';
  } else if (missingDescCount > 0 && missingDescCount < successfulResponses) {
    descStatus = 'different';
    descSeverity = 'warning';
    descExplanation = 'Meta description is present on some user agents but missing on others.';
  } else {
    const distinctDescs = new Set(rawDescs);
    if (distinctDescs.size > 1) {
      descStatus = 'different';
      descSeverity = 'warning';
      descExplanation = 'Meta description content differs across user agents.';
    }
  }
  const differentMetaDescriptions = descStatus === 'different';
  comparisons.push({
    field: 'metaDescription',
    label: 'Meta Description',
    status: descStatus,
    severity: descSeverity,
    values: descValues,
    explanation: descExplanation,
  });

  // 5. H1 Headings
  const h1Values = getValues((r) => r.h1);
  const normalizedH1Strings = successfulResults.map((r) => r.h1.map((h) => h.trim().toLowerCase()).join(' | '));
  const distinctH1s = new Set(normalizedH1Strings);
  const differentH1s = distinctH1s.size > 1;
  comparisons.push({
    field: 'h1',
    label: 'H1 Headings',
    status: differentH1s ? 'different' : 'matched',
    severity: differentH1s ? 'warning' : 'info',
    values: h1Values,
    explanation: differentH1s
      ? 'H1 heading counts or text content differ across user agents.'
      : 'H1 headings are consistent across all successful agents.',
  });

  // 6. Word Count
  const wordCountValues = getValues((r) => r.wordCount);
  const wordCounts = successfulResults.map((r) => r.wordCount || 0);
  const minWords = Math.min(...wordCounts);
  const maxWords = Math.max(...wordCounts);
  const wordDelta = maxWords - minWords;
  const wordRatio = maxWords > 0 ? wordDelta / maxWords : 0;
  const wordCountDiffers = wordRatio > 0.15 && wordDelta > 25;
  comparisons.push({
    field: 'wordCount',
    label: 'Word Count (Body Text)',
    status: wordCountDiffers ? 'different' : 'matched',
    severity: wordRatio > 0.5 ? 'warning' : 'info',
    values: wordCountValues,
    explanation: wordCountDiffers
      ? `Meaningful body text word count varies between ${minWords} and ${maxWords} words (${Math.round(wordRatio * 100)}% variance).`
      : `Body text word counts are substantially equivalent across user agents.`,
  });

  // 7. Image Count
  const imageValues = getValues((r) => r.imageCount);
  const distinctImages = new Set(successfulResults.map((r) => r.imageCount));
  const differentImages = distinctImages.size > 1;
  comparisons.push({
    field: 'imageCount',
    label: 'Image Elements (<img>)',
    status: differentImages ? 'different' : 'matched',
    severity: differentImages ? 'warning' : 'info',
    values: imageValues,
    explanation: differentImages
      ? `Different numbers of <img> elements detected across user agents (${Array.from(distinctImages).join(', ')}).`
      : `Image element counts match across all agents.`,
  });

  // 8. Link Count
  const linkValues = getValues((r) => r.linkCount);
  const distinctLinks = new Set(successfulResults.map((r) => r.linkCount));
  const differentLinks = distinctLinks.size > 1;
  comparisons.push({
    field: 'linkCount',
    label: 'Anchor Links (<a href>)',
    status: differentLinks ? 'different' : 'matched',
    severity: differentLinks ? 'warning' : 'info',
    values: linkValues,
    explanation: differentLinks
      ? `Number of hyperlink anchors differs across user agents (${Array.from(distinctLinks).join(', ')}).`
      : `Total hyperlink counts match across all agents.`,
  });

  // 9. Vary: User-Agent Header
  const varyValues = getValues((r) => r.varyUserAgent);
  const distinctVary = new Set(successfulResults.map((r) => r.varyUserAgent));
  const varyPresentOnAny = successfulResults.some((r) => r.varyUserAgent === 'Present');
  comparisons.push({
    field: 'varyUserAgent',
    label: 'Vary: User-Agent Header',
    status: distinctVary.size > 1 ? 'different' : varyPresentOnAny ? 'matched' : 'missing',
    severity: varyPresentOnAny ? 'info' : 'warning',
    values: varyValues,
    explanation: varyPresentOnAny
      ? `The server specifies Vary: User-Agent, informing intermediate CDNs and caches to store user-agent-specific responses.`
      : `Vary: User-Agent is absent. If different HTML payloads are served to crawlers vs browsers, CDN/proxy cache collisions may occur.`,
  });

  // 10. HTML MD5 Fingerprint
  const md5Values = getValues((r) => r.md5);
  const distinctMd5 = new Set(successfulResults.map((r) => r.md5));
  const rawHtmlDifferences = distinctMd5.size > 1;
  comparisons.push({
    field: 'md5',
    label: 'HTML MD5 Fingerprint',
    status: rawHtmlDifferences ? 'different' : 'matched',
    severity: 'info',
    values: md5Values,
    explanation: rawHtmlDifferences
      ? `Raw HTML bytes differ across user agents (${distinctMd5.size} distinct fingerprints). This may reflect minor markup, tokens, dynamic timestamps, or different templates.`
      : `Identical raw HTML bytes were returned to all user agents.`,
  });

  // 11. Meta Robots Directives
  const robotsValues = getValues((r) => r.metaRobots || r.xRobotsTag || 'index, follow (default)');
  const normalizedRobots = successfulResults.map((r) => {
    const raw = (r.metaRobots || '') + ' ' + (r.xRobotsTag || '');
    return raw.toLowerCase().trim() || 'default';
  });
  const distinctRobots = new Set(normalizedRobots);
  const robotsConflicts = distinctRobots.size > 1;
  comparisons.push({
    field: 'metaRobots',
    label: 'Meta Robots & X-Robots-Tag',
    status: robotsConflicts ? 'different' : 'matched',
    severity: robotsConflicts ? 'error' : 'info',
    values: robotsValues,
    explanation: robotsConflicts
      ? `Robots indexing directives differ across user agents. Verify that search engines are not receiving restrictive directives (e.g. noindex).`
      : `Robots directives are consistent across all agents.`,
  });

  // 12. Canonical URL
  const canonValues = getValues((r) => r.canonical);
  const rawCanons = successfulResults.map((r) => (r.canonical ? r.canonical.trim().toLowerCase() : null));
  const missingCanonCount = rawCanons.filter((c) => c === null).length;
  let canonStatus: 'matched' | 'different' | 'missing' = 'matched';
  let canonSeverity: 'error' | 'warning' | 'info' = 'info';
  let canonExplanation = 'Canonical URLs match across all agents.';

  if (missingCanonCount === successfulResponses) {
    canonStatus = 'missing';
    canonSeverity = 'info';
    canonExplanation = 'No rel="canonical" link or HTTP Link header declared on any agent response.';
  } else if (missingCanonCount > 0 && missingCanonCount < successfulResponses) {
    canonStatus = 'different';
    canonSeverity = 'error';
    canonExplanation = 'Canonical URL is declared for some user agents but missing on others.';
  } else {
    const distinctCanons = new Set(rawCanons);
    if (distinctCanons.size > 1) {
      canonStatus = 'different';
      canonSeverity = 'error';
      canonExplanation = 'Canonical URL differs across user agents. This can create indexing conflicts.';
    }
  }
  const canonicalConflicts = canonStatus === 'different';
  comparisons.push({
    field: 'canonical',
    label: 'Canonical URL',
    status: canonStatus,
    severity: canonSeverity,
    values: canonValues,
    explanation: canonExplanation,
  });

  // ==========================================
  // CLASSIFICATION ENGINE (Evidence-based)
  // ==========================================
  let classification: PrerenderingClassification = 'Same HTML Response';
  let classificationReason = 'All user agents received identical HTML responses and matching SEO signals.';

  const browserResults = successfulResults.filter((r) => r.userAgentId.includes('chrome'));
  const crawlerResults = successfulResults.filter((r) => !r.userAgentId.includes('chrome'));

  if (canonicalConflicts || robotsConflicts) {
    classification = 'Potential SEO Signal Conflict';
    classificationReason = 'Critical SEO signals (such as Canonical URL or Robots directives) differ across user agents.';
  } else if (browserResults.length > 0 && crawlerResults.length > 0) {
    const browserAvgWords = browserResults.reduce((acc, r) => acc + (r.wordCount || 0), 0) / browserResults.length;
    const crawlerAvgWords = crawlerResults.reduce((acc, r) => acc + (r.wordCount || 0), 0) / crawlerResults.length;

    // Check if crawler received significantly more initial meaningful content (app shell vs rendered page)
    if (browserAvgWords < 60 && crawlerAvgWords > 35 && crawlerAvgWords > browserAvgWords * 2) {
      classification = 'Possible Pre-rendering / Dynamic Rendering';
      classificationReason = `Search engine crawlers received substantially more initial HTML text (${Math.round(crawlerAvgWords)} words) than standard browsers (${Math.round(browserAvgWords)} words), characteristic of dynamic rendering or server-side snapshot delivery.`;
    } else if (rawHtmlDifferences) {
      // Check if SEO fields are equal
      if (!differentTitles && !differentMetaDescriptions && !differentH1s && !differentHttpStatuses) {
        classification = 'Different Raw HTML, Same SEO Signals';
        classificationReason = 'Raw HTML hashes differ across agents, but primary technical SEO signals (Title, Description, H1, Canonical, Robots) remain equivalent.';
      } else {
        classification = 'Bot-Specific HTML Response';
        classificationReason = 'Crawlers received meaningfully different HTML markup or SEO metadata compared to standard browsers.';
      }
    }
  } else if (rawHtmlDifferences) {
    if (!differentTitles && !differentMetaDescriptions && !differentH1s) {
      classification = 'Different Raw HTML, Same SEO Signals';
      classificationReason = 'Raw HTML hashes differ, but evaluated SEO signals match.';
    } else {
      classification = 'Bot-Specific HTML Response';
      classificationReason = 'Observed HTML responses differ across user agents.';
    }
  }

  const summary: AuditSummary = {
    userAgentsTested,
    successfulResponses,
    failedResponses,
    differentHttpStatuses,
    differentRedirects,
    differentTitles,
    differentMetaDescriptions,
    differentH1s,
    canonicalConflicts,
    robotsConflicts,
    rawHtmlDifferences,
    classification,
    classificationReason,
  };

  return { comparisons, summary };
}
