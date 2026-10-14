export type SerpDevice = 'desktop' | 'mobile';

export interface SerpLimits {
  titlePx: number;
  descriptionLineWidthPx: number;
  descriptionLines: number;
  previewContainerPx: number;
}

export const SERP_LIMITS: Record<SerpDevice, SerpLimits> = {
  desktop: {
    titlePx: 600,
    descriptionLineWidthPx: 600,
    descriptionLines: 2,
    previewContainerPx: 652,
  },
  mobile: {
    titlePx: 560,
    descriptionLineWidthPx: 380,
    descriptionLines: 3,
    previewContainerPx: 400,
  },
};

export const SERP_FONTS = {
  desktop: {
    title: '20px Arial, sans-serif',
    description: '14px Arial, sans-serif',
  },
  mobile: {
    title: '18px Roboto, Arial, sans-serif',
    description: '14px Roboto, Arial, sans-serif',
  },
};

export interface DisplayUrlResult {
  raw: string;
  normalized: string;
  hostname: string;
  origin: string;
  pathname: string;
  breadcrumbSegments: string[];
  formattedDisplay: string;
  isValid: boolean;
}

export interface TruncateResult {
  text: string;
  isTruncated: boolean;
  pixelWidth: number;
  maxPixelWidth: number;
}

export interface SerpFormData {
  url: string;
  title: string;
  description: string;
  query: string;
  device: SerpDevice;
  showDate: boolean;
  customDate?: string;
  showRating: boolean;
  ratingValue: number;
  reviewCount: number;
}

export interface MetadataFetchResponse {
  success: boolean;
  data?: {
    requestedUrl: string;
    finalUrl: string;
    title: string;
    description: string;
    canonical?: string | null;
    siteName?: string | null;
    favicon?: string | null;
    status: number;
  };
  error?: string;
  code?: string;
}
