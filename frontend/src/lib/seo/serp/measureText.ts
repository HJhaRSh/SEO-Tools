let cachedCanvas: HTMLCanvasElement | null = null;
let cachedContext: CanvasRenderingContext2D | null = null;

/**
 * Unicode-aware character count using Array.from.
 */
export function getUnicodeLength(text: string): number {
  if (!text) return 0;
  return Array.from(text).length;
}

/**
 * Measures text width in pixels safely using an in-memory browser canvas.
 * Safe for SSR (returns an estimate fallback if window/document is undefined).
 */
export function measureTextWidth(text: string, font: string = '20px Arial, sans-serif'): number {
  if (!text) return 0;

  // SSR or headless fallback estimation based on average character width
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    // Approx 9.5px per char for 20px title, 7.5px for 14px description
    const isSmall = font.includes('14px');
    return Math.round(getUnicodeLength(text) * (isSmall ? 7.6 : 9.8));
  }

  try {
    if (!cachedCanvas) {
      cachedCanvas = document.createElement('canvas');
    }
    if (!cachedContext) {
      cachedContext = cachedCanvas.getContext('2d', { willReadFrequently: false });
    }
    if (cachedContext) {
      cachedContext.font = font;
      return Math.round(cachedContext.measureText(text).width);
    }
  } catch (err) {
    // In case canvas creation fails or is blocked
  }

  // Graceful fallback
  const isSmall = font.includes('14px');
  return Math.round(getUnicodeLength(text) * (isSmall ? 7.6 : 9.8));
}

/**
 * Truncates text accurately to fit within a given pixel width.
 * Performs a binary search + word-boundary snap + ellipsis (…).
 */
export function truncateToPixelWidth(
  text: string,
  maxWidth: number,
  font: string,
  ellipsis: string = '…'
): { truncatedText: string; isTruncated: boolean; measuredWidth: number } {
  if (!text) {
    return { truncatedText: '', isTruncated: false, measuredWidth: 0 };
  }

  const fullWidth = measureTextWidth(text, font);
  if (fullWidth <= maxWidth) {
    return { truncatedText: text, isTruncated: false, measuredWidth: fullWidth };
  }

  const ellipsisWidth = measureTextWidth(ellipsis, font);
  const targetWidth = Math.max(0, maxWidth - ellipsisWidth);

  // Binary search for longest fitting substring by code point index
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  let bestFitCount = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = chars.slice(0, mid).join('');
    const candidateWidth = measureTextWidth(candidate, font);

    if (candidateWidth <= targetWidth) {
      bestFitCount = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let cutText = chars.slice(0, bestFitCount).join('');

  // Prefer word-boundary cut if reasonable (avoid trailing half-words if a space is close)
  const lastSpaceIdx = cutText.lastIndexOf(' ');
  if (lastSpaceIdx > 12 && lastSpaceIdx > cutText.length - 15) {
    cutText = cutText.slice(0, lastSpaceIdx);
  }

  // Trim trailing punctuation and whitespace before ellipsis
  cutText = cutText.replace(/[\s.,;:!?'"\\/-]+$/, '');

  const truncatedText = `${cutText}${ellipsis}`;
  const measuredWidth = measureTextWidth(truncatedText, font);

  return {
    truncatedText,
    isTruncated: true,
    measuredWidth,
  };
}
