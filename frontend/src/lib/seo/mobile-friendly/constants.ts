import { ViewportPreset } from './types';

export const MOBILE_VIEWPORT_PRESETS: Record<string, ViewportPreset> = {
  standard: {
    id: 'standard',
    name: 'Standard Mobile (iPhone 14 / modern baseline - 390 x 844)',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
  android: {
    id: 'android',
    name: 'Android Standard (Pixel 7 / Galaxy - 412 x 915)',
    width: 412,
    height: 915,
    deviceScaleFactor: 2.625,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  },
  small: {
    id: 'small',
    name: 'Small Mobile (iPhone SE / compact - 375 x 667)',
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  },
  large: {
    id: 'large',
    name: 'Large Mobile / Phablet (iPhone Pro Max - 430 x 932)',
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  },
};

export const DEFAULT_VIEWPORT_PRESET = MOBILE_VIEWPORT_PRESETS.standard;

export const AUDIT_THRESHOLDS = {
  // Font legibility baseline
  MIN_LEGIBLE_FONT_SIZE_PX: 12,
  RECOMMENDED_BODY_FONT_SIZE_PX: 16,
  MAX_FLAGGED_SMALL_TEXT_EXAMPLES: 8,

  // Tap target guidelines
  MIN_RECOMMENDED_TAP_TARGET_SIZE_PX: 44, // WCAG AAA / Apple HIG
  MIN_ACCEPTABLE_TAP_TARGET_SIZE_PX: 28,  // WCAG AA Level 2.5.8 min 24px + spacing
  MIN_TAP_TARGET_SPACING_PX: 8,
  MAX_FLAGGED_TAP_TARGET_EXAMPLES: 8,

  // Horizontal overflow tolerance (accounts for sub-pixel border rounding)
  HORIZONTAL_OVERFLOW_TOLERANCE_PX: 3,
  MAX_FLAGGED_OVERFLOW_ELEMENTS: 8,

  // Limits
  MAX_URLS_PER_BULK_REQUEST: 50,
  CLIENT_BATCH_CHUNK_SIZE: 5, // Client sends up to 5 URLs per API request chunk to prevent serverless timeout
  MAX_RESPONSE_HTML_BYTES: 2 * 1024 * 1024, // 2 MiB
  HTTP_FETCH_TIMEOUT_MS: 12000,
};
