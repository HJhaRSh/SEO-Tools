import {
  SingleUrlMobileAuditResult,
  MobileIssue,
  TestStatus,
  ViewportPreset,
} from './types';
import { AUDIT_THRESHOLDS, DEFAULT_VIEWPORT_PRESET } from './constants';

export interface RenderAuditDomMetrics {
  documentScrollWidth: number;
  viewportClientWidth: number;
  horizontalOverflow: number;
  overflowingElements: {
    selector: string;
    width: number;
    rightOffset: number;
    tagName: string;
  }[];
  fontStats: {
    totalEvaluated: number;
    smallCount: number;
    examples: {
      selector: string;
      fontSizePx: number;
      textSample: string;
      tagName: string;
    }[];
  };
  tapTargetStats: {
    totalEvaluated: number;
    undersizedCount: number;
    tooCloseCount: number;
    examples: {
      selector: string;
      width: number;
      height: number;
      minDistancePx?: number;
      closestNeighborSelector?: string;
      label: string;
      issueType: 'too-small' | 'too-close';
    }[];
  };
  viewportMeta: {
    present: boolean;
    rawContent: string | null;
    hasDeviceWidth: boolean;
    hasInitialScale: boolean;
    userScalableNo: boolean;
    maximumScaleRestricted: boolean;
    fixedWidthNumber: number | null;
    multipleTags: boolean;
  };
  incompatiblePlugins: {
    found: boolean;
    pluginTypes: string[];
  };
}

/**
 * Script injected and executed inside real headless Chromium page to extract live computed bounding boxes,
 * computed font sizes, touch targets, and document scroll overflow.
 */
