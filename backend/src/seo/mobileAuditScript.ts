/**
 * Trusted in-application mobile DOM audit injection script.
 * Executed securely within an isolated Playwright Chromium page session.
 * Evaluates live computed bounding rects, font sizes, touch targets, and document scroll overflow.
 */
export const TRUSTED_MOBILE_AUDIT_SCRIPT = `(() => {
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
