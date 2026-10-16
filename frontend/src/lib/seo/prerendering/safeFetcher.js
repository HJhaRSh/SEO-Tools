"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUrl = validateUrl;
exports.validateAndResolveHost = validateAndResolveHost;
exports.fetchWithUserAgent = fetchWithUserAgent;
const dns_1 = __importDefault(require("dns"));
const util_1 = require("util");
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const ssrf_js_1 = require("../ssrf.js");
const dnsLookup = (0, util_1.promisify)(dns_1.default.lookup);
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB limit per user agent
const ALLOWED_PORTS = new Set(['80', '443', '']);
/**
 * Validates a target URL against SSRF rules.
 */
function validateUrl(rawUrl, allowLocalhostForTesting = false) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    }
    catch {
        throw new Error(`Invalid URL format: "${rawUrl}"`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Unsupported URL protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
    }
    const isLocalhostTest = allowLocalhostForTesting && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (!isLocalhostTest && !ALLOWED_PORTS.has(parsed.port)) {
        throw new Error(`Port "${parsed.port}" is not allowed for security reasons.`);
    }
    if (parsed.username || parsed.password) {
        throw new Error('User credentials in URLs are not permitted.');
    }
    return parsed;
}
/**
 * Resolves a hostname safely and ensures resolved IP is not private/reserved.
 */
async function validateAndResolveHost(hostname, allowLocalhostForTesting = false) {
    if (allowLocalhostForTesting && (hostname === 'localhost' || hostname === '127.0.0.1')) {
        return '127.0.0.1';
    }
    if ((0, ssrf_js_1.isBlockedHostname)(hostname)) {
        throw new Error(`Access to blocked or internal hostname is forbidden: ${hostname}`);
    }
    try {
        const lookupResult = await dnsLookup(hostname, { all: true });
        if (!lookupResult || lookupResult.length === 0) {
            throw new Error(`DNS resolution failed for hostname: ${hostname}`);
        }
        for (const record of lookupResult) {
            if ((0, ssrf_js_1.isPrivateOrReservedIP)(record.address)) {
                throw new Error(`Hostname ${hostname} resolves to blocked/private IP: ${record.address}`);
            }
        }
        return lookupResult[0].address;
    }
    catch (err) {
        if (err.message && err.message.includes('resolves to blocked')) {
            throw err;
        }
        throw new Error(`DNS lookup error for ${hostname}: ${err.message || err}`);
    }
}
/**
 * Executes a secure, connection-level pinned HTTP GET request.
 * Pins DNS to the verified public IP inside the lookup socket hook to eliminate DNS rebinding TOCTOU.
 * Rejects oversized responses exceeding maxBytes with an explicit error.
 */
async function fetchWithUserAgent(rawUrl, options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const customUserAgent = options.userAgent;
    const allowLocalhostForTesting = options.allowLocalhostForTesting ?? false;
    const redirectHistory = [];
    let currentUrl = rawUrl;
    const startTime = Date.now();
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const parsedUrl = validateUrl(currentUrl, allowLocalhostForTesting);
        const resolvedIp = await validateAndResolveHost(parsedUrl.hostname, allowLocalhostForTesting);
        const client = parsedUrl.protocol === 'https:' ? https_1.default : http_1.default;
        const requestOptions = {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            // Pin connection directly to validated IP (mitigates DNS rebinding)
            lookup: (_hostname, optionsOrCallback, maybeCallback) => {
                const cb = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
                const opts = typeof optionsOrCallback === 'object' ? optionsOrCallback : {};
                const family = resolvedIp.includes(':') ? 6 : 4;
                if (opts && opts.all) {
                    cb(null, [{ address: resolvedIp, family }]);
                }
                else {
                    cb(null, resolvedIp, family);
                }
            },
            headers: {
                'Host': parsedUrl.hostname + (parsedUrl.port ? `:${parsedUrl.port}` : ''),
                'User-Agent': customUserAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'identity', // Avoid compressed streams that can hide zip bombs
                'Cache-Control': 'no-cache',
                'Connection': 'close',
            },
            timeout: timeoutMs,
        };
        const res = await new Promise((resolve, reject) => {
            let isTimedOut = false;
            const req = client.request(requestOptions, (response) => {
                const statusCode = response.statusCode || 0;
                const statusText = response.statusMessage || '';
                const headers = {};
                for (const [key, val] of Object.entries(response.headers)) {
                    if (val) {
                        headers[key.toLowerCase()] = Array.isArray(val) ? val.join(', ') : val;
                    }
                }
                // Check for redirects
                if ([301, 302, 303, 307, 308].includes(statusCode) && headers['location']) {
                    response.resume(); // discard body
                    return resolve({
                        statusCode,
                        statusText,
                        headers,
                        body: '',
                        redirectLocation: headers['location'],
                    });
                }
                const chunks = [];
                let totalBytes = 0;
                response.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    if (totalBytes > maxBytes) {
                        response.destroy();
                        return reject(new Error(`RESPONSE_TOO_LARGE: Response body exceeded maximum allowed limit of ${(maxBytes / (1024 * 1024)).toFixed(1)}MB.`));
                    }
                    chunks.push(chunk);
                });
                response.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf-8');
                    resolve({
                        statusCode,
                        statusText,
                        headers,
                        body,
                    });
                });
                response.on('error', (err) => {
                    reject(err);
                });
            });
            req.on('timeout', () => {
                isTimedOut = true;
                req.destroy();
                reject(new Error(`Request timed out after ${timeoutMs}ms for ${currentUrl}`));
            });
            req.on('error', (err) => {
                if (!isTimedOut) {
                    reject(err);
                }
            });
            req.end();
        });
        if (res.redirectLocation) {
            if (hop === maxRedirects) {
                throw new Error(`Exceeded maximum redirect limit of ${maxRedirects} hops.`);
            }
            // Check redirect loop
            const nextUrl = new URL(res.redirectLocation, currentUrl).toString();
            if (redirectHistory.some((h) => h.to === nextUrl) || nextUrl === currentUrl) {
                throw new Error('Redirect loop detected.');
            }
            redirectHistory.push({
                from: currentUrl,
                to: nextUrl,
                statusCode: res.statusCode,
            });
            currentUrl = nextUrl;
            continue;
        }
        const durationMs = Date.now() - startTime;
        return {
            requestedUrl: rawUrl,
            finalUrl: currentUrl,
            statusCode: res.statusCode,
            statusText: res.statusText,
            headers: res.headers,
            body: res.body,
            redirectHistory,
            durationMs,
            contentType: res.headers['content-type'] || 'text/plain',
            timestamp: new Date().toISOString(),
            isTruncated: false,
        };
    }
    throw new Error(`Failed to fetch ${rawUrl}: Redirect loop or exceeded limit.`);
}
