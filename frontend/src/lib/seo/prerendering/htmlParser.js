"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateWordCount = calculateWordCount;
exports.extractHtmlSignals = extractHtmlSignals;
exports.extractCanonicalFromHeaders = extractCanonicalFromHeaders;
exports.checkVaryUserAgent = checkVaryUserAgent;
const cheerio = __importStar(require("cheerio"));
const crypto_1 = __importDefault(require("crypto"));
/**
 * Calculates words from body text using Intl.Segmenter with standard regex fallback.
 */
function calculateWordCount(text, lang = 'en') {
    const clean = text.trim();
    if (!clean)
        return 0;
    try {
        if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
            // Intl.Segmenter word boundary counter
            const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
            let count = 0;
            for (const segment of segmenter.segment(clean)) {
                if (segment.isWordLike) {
                    count++;
                }
            }
            return count;
        }
    }
    catch {
        // fallback
    }
    // Regex whitespace fallback
    return clean.split(/\s+/).filter(Boolean).length;
}
/**
 * Extracts comprehensive SEO signals from raw HTML using Cheerio parser.
 */
function extractHtmlSignals(html, baseUrl) {
    // Fingerprints computed strictly on raw bytes
    const buffer = Buffer.from(html, 'utf-8');
    const md5 = crypto_1.default.createHash('md5').update(buffer).digest('hex');
    const sha256 = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
    const $ = cheerio.load(html);
    // 1. Title
    const rawTitle = $('title').first().text();
    const title = rawTitle ? rawTitle.replace(/\s+/g, ' ').trim() : null;
    // 2. Meta description
    const metaDesc = $('meta[name="description" i]').attr('content') ||
        $('meta[property="description" i]').attr('content') ||
        null;
    const metaDescription = metaDesc ? metaDesc.replace(/\s+/g, ' ').trim() : null;
    // 3. H1 headings
    const h1 = [];
    $('h1').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text) {
            h1.push(text);
        }
    });
    // 4. Canonical
    let canonical = null;
    const linkCanon = $('link[rel="canonical" i]').attr('href');
    if (linkCanon && linkCanon.trim()) {
        try {
            canonical = new URL(linkCanon.trim(), baseUrl).toString();
        }
        catch {
            canonical = linkCanon.trim();
        }
    }
    // 5. Meta robots (look for <meta name="robots"> and bot-specific tags)
    const metaRobotsTag = $('meta[name="robots" i]').attr('content') ||
        $('meta[name="googlebot" i]').attr('content') ||
        null;
    const metaRobots = metaRobotsTag ? metaRobotsTag.replace(/\s+/g, ' ').trim() : null;
    // 6. Content language
    const htmlLang = $('html').attr('lang') ||
        $('meta[http-equiv="content-language" i]').attr('content') ||
        null;
    const contentLanguage = htmlLang ? htmlLang.trim() : null;
    // 7. Structured data
    let hasStructuredData = false;
    $('script[type="application/ld+json"]').each((_, el) => {
        const content = $(el).html();
        if (content && content.trim()) {
            hasStructuredData = true;
        }
    });
    // 8. Images count
    const imageCount = $('img').length;
    // 9. Links count (internal vs external)
    let origin = '';
    try {
        origin = new URL(baseUrl).origin.toLowerCase();
    }
    catch {
        origin = '';
    }
    let linkCount = 0;
    let internalLinkCount = 0;
    let externalLinkCount = 0;
    $('a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
            return;
        }
        linkCount++;
        try {
            const resolved = new URL(href, baseUrl);
            if (origin && resolved.origin.toLowerCase() === origin) {
                internalLinkCount++;
            }
            else {
                externalLinkCount++;
            }
        }
        catch {
            // Relative or malformed
            internalLinkCount++;
        }
    });
    // 10. Meaningful body text word count
    // Clone body and remove non-content elements
    const bodyClone = $('body').clone();
    if (bodyClone.length > 0) {
        bodyClone.find('script, style, noscript, svg, template, iframe, object, embed').remove();
        const bodyText = bodyClone.text();
        const wordCount = calculateWordCount(bodyText, contentLanguage || 'en');
        return {
            title,
            metaDescription,
            h1,
            wordCount,
            imageCount,
            linkCount,
            internalLinkCount,
            externalLinkCount,
            metaRobots,
            canonical,
            contentLanguage,
            hasStructuredData,
            md5,
            sha256,
        };
    }
    // Fallback if no body tag
    const cloneAll = $('*').clone();
    cloneAll.find('script, style, noscript, svg, template, iframe, object, embed').remove();
    const allText = cloneAll.text();
    const wordCount = calculateWordCount(allText, contentLanguage || 'en');
    return {
        title,
        metaDescription,
        h1,
        wordCount,
        imageCount,
        linkCount,
        internalLinkCount,
        externalLinkCount,
        metaRobots,
        canonical,
        contentLanguage,
        hasStructuredData,
        md5,
        sha256,
    };
}
/**
 * Parses HTTP Link header for rel="canonical"
 */
function extractCanonicalFromHeaders(linkHeader, baseUrl) {
    if (!linkHeader)
        return null;
    const parts = linkHeader.split(',');
    for (const part of parts) {
        const match = part.match(/<([^>]+)>;\s*rel=["']?canonical["']?/i);
        if (match) {
            try {
                return new URL(match[1].trim(), baseUrl).toString();
            }
            catch {
                return match[1].trim();
            }
        }
    }
    return null;
}
/**
 * Parses Vary header tokens case-insensitively for "User-Agent"
 */
function checkVaryUserAgent(varyHeader) {
    if (!varyHeader)
        return 'Not available';
    const tokens = varyHeader.split(',').map((t) => t.trim().toLowerCase());
    return tokens.includes('user-agent') ? 'Present' : 'Absent';
}