export const BROWSER_AUDIT_INJECTION_SCRIPT = `(() => {
  const result = {
    documentScrollWidth: Math.max(
      document.documentElement.scrollWidth || 0,
      document.body ? document.body.scrollWidth : 0
    ),
    viewportClientWidth: document.documentElement.clientWidth || window.innerWidth || 390,
    horizontalOverflow: 0,
    overflowingElements: [],
    fontStats: {
      totalEvaluated: 0,
      smallCount: 0,
      examples: []
    },
    tapTargetStats: {
      totalEvaluated: 0,
      undersizedCount: 0,
      tooCloseCount: 0,
      examples: []
    },
    viewportMeta: {
      present: false,
      rawContent: null,
      hasDeviceWidth: false,
      hasInitialScale: false,
      userScalableNo: false,
      maximumScaleRestricted: false,
      fixedWidthNumber: null,
      multipleTags: false
    },
    incompatiblePlugins: {
      found: false,
      pluginTypes: []
    }
  };

  result.horizontalOverflow = Math.max(0, result.documentScrollWidth - result.viewportClientWidth);

  // 1. Viewport Meta tag
  const vpMetas = Array.from(document.querySelectorAll('meta[name="viewport" i], meta[content*="width" i][name*="viewport" i]'));
  if (vpMetas.length > 0) {
    result.viewportMeta.present = true;
    result.viewportMeta.multipleTags = vpMetas.length > 1;
    const content = vpMetas[0].getAttribute('content') || '';
    result.viewportMeta.rawContent = content;
    result.viewportMeta.hasDeviceWidth = /width\\s*=\\s*device-width/i.test(content);
    result.viewportMeta.hasInitialScale = /initial-scale\\s*=\\s*1(\\b|\\.)/i.test(content);
    result.viewportMeta.userScalableNo = /user-scalable\\s*=\\s*(no|0)/i.test(content);
    result.viewportMeta.maximumScaleRestricted = /maximum-scale\\s*=\\s*1(\\b|\\.)/i.test(content);
    const fw = content.match(/width\\s*=\\s*(\\d+)/i);
    if (fw && !result.viewportMeta.hasDeviceWidth) {
      result.viewportMeta.fixedWidthNumber = parseInt(fw[1], 10);
    }
  }

  // Helper: concise CSS selector
  function getSelector(el) {
    if (!el || !el.tagName) return 'element';
    let sel = el.tagName.toLowerCase();
    if (el.id) return '#' + el.id;
    if (el.classList && el.classList.length > 0) {
      const cls = Array.from(el.classList).find(c => !c.includes(':') && !c.includes('['));
      if (cls) sel += '.' + cls;
    }
    return sel;
  }

  function isVisible(el, style) {
    if (!el || el.offsetParent === null && el.tagName !== 'BODY') return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // 2. Horizontal overflow elements
  if (result.horizontalOverflow > 3) {
    const allEls = document.querySelectorAll('div, section, article, img, table, pre, main, header, footer');
    for (const el of allEls) {
      const style = window.getComputedStyle(el);
      if (!isVisible(el, style)) continue;
      const rect = el.getBoundingClientRect();
      const rightEdge = rect.left + rect.width;
      if (rightEdge > result.viewportClientWidth + 4 && rect.width > 20) {
        result.overflowingElements.push({
          selector: getSelector(el),
          width: Math.round(rect.width),
          rightOffset: Math.round(rightEdge - result.viewportClientWidth),
          tagName: el.tagName.toLowerCase()
        });
        if (result.overflowingElements.length >= 8) break;
      }
    }
  }

  // 3. Computed Font Sizes
  const textEls = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, li, label, button, dt, dd');
  for (const el of textEls) {
    const text = (el.innerText || el.textContent || '').trim();
    if (!text || text.length < 2) continue;
    const style = window.getComputedStyle(el);
    if (!isVisible(el, style)) continue;

    result.fontStats.totalEvaluated++;
    const fs = parseFloat(style.fontSize);
    if (!isNaN(fs) && fs < 12) {
      result.fontStats.smallCount++;
      if (result.fontStats.examples.length < 8) {
        result.fontStats.examples.push({
          selector: getSelector(el),
          fontSizePx: Math.round(fs * 10) / 10,
          textSample: text.slice(0, 40),
          tagName: el.tagName.toLowerCase()
        });
      }
    }
  }

  // 4. Tap Targets (Links, Buttons, Clickable controls)
  const tapEls = Array.from(document.querySelectorAll('a, button, input:not([type="hidden"]), select, textarea, [role="button"], [onclick]'));
  const visibleTargets = [];

  for (const el of tapEls) {
    const style = window.getComputedStyle(el);
    if (!isVisible(el, style)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) continue; // Skip invisible anchors
    result.tapTargetStats.totalEvaluated++;

    const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.value || el.tagName).trim().slice(0, 30);
    const targetObj = {
      el,
      selector: getSelector(el),
      rect,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      label
    };
    visibleTargets.push(targetObj);

    // Flag undersized targets (< 28px)
    if ((rect.width < 28 || rect.height < 28) && result.tapTargetStats.examples.length < 8) {
      result.tapTargetStats.undersizedCount++;
      result.tapTargetStats.examples.push({
        selector: targetObj.selector,
        width: targetObj.width,
        height: targetObj.height,
        label: targetObj.label,
        issueType: 'too-small'
      });
    }
  }

  // Check tap targets too close (distance < 8px)
  const sampleCount = Math.min(visibleTargets.length, 50);
  for (let i = 0; i < sampleCount; i++) {
    if (result.tapTargetStats.examples.length >= 8) break;
    const t1 = visibleTargets[i];
    for (let j = i + 1; j < sampleCount; j++) {
      const t2 = visibleTargets[j];
      // Skip nested parent/child
      if (t1.el.contains(t2.el) || t2.el.contains(t1.el)) continue;

      const r1 = t1.rect;
      const r2 = t2.rect;

      const xDist = Math.max(0, Math.max(r1.left - r2.right, r2.left - r1.right));
      const yDist = Math.max(0, Math.max(r1.top - r2.bottom, r2.top - r1.bottom));
      const dist = Math.sqrt(xDist * xDist + yDist * yDist);

      if (dist < 8 && (r1.height < 44 || r1.width < 44 || r2.height < 44 || r2.width < 44)) {
        result.tapTargetStats.tooCloseCount++;
        result.tapTargetStats.examples.push({
          selector: t1.selector,
          width: t1.width,
          height: t1.height,
          minDistancePx: Math.round(dist),
          closestNeighborSelector: t2.selector,
          label: t1.label,
          issueType: 'too-close'
        });
        break;
      }
    }
  }

  // 5. Incompatible plugins
  const flash = document.querySelectorAll('object[type*="flash" i], embed[type*="flash" i]');
  const applets = document.querySelectorAll('applet');
  const silverlight = document.querySelectorAll('object[type*="silverlight" i], embed[type*="silverlight" i]');
  if (flash.length > 0 || applets.length > 0 || silverlight.length > 0) {
    result.incompatiblePlugins.found = true;
    if (flash.length > 0) result.incompatiblePlugins.pluginTypes.push('Flash');
    if (applets.length > 0) result.incompatiblePlugins.pluginTypes.push('Java Applet');
    if (silverlight.length > 0) result.incompatiblePlugins.pluginTypes.push('Silverlight');
  }

  return result;
})()`;

