import * as cheerio from 'cheerio';
import {
  SingleUrlMobileAuditResult,
  MobileIssue,
  MobileCategoryResult,
  TestStatus,
  ViewportPreset,
} from './types';
import { AUDIT_THRESHOLDS, DEFAULT_VIEWPORT_PRESET } from './constants';

export interface StaticAuditOptions {
  url: string;
  finalUrl: string;
  statusCode: number;
  statusText?: string;
  durationMs: number;
  viewport?: ViewportPreset;
  testedAt?: string;
  browserAttempted?: boolean;
  browserFailureReason?: string;
}

/**
 * Performs deep, independent static HTML mobile-usability analysis using Cheerio DOM parsing.
 * Evaluates:
 * 1. Configure Viewport (<meta name="viewport"> presence, device-width, initial-scale, user-scalable, max-scale)
 * 2. Fixed Width Viewport (checks for static pixel widths like width=980 or fixed viewport definitions)
 * 3. Size Content to Viewport (identifies rigid fixed-width inline containers, wide images lacking max-width: 100%, oversized tables, unscrollable pre blocks)
 * 4. Legible Font Sizes (inspects inline CSS and style declarations for font-size < 12px or explicit tiny units)
 * 5. Tap Targets (evaluates touch targets, inline styles with small padding/height, and lists actionable selectors)
 * 6. Uses Incompatible Plugins (Flash .swf, Java Applets, Silverlight, unsupported ActiveX embeds)
 */
