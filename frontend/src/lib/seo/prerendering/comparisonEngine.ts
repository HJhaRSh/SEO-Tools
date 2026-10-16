import { AgentTestResult, ComparisonFieldResult, AuditSummary, PrerenderingClassification, FieldComparisonStatus, ComparisonSeverity } from './types';

/**
 * Determines whether a test result represents an eligible, successful HTML webpage
 * suitable for standard SEO signal comparison (title, desc, h1, canonical, robots, links, images).
 */
export function isEligibleForSeoComparison(result: AgentTestResult): boolean {
  const isHtml = result.isHtml === true || (result.isHtml === undefined && (!result.contentType || result.contentType.toLowerCase().includes('text/html')));
  return (
    result.status === 'success' &&
    isHtml &&
    result.isErrorResponse !== true &&
    result.unsupportedContentType !== true &&
    result.statusCode !== null &&
    result.statusCode >= 200 &&
    result.statusCode < 300
  );
}

/**
 * Compares SEO fields across user-agent test results and computes audit summary & classifications.
 */
export function compareAgentResults(results: AgentTestResult[]): {
  comparisons: ComparisonFieldResult[];
  summary: AuditSummary;
} {
  const completedResponses = results.filter((r) => r.status === 'success');
  const eligibleSeoResults = results.filter(isEligibleForSeoComparison);
  const userAgentsTested = results.length;
  const successfulResponses = completedResponses.length;
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

  // Helper to build value map across all agents
  const getValues = <T>(fn: (r: AgentTestResult) => T): Record<string, any> => {
    const vals: Record<string, any> = {};
    for (const r of results) {
      vals[r.userAgentId] = r.status === 'success' ? fn(r) : null;
    }
    return vals;
  };

  // =========================================================================
  // CATEGORY A: HTTP RESPONSE COMPARISONS (All Completed Responses)
  // =========================================================================

  // 1. HTTP Status Code
  const statusValues = getValues((r) => r.statusCode);
  const distinctStatuses = new Set(completedResponses.map((r) => r.statusCode));
  const differentHttpStatuses = distinctStatuses.size > 1;
  const anyErrors = completedResponses.some((r) => r.isErrorResponse);
  comparisons.push({
    field: 'statusCode',
    label: 'HTTP Status',
    status: differentHttpStatuses ? 'different' : anyErrors ? 'http-error-response' : 'matched',
    severity: differentHttpStatuses || anyErrors ? 'warning' : 'info',
    values: statusValues,
    explanation: differentHttpStatuses
      ? `Different HTTP status codes returned across user agents (${Array.from(distinctStatuses).join(', ')}). Check for bot blocking, security challenges, or agent-specific redirects.`
      : anyErrors
      ? `All agents returned HTTP error status (${Array.from(distinctStatuses)[0]}).`
      : `Identical HTTP status (${Array.from(distinctStatuses)[0]}) returned to all tested agents.`,
  });

  // 1b. Content-Type & HTML Validity
  const contentTypeValues = getValues((r) => r.contentType);
  const distinctContentTypes = new Set(completedResponses.map((r) => (r.contentType || '').split(';')[0].trim().toLowerCase()));
  const anyUnsupportedContent = completedResponses.some((r) => r.unsupportedContentType);
  const differentContentTypes = distinctContentTypes.size > 1;
  comparisons.push({
    field: 'contentType',
    label: 'Content-Type & Document Format',
    status: anyUnsupportedContent ? 'unsupported-content' : differentContentTypes ? 'different' : 'matched',
    severity: anyUnsupportedContent ? 'error' : differentContentTypes ? 'warning' : 'info',
    values: contentTypeValues,
    explanation: anyUnsupportedContent
      ? `One or more user-agent responses returned a non-HTML document type (e.g. JSON, PDF, or binary stream). Non-HTML content is excluded from webpage SEO comparisons.`
      : differentContentTypes
      ? `Different MIME types returned across user agents (${Array.from(distinctContentTypes).join(', ')}).`
      : `All user agents received valid HTML document format (${Array.from(distinctContentTypes)[0] || 'text/html'}).`,
  });

  // 2. Final URL / Redirects
  const finalUrls = getValues((r) => r.finalUrl);
  const distinctFinalUrls = new Set(completedResponses.map((r) => r.finalUrl));
  const distinctRedirectCounts = new Set(completedResponses.map((r) => r.redirectChain.length));
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

  // 9. Vary: User-Agent Header
  const varyValues = getValues((r) => r.varyUserAgent);
  const distinctVary = new Set(completedResponses.map((r) => r.varyUserAgent));
  const varyPresentOnAny = completedResponses.some((r) => r.varyUserAgent === 'Present');
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
  const distinctMd5 = new Set(completedResponses.map((r) => r.md5));
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

  // =========================================================================
  // CATEGORY B: SEO SIGNAL COMPARISONS (Eligible 2xx HTML Pages Only)
  // =========================================================================
  const numEligible = eligibleSeoResults.length;
  const isComparisonIncomplete = numEligible < 2;

  // 3. Page Title
  const titleValues = getValues((r) => (isEligibleForSeoComparison(r) ? r.title : null));
  let titleStatus: FieldComparisonStatus = 'matched';
  let titleSeverity: ComparisonSeverity = 'info';
  let titleExplanation = 'Titles match across all eligible HTML responses.';

  if (numEligible === 0) {
    titleStatus = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    titleSeverity = 'warning';
    titleExplanation = 'No eligible 2xx HTML responses available to compare page titles.';
  } else if (isComparisonIncomplete) {
    titleStatus = 'insufficient-comparable-responses';
    titleSeverity = 'info';
    titleExplanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const rawTitles = eligibleSeoResults.map((r) => (r.title ? r.title.trim().toLowerCase() : null));
    const missingTitlesCount = rawTitles.filter((t) => t === null).length;
    if (missingTitlesCount === numEligible) {
      titleStatus = 'missing';
      titleSeverity = 'error';
      titleExplanation = 'No <title> tag found on any eligible user-agent response.';
    } else if (missingTitlesCount > 0 && missingTitlesCount < numEligible) {
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
  }
  const differentTitles = titleStatus === 'different' || (titleStatus === 'missing' && numEligible > 1);
  comparisons.push({
    field: 'title',
    label: 'Page Title',
    status: titleStatus,
    severity: titleSeverity,
    values: titleValues,
    explanation: titleExplanation,
  });

  // 4. Meta Description
  const descValues = getValues((r) => (isEligibleForSeoComparison(r) ? r.metaDescription : null));
  let descStatus: FieldComparisonStatus = 'matched';
  let descSeverity: ComparisonSeverity = 'info';
  let descExplanation = 'Meta descriptions match across all eligible HTML responses.';

  if (numEligible === 0) {
    descStatus = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    descSeverity = 'info';
    descExplanation = 'No eligible 2xx HTML responses available to compare meta descriptions.';
  } else if (isComparisonIncomplete) {
    descStatus = 'insufficient-comparable-responses';
    descSeverity = 'info';
    descExplanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const rawDescs = eligibleSeoResults.map((r) => (r.metaDescription ? r.metaDescription.trim().toLowerCase() : null));
    const missingDescCount = rawDescs.filter((d) => d === null).length;
    if (missingDescCount === numEligible) {
      descStatus = 'missing';
      descSeverity = 'info';
      descExplanation = 'Meta description tag is absent on all eligible user agents.';
    } else if (missingDescCount > 0 && missingDescCount < numEligible) {
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
  const h1Values = getValues((r) => (isEligibleForSeoComparison(r) ? r.h1 : []));
  let h1Status: FieldComparisonStatus = 'matched';
  let h1Severity: ComparisonSeverity = 'info';
  let h1Explanation = 'H1 headings are consistent across all eligible HTML responses.';

  if (numEligible === 0) {
    h1Status = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    h1Severity = 'info';
    h1Explanation = 'No eligible 2xx HTML responses available to compare H1 headings.';
  } else if (isComparisonIncomplete) {
    h1Status = 'insufficient-comparable-responses';
    h1Severity = 'info';
    h1Explanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const normalizedH1Strings = eligibleSeoResults.map((r) => r.h1.map((h) => h.trim().toLowerCase()).join(' | '));
    const distinctH1s = new Set(normalizedH1Strings);
    if (distinctH1s.size > 1) {
      h1Status = 'different';
      h1Severity = 'warning';
      h1Explanation = 'H1 heading counts or text content differ across user agents.';
    }
  }
  const differentH1s = h1Status === 'different';
  comparisons.push({
    field: 'h1',
    label: 'H1 Headings',
    status: h1Status,
    severity: h1Severity,
    values: h1Values,
    explanation: h1Explanation,
  });

  // 6. Word Count
  const wordCountValues = getValues((r) => (isEligibleForSeoComparison(r) ? r.wordCount : null));
  let wordStatus: FieldComparisonStatus = 'matched';
  let wordSeverity: ComparisonSeverity = 'info';
  let wordExplanation = 'Body text word counts are substantially equivalent across user agents.';

  if (numEligible === 0) {
    wordStatus = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    wordSeverity = 'info';
    wordExplanation = 'No eligible 2xx HTML responses available to compare body text word counts.';
  } else if (isComparisonIncomplete) {
    wordStatus = 'insufficient-comparable-responses';
    wordSeverity = 'info';
    wordExplanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const wordCounts = eligibleSeoResults.map((r) => r.wordCount || 0);
    const minWords = Math.min(...wordCounts);
    const maxWords = Math.max(...wordCounts);
    const wordDelta = maxWords - minWords;
    const wordRatio = maxWords > 0 ? wordDelta / maxWords : 0;
    if (wordRatio > 0.15 && wordDelta > 25) {
      wordStatus = 'different';
      wordSeverity = wordRatio > 0.5 ? 'warning' : 'info';
      wordExplanation = `Meaningful body text word count varies between ${minWords} and ${maxWords} words (${Math.round(wordRatio * 100)}% variance).`;
    }
  }
  comparisons.push({
    field: 'wordCount',
    label: 'Word Count (Body Text)',
    status: wordStatus,
    severity: wordSeverity,
    values: wordCountValues,
    explanation: wordExplanation,
  });

  // 7. Image Elements & Sampled Image Destinations/Alt-text
  const imageValues = getValues((r) => (isEligibleForSeoComparison(r) ? r.imageCount : null));
  let imgStatus: FieldComparisonStatus = 'matched';
  let imgSeverity: ComparisonSeverity = 'info';
  let imgExplanation = 'Sampled image URLs and alt text match across all eligible agents.';

  if (numEligible === 0) {
    imgStatus = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    imgSeverity = 'info';
    imgExplanation = 'No eligible 2xx HTML responses available to compare image elements.';
  } else if (isComparisonIncomplete) {
    imgStatus = 'insufficient-comparable-responses';
    imgSeverity = 'info';
    imgExplanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const distinctImages = new Set(eligibleSeoResults.map((r) => r.imageCount));
    const countDifferentImages = distinctImages.size > 1;

    const imageFingerprints = eligibleSeoResults.map((r) => {
      return (r.imagesSample || []).map((img) => `${img.src}::${img.alt}`).sort().join(' | ');
    });
    const distinctImageFingerprints = new Set(imageFingerprints);
    const differentImageDestinations = distinctImageFingerprints.size > 1;

    if (countDifferentImages) {
      imgStatus = 'different';
      imgSeverity = 'warning';
      imgExplanation = `Total <img> element counts differ across user agents (${Array.from(distinctImages).join(', ')}).`;
    } else if (differentImageDestinations) {
      imgStatus = 'different';
      imgSeverity = 'warning';
      imgExplanation = 'Image counts match, but sampled image source URLs (src) or alt text attributes differ across user agents.';
    }
  }
  comparisons.push({
    field: 'imageCount',
    label: 'Image Elements (<img>)',
    status: imgStatus,
    severity: imgSeverity,
    values: imageValues,
    explanation: imgExplanation,
  });

  // 8. Anchor Links & Sampled Destination Comparison
  const linkValues = getValues((r) => (isEligibleForSeoComparison(r) ? r.linkCount : null));
  let linkStatus: FieldComparisonStatus = 'matched';
  let linkSeverity: ComparisonSeverity = 'info';
  let linkExplanation = 'Sampled internal and external link destinations match across all eligible agents.';

  if (numEligible === 0) {
    linkStatus = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    linkSeverity = 'info';
    linkExplanation = 'No eligible 2xx HTML responses available to compare hyperlink destinations.';
  } else if (isComparisonIncomplete) {
    linkStatus = 'insufficient-comparable-responses';
    linkSeverity = 'info';
    linkExplanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const distinctLinks = new Set(eligibleSeoResults.map((r) => r.linkCount));
    const countDifferentLinks = distinctLinks.size > 1;

    const linkFingerprints = eligibleSeoResults.map((r) => {
      const internal = (r.internalLinksSample || []).slice(0, 50).sort().join(';');
      const external = (r.externalLinksSample || []).slice(0, 50).sort().join(';');
      return `${internal}||${external}`;
    });
    const distinctLinkFingerprints = new Set(linkFingerprints);
    const differentLinkDestinations = distinctLinkFingerprints.size > 1;

    if (countDifferentLinks) {
      linkStatus = 'different';
      linkSeverity = 'warning';
      linkExplanation = `Total hyperlink counts differ across user agents (${Array.from(distinctLinks).join(', ')}).`;
    } else if (differentLinkDestinations) {
      linkStatus = 'different';
      linkSeverity = 'warning';
      linkExplanation = 'Hyperlink counts match, but sampled link destination URLs differ across user agents.';
    }
  }
  comparisons.push({
    field: 'linkCount',
    label: 'Anchor Links (<a href>)',
    status: linkStatus,
    severity: linkSeverity,
    values: linkValues,
    explanation: linkExplanation,
  });
  // 11. Meta Robots Directives
  const robotsValues = getValues((r) => (isEligibleForSeoComparison(r) ? r.metaRobots || r.xRobotsTag || 'index, follow (default)' : null));
  let robotsStatus: FieldComparisonStatus = 'matched';
  let robotsSeverity: ComparisonSeverity = 'info';
  let robotsExplanation = 'Robots directives are consistent across all eligible HTML responses.';

  if (numEligible === 0) {
    robotsStatus = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    robotsSeverity = 'info';
    robotsExplanation = 'No eligible 2xx HTML responses available to compare robots indexing directives.';
  } else if (isComparisonIncomplete) {
    robotsStatus = 'insufficient-comparable-responses';
    robotsSeverity = 'info';
    robotsExplanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const normalizedRobots = eligibleSeoResults.map((r) => {
      const raw = (r.metaRobots || '') + ' ' + (r.xRobotsTag || '');
      return raw.toLowerCase().trim() || 'default';
    });
    const distinctRobots = new Set(normalizedRobots);
    if (distinctRobots.size > 1) {
      robotsStatus = 'different';
      robotsSeverity = 'error';
      robotsExplanation = 'Robots indexing directives differ across user agents. Verify that search engines are not receiving restrictive directives (e.g. noindex).';
    }
  }
  const robotsConflicts = robotsStatus === 'different';
  comparisons.push({
    field: 'metaRobots',
    label: 'Meta Robots & X-Robots-Tag',
    status: robotsStatus,
    severity: robotsSeverity,
    values: robotsValues,
    explanation: robotsExplanation,
  });

  // 12. Canonical URL
  const canonValues = getValues((r) => (isEligibleForSeoComparison(r) ? r.canonical : null));
  let canonStatus: FieldComparisonStatus = 'matched';
  let canonSeverity: ComparisonSeverity = 'info';
  let canonExplanation = 'Canonical URLs match across all eligible agents.';

  if (numEligible === 0) {
    canonStatus = anyErrors ? 'http-error-response' : anyUnsupportedContent ? 'unsupported-content' : 'not-tested';
    canonSeverity = 'info';
    canonExplanation = 'No eligible 2xx HTML responses available to compare canonical URLs.';
  } else if (isComparisonIncomplete) {
    canonStatus = 'insufficient-comparable-responses';
    canonSeverity = 'info';
    canonExplanation = `Only 1 user agent received an eligible 2xx HTML response (${eligibleSeoResults[0].userAgentName}). Comparison across user agents is incomplete.`;
  } else {
    const rawCanons = eligibleSeoResults.map((r) => (r.canonical ? r.canonical.trim().toLowerCase() : null));
    const missingCanonCount = rawCanons.filter((c) => c === null).length;
    if (missingCanonCount === numEligible) {
      canonStatus = 'missing';
      canonSeverity = 'info';
      canonExplanation = 'No rel="canonical" link or HTTP Link header declared on any eligible agent response.';
    } else if (missingCanonCount > 0 && missingCanonCount < numEligible) {
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

  const browserResults = eligibleSeoResults.filter((r) => r.userAgentId.includes('chrome'));
  const crawlerResults = eligibleSeoResults.filter((r) => !r.userAgentId.includes('chrome'));

  const allErrors = completedResponses.every((r) => r.isErrorResponse);
  const someErrors = completedResponses.some((r) => r.isErrorResponse) && !allErrors;
  const anyUnsupported = completedResponses.some((r) => r.unsupportedContentType);

  if (allErrors) {
    classification = 'Unable to Determine';
    classificationReason = `All tested user agents received HTTP error status codes (e.g. ${Array.from(distinctStatuses).join(', ')}). No valid page content could be evaluated.`;
  } else if (someErrors) {
    classification = 'Bot-Specific HTML Response';
    classificationReason = `HTTP responses differed significantly: some user agents received error codes (${Array.from(distinctStatuses).join(', ')}), indicating potential bot filtering, firewall rules, or agent-specific access restrictions.`;
  } else if (anyUnsupported) {
    classification = 'Bot-Specific HTML Response';
    classificationReason = 'One or more user agents received non-HTML payloads (e.g. JSON/PDF/binary) instead of standard web HTML markup.';
  } else if (numEligible < 2) {
    classification = 'Unable to Determine';
    classificationReason = `Insufficient comparable responses: only ${numEligible} user agent returned an eligible 2xx HTML page. Complete multi-agent SEO comparison cannot be established.`;
  } else if (canonicalConflicts || robotsConflicts) {
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