export interface BrowserAuditAssemblyOptions {
  url: string;
  finalUrl: string;
  statusCode: number;
  statusText?: string;
  durationMs: number;
  viewport?: ViewportPreset;
  screenshotBase64?: string;
  metrics: RenderAuditDomMetrics;
}

/**
 * Assembles a comprehensive SingleUrlMobileAuditResult from real headless browser DOM metrics.
 */
export function buildBrowserRenderedAuditResult(
  options: BrowserAuditAssemblyOptions
): SingleUrlMobileAuditResult {
  const vp = options.viewport || DEFAULT_VIEWPORT_PRESET;
  const m = options.metrics;
  const issues: MobileIssue[] = [];

  // 1. Viewport Meta
  let configureStatus: TestStatus = 'PASS';
  let configureSummary = 'Appropriate viewport configuration detected.';
  let configureEvidence = m.viewportMeta.rawContent ? `content="${m.viewportMeta.rawContent}"` : 'Missing tag';

  if (!m.viewportMeta.present) {
    configureStatus = 'FAIL';
    configureSummary = 'Missing viewport meta tag. Mobile browsers will render desktop scale zoomed out.';
    configureEvidence = 'No <meta name="viewport"> detected.';
    issues.push({
      category: 'VIEWPORT',
      title: 'Viewport Not Configured',
      severity: 'CRITICAL',
      description: 'The webpage does not declare a viewport meta tag. Mobile browsers will default to rendering the page at desktop width (~980px).',
      evidence: 'No <meta name="viewport"> tag present.',
      recommendedAction: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to document <head>.',
    });
  } else {
    if (!m.viewportMeta.hasDeviceWidth || !m.viewportMeta.hasInitialScale) {
      configureStatus = 'WARNING';
      configureSummary = 'Viewport tag present but width=device-width or initial-scale=1 missing.';
      issues.push({
        category: 'VIEWPORT',
        title: 'Suboptimal Viewport Declaration',
        severity: 'WARNING',
        description: 'The viewport tag does not specify the recommended standard attributes (width=device-width, initial-scale=1).',
        evidence: `content="${m.viewportMeta.rawContent}"`,
        recommendedAction: 'Update viewport to <meta name="viewport" content="width=device-width, initial-scale=1">.',
      });
    }

    if (m.viewportMeta.userScalableNo || m.viewportMeta.maximumScaleRestricted) {
      issues.push({
        category: 'VIEWPORT',
        title: 'Pinch-to-Zoom Scaling Restricted',
        severity: 'WARNING',
        description: 'Disabling user scaling (user-scalable=no or maximum-scale=1) violates accessibility guidelines.',
        evidence: `content="${m.viewportMeta.rawContent}"`,
        recommendedAction: 'Allow user zooming by removing user-scalable=no.',
      });
    }

    if (m.viewportMeta.multipleTags) {
      issues.push({
        category: 'VIEWPORT',
        title: 'Multiple Conflicting Viewport Meta Tags',
        severity: 'WARNING',
        description: 'Multiple viewport declarations detected.',
        evidence: 'Document contains multiple <meta name="viewport"> declarations.',
        recommendedAction: 'Consolidate into a single valid viewport declaration.',
      });
    }
  }

  // 2. Fixed Width Viewport
  let fixedWidthStatus: TestStatus = 'PASS';
  let fixedWidthSummary = 'Responsive mobile viewport width declared.';
  let fixedWidthEvidence = m.viewportMeta.rawContent || 'N/A';

  if (m.viewportMeta.fixedWidthNumber && m.viewportMeta.fixedWidthNumber > vp.width) {
    fixedWidthStatus = 'FAIL';
    fixedWidthSummary = `Fixed viewport width (${m.viewportMeta.fixedWidthNumber}px) detected.`;
    fixedWidthEvidence = `Viewport declares fixed width=${m.viewportMeta.fixedWidthNumber}.`;
    issues.push({
      category: 'FIXED_WIDTH',
      title: 'Fixed Width Viewport Declared',
      severity: 'CRITICAL',
      description: `Viewport declares width=${m.viewportMeta.fixedWidthNumber}px rather than adapting to the mobile device width (${vp.width}px).`,
      evidence: `content="${m.viewportMeta.rawContent}"`,
      recommendedAction: 'Change width to device-width.',
      dimensions: {
        viewportWidth: vp.width,
        overflowPx: m.viewportMeta.fixedWidthNumber - vp.width,
      },
    });
  } else if (!m.viewportMeta.present) {
    fixedWidthStatus = 'FAIL';
    fixedWidthSummary = 'Viewport tag missing.';
    fixedWidthEvidence = 'Viewport tag missing.';
  }

  // 3. Size Content to Viewport (Real Rendered Overflow)
  let overflowStatus: TestStatus = 'PASS';
  let overflowSummary = `Page content adapts cleanly to ${vp.width}px mobile viewport.`;
  let overflowEvidence = `Scroll width: ${m.documentScrollWidth}px, Viewport width: ${m.viewportClientWidth}px.`;

  if (m.horizontalOverflow > AUDIT_THRESHOLDS.HORIZONTAL_OVERFLOW_TOLERANCE_PX) {
    overflowStatus = 'FAIL';
    overflowSummary = `Document scroll width (${m.documentScrollWidth}px) exceeds mobile viewport (${m.viewportClientWidth}px) by ${m.horizontalOverflow}px.`;
    overflowEvidence = `Measured horizontal overflow: +${m.horizontalOverflow}px.`;

    for (const el of m.overflowingElements) {
      issues.push({
        category: 'OVERFLOW',
        title: 'Element Overflows Mobile Viewport',
        severity: 'CRITICAL',
        description: `Element <${el.selector}> extends ${el.rightOffset}px beyond the mobile screen boundary.`,
        evidence: `Element width: ${el.width}px. Viewport width: ${m.viewportClientWidth}px. Overflow: +${el.rightOffset}px.`,
        selector: el.selector,
        dimensions: {
          elementWidth: el.width,
          viewportWidth: m.viewportClientWidth,
          overflowPx: el.rightOffset,
        },
        recommendedAction: 'Apply max-width: 100% or overflow-x: auto to responsive containers.',
      });
    }

    if (m.overflowingElements.length === 0) {
      issues.push({
        category: 'OVERFLOW',
        title: 'Horizontal Layout Overflow Detected',
        severity: 'CRITICAL',
        description: `Page causes horizontal scroll of ${m.horizontalOverflow}px beyond the ${m.viewportClientWidth}px mobile viewport.`,
        evidence: `Scroll width: ${m.documentScrollWidth}px, Client width: ${m.viewportClientWidth}px.`,
        recommendedAction: 'Inspect full-width containers and reset margins or fixed widths.',
        dimensions: {
          viewportWidth: m.viewportClientWidth,
          overflowPx: m.horizontalOverflow,
        },
      });
    }
  }

  // 4. Legible Font Sizes
  let fontStatus: TestStatus = 'PASS';
  let fontSummary = `Analyzed ${m.fontStats.totalEvaluated} visible text elements. Text is legible.`;
  let fontEvidence = 'All evaluated visible text meets or exceeds 12px.';

  if (m.fontStats.smallCount > 0) {
    fontStatus = 'WARNING';
    fontSummary = `${m.fontStats.smallCount} of ${m.fontStats.totalEvaluated} text elements have computed font sizes under 12px.`;
    fontEvidence = `${m.fontStats.smallCount} elements flagged below 12px.`;

    for (const ex of m.fontStats.examples) {
      issues.push({
        category: 'FONT_SIZE',
        title: 'Computed Font Size Smaller Than 12px',
        severity: 'WARNING',
        description: `Element <${ex.selector}> renders with computed font size of ${ex.fontSizePx}px. Text under 12px requires zooming on mobile devices.`,
        evidence: `Computed size: ${ex.fontSizePx}px. Text: "${ex.textSample}".`,
        selector: ex.selector,
        dimensions: {
          fontSizePx: ex.fontSizePx,
        },
        recommendedAction: `Increase font size to at least ${AUDIT_THRESHOLDS.RECOMMENDED_BODY_FONT_SIZE_PX}px for readability.`,
      });
    }
  }

  // 5. Tap Targets Too Close
  let tapTargetStatus: TestStatus = 'PASS';
  let tapTargetSummary = `Evaluated ${m.tapTargetStats.totalEvaluated} touch targets. Spacing and dimensions are appropriate.`;
  let tapTargetEvidence = 'All evaluated targets meet mobile usability guidelines.';

  const tapIssuesCount = m.tapTargetStats.undersizedCount + m.tapTargetStats.tooCloseCount;
  if (tapIssuesCount > 0) {
    tapTargetStatus = 'WARNING';
    tapTargetSummary = `${tapIssuesCount} touch target warning(s) detected.`;
    tapTargetEvidence = `${m.tapTargetStats.undersizedCount} undersized, ${m.tapTargetStats.tooCloseCount} too close.`;

    for (const ex of m.tapTargetStats.examples) {
      if (ex.issueType === 'too-small') {
        issues.push({
          category: 'TAP_TARGET',
          title: 'Touch Target Smaller Than 28px',
          severity: 'WARNING',
          description: `Interactive element <${ex.selector}> renders at ${ex.width}x${ex.height}px, below the recommended 44x44px touch area.`,
          evidence: `Dimensions: ${ex.width}x${ex.height}px. Control: "${ex.label}".`,
          selector: ex.selector,
          dimensions: {
            targetWidth: ex.width,
            targetHeight: ex.height,
          },
          recommendedAction: 'Increase padding or touch area to at least 44x44px.',
        });
      } else {
        issues.push({
          category: 'TAP_TARGET',
          title: 'Tap Targets Positioned Too Close Together',
          severity: 'WARNING',
          description: `Target <${ex.selector}> is only ${ex.minDistancePx}px away from <${ex.closestNeighborSelector}>. Targets spaced closer than 8px lead to accidental taps on mobile touchscreens.`,
          evidence: `Distance: ${ex.minDistancePx}px. Adjacent element: <${ex.closestNeighborSelector}>.`,
          selector: ex.selector,
          dimensions: {
            targetDistancePx: ex.minDistancePx,
          },
          recommendedAction: 'Add at least 8px margin or spacing between clickable elements.',
        });
      }
    }
  }

  // 6. Uses Incompatible Plugins
  let pluginStatus: TestStatus = 'PASS';
  let pluginSummary = 'No obsolete mobile plugins detected.';
  let pluginEvidence = 'Modern HTML5 standards used.';

  if (m.incompatiblePlugins.found) {
    pluginStatus = 'FAIL';
    pluginSummary = `Obsolete plugins detected: ${m.incompatiblePlugins.pluginTypes.join(', ')}.`;
    pluginEvidence = m.incompatiblePlugins.pluginTypes.join(', ');
    issues.push({
      category: 'INCOMPATIBLE_PLUGINS',
      title: 'Obsolete Plugin Content Detected',
      severity: 'CRITICAL',
      description: `Page uses unsupported legacy plugins (${m.incompatiblePlugins.pluginTypes.join(', ')}).`,
      evidence: m.incompatiblePlugins.pluginTypes.join(', '),
      recommendedAction: 'Replace obsolete plugins with modern HTML5 video/Canvas.',
    });
  }

  // Overall status calculation
  let overallStatus: TestStatus = 'PASS';
  if (issues.some((i) => i.severity === 'CRITICAL')) {
    overallStatus = 'FAIL';
  } else if (issues.some((i) => i.severity === 'WARNING')) {
    overallStatus = 'WARNING';
  }

  let overallSummary = 'No major mobile usability issues detected.';
  if (overallStatus === 'FAIL') {
    overallSummary = 'Page has critical mobile usability issues (e.g. horizontal overflow or missing viewport).';
  } else if (overallStatus === 'WARNING') {
    overallSummary = 'Page is usable on mobile, but tap target spacing or font size warnings were found.';
  }

  return {
    url: options.url,
    finalUrl: options.finalUrl,
    statusCode: options.statusCode,
    statusText: options.statusText || 'OK',
    durationMs: options.durationMs,
    testedAt: new Date().toISOString(),
    isCompleted: true,
    overallStatus,
    overallSummary,
    executionMode: 'browser-rendered',
    assessmentLabel: 'Browser-Rendered Mobile Usability Assessment',
    viewport: {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.deviceScaleFactor,
    },
    viewportDeclaration: {
      present: m.viewportMeta.present,
      rawContent: m.viewportMeta.rawContent,
      hasDeviceWidth: m.viewportMeta.hasDeviceWidth,
      hasInitialScale: m.viewportMeta.hasInitialScale,
      userScalableNo: m.viewportMeta.userScalableNo,
      maximumScaleRestricted: m.viewportMeta.maximumScaleRestricted,
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
    screenshot: options.screenshotBase64
      ? {
          available: true,
          base64Data: options.screenshotBase64,
          format: 'png',
          width: vp.width,
          height: vp.height,
        }
      : undefined,
    issues,
    metrics: {
      totalTextNodesEvaluated: m.fontStats.totalEvaluated,
      flaggedTextNodes: m.fontStats.smallCount,
      totalTapTargetsEvaluated: m.tapTargetStats.totalEvaluated,
      flaggedTapTargets: tapIssuesCount,
      horizontalScrollWidth: m.documentScrollWidth,
      viewportClientWidth: m.viewportClientWidth,
    },
  };
}