export function auditStaticHtmlMobileFriendliness(
  html: string,
  options: StaticAuditOptions
): SingleUrlMobileAuditResult {
  const vp = options.viewport || DEFAULT_VIEWPORT_PRESET;
  const issues: MobileIssue[] = [];

  // ==========================================
  // HTTP ERROR & NON-HTML HANDLING
  // ==========================================
  if (options.statusCode >= 400) {
    const errorStatusText = options.statusText || `HTTP ${options.statusCode}`;
    return {
      url: options.url,
      finalUrl: options.finalUrl,
      statusCode: options.statusCode,
      statusText: errorStatusText,
      durationMs: options.durationMs,
      testedAt: options.testedAt || new Date().toISOString(),
      isCompleted: true,
      overallStatus: 'ERROR',
      overallSummary: `Server returned HTTP ${options.statusCode} (${errorStatusText}). Mobile usability audit could not be performed on an error response.`,
      executionMode: 'static-dom-heuristics',
      assessmentLabel: 'Static HTML Assessment — Browser rendering not performed',
      errorCode: 'HTTP_ERROR',
      viewport: {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.deviceScaleFactor,
      },
      viewportDeclaration: {
        present: false,
        rawContent: null,
        hasDeviceWidth: false,
        hasInitialScale: false,
        userScalableNo: false,
        maximumScaleRestricted: false,
      },
      tests: {
        configureViewport: {
          status: 'NOT_TESTED',
          summary: `Skipped: Web server returned HTTP error status ${options.statusCode}.`,
          evidence: `HTTP ${options.statusCode}`,
          issues: [],
        },
        fixedWidthViewport: {
          status: 'NOT_TESTED',
          summary: `Skipped: Web server returned HTTP error status ${options.statusCode}.`,
          evidence: `HTTP ${options.statusCode}`,
          issues: [],
        },
        sizeContentToViewport: {
          status: 'NOT_TESTED',
          summary: `Skipped: Web server returned HTTP error status ${options.statusCode}.`,
          evidence: `HTTP ${options.statusCode}`,
          issues: [],
        },
        legibleFontSizes: {
          status: 'NOT_TESTED',
          summary: `Skipped: Web server returned HTTP error status ${options.statusCode}.`,
          evidence: `HTTP ${options.statusCode}`,
          issues: [],
        },
        tapTargets: {
          status: 'NOT_TESTED',
          summary: `Skipped: Web server returned HTTP error status ${options.statusCode}.`,
          evidence: `HTTP ${options.statusCode}`,
          issues: [],
        },
        incompatiblePlugins: {
          status: 'NOT_TESTED',
          summary: `Skipped: Web server returned HTTP error status ${options.statusCode}.`,
          evidence: `HTTP ${options.statusCode}`,
          issues: [],
        },
      },
      screenshot: {
        available: false,
        errorMessage: 'Screenshots require a successful browser-rendered response.',
        format: 'png',
        width: vp.width,
        height: vp.height,
      },
      issues: [
        {
          category: 'NETWORK',
          title: `Server Responded With HTTP ${options.statusCode}`,
          severity: 'CRITICAL',
          description: `The web server responded with error code ${options.statusCode} (${errorStatusText}). Mobile usability evaluations cannot be run on error documents.`,
          evidence: `Status Code: ${options.statusCode}`,
          recommendedAction: 'Ensure the requested URL returns an HTTP 200 OK status for mobile user-agents.',
        },
      ],
      metrics: {},
    };
  }

  // Handle non-HTML or empty content
  const trimmedHtml = (html || '').trim();
  const isLikelyHtml = trimmedHtml.includes('<html') || trimmedHtml.includes('<!DOCTYPE') || trimmedHtml.includes('<body') || trimmedHtml.includes('<div') || trimmedHtml.includes('<head');
  if (!isLikelyHtml && trimmedHtml.length > 0 && !trimmedHtml.startsWith('<')) {
    return {
      url: options.url,
      finalUrl: options.finalUrl,
      statusCode: options.statusCode,
      statusText: options.statusText || 'OK',
      durationMs: options.durationMs,
      testedAt: options.testedAt || new Date().toISOString(),
      isCompleted: true,
      overallStatus: 'ERROR',
      overallSummary: 'The response content does not appear to be an HTML document (e.g. JSON, plain text, or binary).',
      executionMode: 'static-dom-heuristics',
      assessmentLabel: 'Static HTML Assessment — Browser rendering not performed',
      errorCode: 'UNSUPPORTED_CONTENT',
      viewport: {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.deviceScaleFactor,
      },
      viewportDeclaration: {
        present: false,
        rawContent: null,
        hasDeviceWidth: false,
        hasInitialScale: false,
        userScalableNo: false,
        maximumScaleRestricted: false,
      },
      tests: {
        configureViewport: { status: 'NOT_TESTED', summary: 'Skipped for non-HTML payload.', issues: [] },
        fixedWidthViewport: { status: 'NOT_TESTED', summary: 'Skipped for non-HTML payload.', issues: [] },
        sizeContentToViewport: { status: 'NOT_TESTED', summary: 'Skipped for non-HTML payload.', issues: [] },
        legibleFontSizes: { status: 'NOT_TESTED', summary: 'Skipped for non-HTML payload.', issues: [] },
        tapTargets: { status: 'NOT_TESTED', summary: 'Skipped for non-HTML payload.', issues: [] },
        incompatiblePlugins: { status: 'NOT_TESTED', summary: 'Skipped for non-HTML payload.', issues: [] },
      },
      screenshot: {
        available: false,
        errorMessage: 'Screenshots require browser rendering on valid HTML pages.',
        format: 'png',
        width: vp.width,
        height: vp.height,
      },
      issues: [
        {
          category: 'NETWORK',
          title: 'Non-HTML Content Received',
          severity: 'CRITICAL',
          description: 'The response received from the server does not contain standard HTML markup.',
          evidence: `Payload preview: ${trimmedHtml.slice(0, 100)}`,
          recommendedAction: 'Test URLs that serve text/html webpage content.',
        },
      ],
      metrics: {},
    };
  }

  const $ = cheerio.load(html);

  // ==========================================
  // 1. CONFIGURE VIEWPORT & 2. FIXED WIDTH VIEWPORT
  // ==========================================
  const viewportMetas = $('meta[name="viewport" i], meta[content*="width" i][name*="viewport" i]');
  const rawViewportContent = viewportMetas.first().attr('content')?.trim() || null;
  const multipleViewports = viewportMetas.length > 1;

  let configureStatus: TestStatus = 'PASS';
  let configureSummary = 'Appropriate responsive viewport configuration detected.';
  let configureEvidence = rawViewportContent ? `content="${rawViewportContent}"` : 'No viewport meta tag found.';

  let fixedWidthStatus: TestStatus = 'PASS';
  let fixedWidthSummary = 'Responsive mobile viewport width declared (width=device-width).';
  let fixedWidthEvidence = rawViewportContent || 'No fixed viewport width tag.';

  let hasDeviceWidth = false;
  let hasInitialScale = false;
  let userScalableNo = false;
  let maximumScaleRestricted = false;

  if (!rawViewportContent) {
    configureStatus = 'FAIL';
    configureSummary = 'Missing viewport meta tag. Mobile browsers will render desktop scale zoomed out.';
    configureEvidence = 'No <meta name="viewport"> tag detected in document <head>.';

    issues.push({
      category: 'VIEWPORT',
      title: 'Viewport Not Configured',
      severity: 'CRITICAL',
      description: 'The webpage does not declare a viewport meta tag. Mobile browsers will default to rendering the page at desktop width (~980px) and zoom out, making text unreadable.',
      evidence: 'No <meta name="viewport"> found in HTML.',
      recommendedAction: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside your <head> section.',
    });

    fixedWidthStatus = 'FAIL';
    fixedWidthSummary = 'Unable to evaluate fixed width because viewport tag is missing.';
    fixedWidthEvidence = 'Viewport tag missing.';
  } else {
    hasDeviceWidth = /width\s*=\s*device-width/i.test(rawViewportContent);
    hasInitialScale = /initial-scale\s*=\s*1(\.0)?/i.test(rawViewportContent);
    userScalableNo = /user-scalable\s*=\s*(no|0)/i.test(rawViewportContent);
    maximumScaleRestricted = /maximum-scale\s*=\s*1(\.0)?/i.test(rawViewportContent);

    // Fixed width in viewport check
    const fixedWidthMatch = rawViewportContent.match(/width\s*=\s*(\d+)/i);
    if (fixedWidthMatch && !hasDeviceWidth) {
      const declaredWidth = parseInt(fixedWidthMatch[1], 10);
      fixedWidthStatus = 'FAIL';
      fixedWidthSummary = `Fixed viewport width (${declaredWidth}px) detected.`;
      fixedWidthEvidence = `Viewport specifies fixed width=${declaredWidth}.`;

      issues.push({
        category: 'FIXED_WIDTH',
        title: 'Fixed Width Viewport Declared',
        severity: 'CRITICAL',
        description: `The viewport specifies a fixed width of ${declaredWidth}px instead of width=device-width. This forces mobile screens to render at this fixed width and horizontally scroll.`,
        evidence: `content="${rawViewportContent}"`,
        recommendedAction: 'Replace fixed width with "width=device-width, initial-scale=1".',
        dimensions: {
          viewportWidth: vp.width,
          overflowPx: Math.max(0, declaredWidth - vp.width),
        },
      });
    }

    if (multipleViewports) {
      if ((configureStatus as TestStatus) !== 'FAIL') {
        configureStatus = 'WARNING';
      }
      issues.push({
        category: 'VIEWPORT',
        title: 'Multiple Conflicting Viewport Meta Tags',
        severity: 'WARNING',
        description: `Found ${viewportMetas.length} viewport meta tags. Multiple declarations can cause unpredictable rendering across mobile browser engines.`,
        evidence: `Found ${viewportMetas.length} <meta name="viewport"> tags.`,
        recommendedAction: 'Consolidate into a single valid <meta name="viewport" content="width=device-width, initial-scale=1"> tag.',
      });
    }

    if (!hasDeviceWidth || !hasInitialScale) {
      if ((configureStatus as TestStatus) !== 'FAIL') {
        configureStatus = 'WARNING';
        configureSummary = 'Viewport tag present but does not fully match recommended "width=device-width, initial-scale=1".';
        issues.push({
          category: 'VIEWPORT',
          title: 'Suboptimal Viewport Declaration',
          severity: 'WARNING',
          description: 'The viewport tag does not include the recommended standard attributes (width=device-width, initial-scale=1).',
          evidence: `content="${rawViewportContent}"`,
          recommendedAction: 'Update viewport to <meta name="viewport" content="width=device-width, initial-scale=1">.',
        });
      }
    }

    if (userScalableNo || maximumScaleRestricted) {
      issues.push({
        category: 'VIEWPORT',
        title: 'Pinch-to-Zoom Scaling Restricted',
        severity: 'WARNING',
        description: 'Disabling user scaling (user-scalable=no or maximum-scale=1) violates WCAG accessibility guidelines and prevents users with low vision from zooming.',
        evidence: `content="${rawViewportContent}"`,
        recommendedAction: 'Remove user-scalable=no and allow standard pinch-to-zoom scaling.',
      });
    }
  }

  // ==========================================
  // 3. SIZE CONTENT TO VIEWPORT (Static Heuristics)
  // ==========================================
  let overflowStatus: TestStatus = 'PASS';
  let overflowSummary = 'No rigid wide containers or unconstrained tables detected in HTML.';
  let overflowEvidence = 'Markup analysis shows responsive width practices.';

  const flaggedContainers: string[] = [];

  // Detect fixed-width inline CSS in HTML (e.g. style="width: 800px" or width="800")
  $('[style*="width"], [width]').each((_, el) => {
    const $el = $(el);
    const rawTag = (el as any).tagName || (el as any).name || '';
    const tagName = String(rawTag).toLowerCase();
    if (!tagName || ['script', 'svg', 'path', 'meta', 'link'].includes(tagName)) return;

    const styleAttr = $el.attr('style') || '';
    const widthAttr = $el.attr('width') || '';

    // Check style="width: 600px" or min-width: 600px
    const styleMatch = styleAttr.match(/(?:^|;)\s*(?:min-width|width)\s*:\s*(\d+)px/i);
    let pxVal = styleMatch ? parseInt(styleMatch[1], 10) : 0;

    // Check width="700"
    if (!pxVal && /^\d+$/.test(widthAttr)) {
      const parsedNum = parseInt(widthAttr, 10);
      if (tagName !== 'img' && tagName !== 'video') {
        pxVal = parsedNum;
      }
    }

    if (pxVal > vp.width) {
      const idOrClass = $el.attr('id') ? `#${$el.attr('id')}` : $el.attr('class') ? `.${$el.attr('class')?.split(' ')[0]}` : '';
      const selector = `${tagName}${idOrClass}`;
      if (!flaggedContainers.includes(selector)) {
        flaggedContainers.push(selector);
        issues.push({
          category: 'OVERFLOW',
          title: 'Fixed-Width Container Exceeds Mobile Viewport',
          severity: 'WARNING',
          description: `Element <${selector}> has explicit fixed width of ${pxVal}px, which exceeds mobile viewport width (${vp.width}px).`,
          evidence: `Fixed style width: ${pxVal}px. Viewport width: ${vp.width}px.`,
          selector,
          dimensions: {
            elementWidth: pxVal,
            viewportWidth: vp.width,
            overflowPx: pxVal - vp.width,
          },
          recommendedAction: 'Use relative units like max-width: 100% or responsive media queries instead of static pixel widths.',
        });
      }
    }
  });

  // Check unscrollable wide tables
  $('table').each((_, el) => {
    const $table = $(el);
    const parentClass = $table.parent().attr('class') || '';
    const parentStyle = $table.parent().attr('style') || '';
    const isWrappedInOverflow = /overflow-(x-auto|scroll)|table-responsive|table-wrapper/i.test(parentClass) ||
      /overflow-x\s*:\s*(auto|scroll)/i.test(parentStyle);

    if (!isWrappedInOverflow) {
      const colCount = $table.find('tr').first().find('th, td').length;
      if (colCount >= 4) {
        issues.push({
          category: 'OVERFLOW',
          title: 'Unresponsive Table Without Scroll Wrapper',
          severity: 'NOTICE',
          description: `Table with ${colCount} columns detected without a horizontal overflow scroll container wrapper. Wide tables cause horizontal layout breakages on mobile devices.`,
          evidence: `<table class="${$table.attr('class') || ''}"> has ${colCount} columns.`,
          selector: 'table',
          recommendedAction: 'Wrap wide tables in a <div style="overflow-x: auto;"> container.',
        });
      }
    }
  });

  // Check unscrollable <pre> tags
  $('pre').each((_, el) => {
    const $pre = $(el);
    const preStyle = $pre.attr('style') || '';
    const preClass = $pre.attr('class') || '';
    const isScrollable = /overflow|whitespace-pre-wrap|break-words/i.test(preStyle + ' ' + preClass);
    if (!isScrollable) {
      const textLen = $pre.text().length;
      if (textLen > 100) {
        issues.push({
          category: 'OVERFLOW',
          title: 'Code/Preformatted Block Risking Overflow',
          severity: 'NOTICE',
          description: '<pre> block detected without responsive wrapping or horizontal scrollbar.',
          evidence: '<pre> tag without overflow-x: auto or whitespace-wrap.',
          selector: 'pre',
          recommendedAction: 'Add overflow-x: auto or white-space: pre-wrap to preformatted code elements.',
        });
      }
    }
  });

  if (flaggedContainers.length > 0) {
    overflowStatus = 'WARNING';
    overflowSummary = `Found ${flaggedContainers.length} container(s) with fixed widths exceeding mobile screen (${vp.width}px).`;
    overflowEvidence = `Identified: ${flaggedContainers.slice(0, 3).join(', ')}`;
  } else {
    // Layout-level horizontal overflow cannot be reliably determined without browser rendering
    overflowStatus = 'NOT_TESTED';
    overflowSummary = 'No rigid inline width violations detected. Dynamic stylesheet overflow requires browser rendering.';
    overflowEvidence = 'Static HTML inspected; stylesheet CSS computed layout not tested.';
  }

  // ==========================================
  // 4. USE LEGIBLE FONT SIZES
  // ==========================================
  let fontStatus: TestStatus = 'PASS';
  let fontSummary = 'No illegibly small inline font styles (< 12px) detected in markup.';
  let fontEvidence = 'Inspected inline style declarations and elements.';
  let smallFontCount = 0;

  $('[style*="font-size"]').each((_, el) => {
    const styleAttr = $(el).attr('style') || '';
    const match = styleAttr.match(/font-size\s*:\s*([0-9.]+)(px|pt|em|rem)/i);
    if (match) {
      const val = parseFloat(match[1]);
      const unit = match[2].toLowerCase();
      let pxEquivalent = val;
      if (unit === 'pt') pxEquivalent = val * 1.333;
      if (unit === 'em' || unit === 'rem') pxEquivalent = val * 16;

      if (pxEquivalent < AUDIT_THRESHOLDS.MIN_LEGIBLE_FONT_SIZE_PX && smallFontCount < AUDIT_THRESHOLDS.MAX_FLAGGED_SMALL_TEXT_EXAMPLES) {
        smallFontCount++;
        const rawTag = (el as any).tagName || (el as any).name || 'element';
        const tagName = String(rawTag).toLowerCase();
        const snippet = $(el).text().trim().slice(0, 50) || 'Element';
        issues.push({
          category: 'FONT_SIZE',
          title: 'Illegibly Small Font Size Detected',
          severity: 'WARNING',
          description: `Text element <${tagName}> specifies font-size: ${match[1]}${unit} (~${pxEquivalent.toFixed(1)}px). Text smaller than 12px is difficult to read on mobile screens without zooming.`,
          evidence: `Style: "${styleAttr.slice(0, 80)}". Text sample: "${snippet}".`,
          selector: tagName,
          dimensions: {
            fontSizePx: pxEquivalent,
          },
          recommendedAction: `Increase font size to at least ${AUDIT_THRESHOLDS.RECOMMENDED_BODY_FONT_SIZE_PX}px for primary text, with an absolute minimum of ${AUDIT_THRESHOLDS.MIN_LEGIBLE_FONT_SIZE_PX}px for secondary captions.`,
        });
      }
    }
  });

  if (smallFontCount > 0) {
    fontStatus = 'WARNING';
    fontSummary = `Detected ${smallFontCount} element(s) with inline font sizes under 12px.`;
    fontEvidence = `${smallFontCount} small font style rules flagged.`;
  } else {
    // Computed stylesheet font sizes cannot be calculated without browser rendering
    fontStatus = 'NOT_TESTED';
    fontSummary = 'No inline font sizes < 12px found. Computed CSS stylesheet font sizes require browser rendering.';
    fontEvidence = 'Static HTML inspected; stylesheet CSS computed font sizes not tested.';
  }

  // ==========================================
  // 5. TAP TARGETS TOO CLOSE / TOO SMALL
  // ==========================================
  let tapTargetStatus: TestStatus = 'PASS';
  let tapTargetSummary = 'Standard links and buttons evaluated. (Static markup inspected).';
  let tapTargetEvidence = 'Evaluated visible interactive links, buttons, and form inputs.';
  let flaggedTapCount = 0;

  // Look for small dimensions or negative margins on interactive elements
  $('a, button, input[type="button"], input[type="submit"]').each((_, el) => {
    const $el = $(el);
    const styleAttr = $el.attr('style') || '';
    const heightMatch = styleAttr.match(/(?:^|;)\s*height\s*:\s*(\d+)px/i);
    const widthMatch = styleAttr.match(/(?:^|;)\s*width\s*:\s*(\d+)px/i);

    if (heightMatch && widthMatch) {
      const h = parseInt(heightMatch[1], 10);
      const w = parseInt(widthMatch[1], 10);

      if ((h < AUDIT_THRESHOLDS.MIN_ACCEPTABLE_TAP_TARGET_SIZE_PX || w < AUDIT_THRESHOLDS.MIN_ACCEPTABLE_TAP_TARGET_SIZE_PX) && flaggedTapCount < AUDIT_THRESHOLDS.MAX_FLAGGED_TAP_TARGET_EXAMPLES) {
        flaggedTapCount++;
        const rawTag = (el as any).tagName || (el as any).name || 'control';
        const tagName = String(rawTag).toLowerCase();
        const textSample = $el.text().trim().slice(0, 30) || $el.attr('aria-label') || 'Control';
        issues.push({
          category: 'TAP_TARGET',
          title: 'Undersized Tap Target',
          severity: 'WARNING',
          description: `Interactive element <${tagName}> has inline dimensions of ${w}x${h}px, below the recommended mobile touch target size of 44x44px.`,
          evidence: `Dimensions: ${w}x${h}px. Label: "${textSample}".`,
          selector: tagName,
          dimensions: {
            targetWidth: w,
            targetHeight: h,
          },
          recommendedAction: 'Provide an effective touch target of at least 44x44px, or increase padding.',
        });
      }
    }
  });

  if (flaggedTapCount > 0) {
    tapTargetStatus = 'WARNING';
    tapTargetSummary = `Identified ${flaggedTapCount} interactive target(s) with small fixed dimensions.`;
    tapTargetEvidence = `${flaggedTapCount} targets flagged with small inline bounds.`;
  } else {
    // Computed bounding boxes and touch spacing cannot be measured without browser rendering
    tapTargetStatus = 'NOT_TESTED';
    tapTargetSummary = 'No undersized inline targets found. Computed touch target bounds and spacing require browser rendering.';
    tapTargetEvidence = 'Static HTML inspected; rendered element bounding rects not tested.';
  }

  // ==========================================
  // 6. USES INCOMPATIBLE PLUGINS
  // ==========================================
  let pluginStatus: TestStatus = 'PASS';
  let pluginSummary = 'No obsolete mobile plugins (Flash, Silverlight, Java Applets) detected.';
  let pluginEvidence = 'Modern HTML5 standard elements verified.';

  const flashObjects = $('object[type*="flash" i], embed[type*="flash" i], object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000" i]');
  const appletTags = $('applet');
  const silverlight = $('object[type*="silverlight" i], embed[type*="silverlight" i]');

  if (flashObjects.length > 0 || appletTags.length > 0 || silverlight.length > 0) {
    pluginStatus = 'FAIL';
    const found: string[] = [];
    if (flashObjects.length > 0) found.push(`${flashObjects.length} Flash object(s)`);
    if (appletTags.length > 0) found.push(`${appletTags.length} Java Applet(s)`);
    if (silverlight.length > 0) found.push(`${silverlight.length} Silverlight object(s)`);

    pluginSummary = `Obsolete plugins detected: ${found.join(', ')}.`;
    pluginEvidence = `Found: ${found.join(', ')}`;

    issues.push({
      category: 'INCOMPATIBLE_PLUGINS',
      title: 'Obsolete Plugin Content Detected',
      severity: 'CRITICAL',
      description: 'The webpage contains plugin-based content (Flash, Silverlight, or Java Applets) that is unsupported by modern mobile operating systems (iOS and Android).',
      evidence: found.join(', '),
      recommendedAction: 'Replace obsolete plugins with modern HTML5 video, audio, Canvas, or WebGL standards.',
    });
  }

  // Calculate Overall Status
  // In static mode, if there are CRITICAL failures (e.g. missing/fixed viewport, obsolete plugins), overallStatus is FAIL.
  // If there are warnings, overallStatus is WARNING.
  // If static checks pass but layout/font/tap checks were NOT_TESTED, overallStatus is NOT_TESTED (or PASS only for static criteria with clear disclaimer).
  let overallStatus: TestStatus = 'PASS';
  if (issues.some((i) => i.severity === 'CRITICAL')) {
    overallStatus = 'FAIL';
  } else if (issues.some((i) => i.severity === 'WARNING')) {
    overallStatus = 'WARNING';
  } else if ([overflowStatus, fontStatus, tapTargetStatus].every((s) => s === 'NOT_TESTED')) {
    overallStatus = 'NOT_TESTED';
  }

  let overallSummary = 'Static HTML criteria evaluated. Full layout and touch measurements require browser rendering.';
  if (overallStatus === 'FAIL') {
    overallSummary = 'Page has critical mobile usability issues (e.g. missing viewport or fixed-width declaration).';
  } else if (overallStatus === 'WARNING') {
    overallSummary = 'Page is partially usable, but mobile configuration and sizing warnings were identified.';
  } else if (overallStatus === 'NOT_TESTED') {
    overallSummary = 'Static viewport & plugin checks passed. Computed layout, font size, and touch target checks were NOT_TESTED (requires browser rendering).';
  }

  return {
    url: options.url,
    finalUrl: options.finalUrl,
    statusCode: options.statusCode,
    statusText: options.statusText || 'OK',
    durationMs: options.durationMs,
    testedAt: options.testedAt || new Date().toISOString(),
    isCompleted: true,
    overallStatus,
    overallSummary,
    executionMode: 'static-dom-heuristics',
    assessmentLabel: 'Static HTML Assessment — Browser rendering not performed',
    browserAttempted: options.browserAttempted ?? false,
    browserFailureReason: options.browserFailureReason,
    viewport: {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.deviceScaleFactor,
    },
    viewportDeclaration: {
      present: Boolean(rawViewportContent),
      rawContent: rawViewportContent,
      hasDeviceWidth,
      hasInitialScale,
      userScalableNo,
      maximumScaleRestricted,
    },
    tests: {
      configureViewport: {
        status: configureStatus,
        summary: configureSummary,
        evidence: configureEvidence,
        issues: issues.filter((i) => i.category === 'VIEWPORT'),
      },
      fixedWidthViewport: {
        status: fixedWidthStatus,
        summary: fixedWidthSummary,
        evidence: fixedWidthEvidence,
        issues: issues.filter((i) => i.category === 'FIXED_WIDTH'),
      },
      sizeContentToViewport: {
        status: overflowStatus,
        summary: overflowSummary,
        evidence: overflowEvidence,
        issues: issues.filter((i) => i.category === 'OVERFLOW'),
      },
      legibleFontSizes: {
        status: fontStatus,
        summary: fontSummary,
        evidence: fontEvidence,
        issues: issues.filter((i) => i.category === 'FONT_SIZE'),
      },
      tapTargets: {
        status: tapTargetStatus,
        summary: tapTargetSummary,
        evidence: tapTargetEvidence,
        issues: issues.filter((i) => i.category === 'TAP_TARGET'),
      },
      incompatiblePlugins: {
        status: pluginStatus,
        summary: pluginSummary,
        evidence: pluginEvidence,
        issues: issues.filter((i) => i.category === 'INCOMPATIBLE_PLUGINS'),
      },
    },
    issues,
    screenshot: {
      available: false,
      errorMessage: 'Screenshots require browser rendering.',
      format: 'png',
      width: vp.width,
      height: vp.height,
    },
    metrics: {
      totalTextNodesEvaluated: $('p, h1, h2, h3, h4, h5, h6, li, span, a').length,
      flaggedTextNodes: smallFontCount,
      totalTapTargetsEvaluated: $('a, button, input[type="button"], input[type="submit"]').length,
      flaggedTapTargets: flaggedTapCount,
    },
  };
}
