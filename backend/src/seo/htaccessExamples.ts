import { HtaccessExampleTemplate } from './htaccessTypes';

export const HTACCESS_EXAMPLES: HtaccessExampleTemplate[] = [
  {
    id: 'http-to-https',
    title: 'HTTP to HTTPS Redirection',
    category: 'Security & Canonicalization',
    description: 'Enforces SSL across the entire site by redirecting non-secure HTTP traffic to HTTPS with a permanent 301 redirect.',
    sampleUrl: 'http://example.com/about-us',
    rules: `RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://example.com/$1 [R=301,L]`
  },
  {
    id: 'non-www-to-www',
    title: 'Non-www to www Redirection',
    category: 'Canonicalization',
    description: 'Directs root domain traffic to the canonical www subdomain to prevent duplicate content issues.',
    sampleUrl: 'https://example.com/services',
    rules: `RewriteEngine On
RewriteCond %{HTTP_HOST} ^example\\.com$ [NC]
RewriteRule ^(.*)$ https://www.example.com/$1 [R=301,L]`
  },
  {
    id: 'www-to-non-www',
    title: 'www to Non-www Redirection',
    category: 'Canonicalization',
    description: 'Strips the www prefix and redirects to the naked domain.',
    sampleUrl: 'https://www.example.com/pricing',
    rules: `RewriteEngine On
RewriteCond %{HTTP_HOST} ^www\\.example\\.com$ [NC]
RewriteRule ^(.*)$ https://example.com/$1 [R=301,L]`
  },
  {
    id: 'single-page-301',
    title: 'Single Page 301 Migration',
    category: 'Page Migrations',
    description: 'Redirects an obsolete URL path to a newly published replacement page.',
    sampleUrl: 'https://example.com/old-page',
    rules: `RewriteEngine On
RewriteRule ^old-page$ /new-page [R=301,L]`
  },
  {
    id: 'directory-migration',
    title: 'Directory Migration (/blog to /articles)',
    category: 'Architecture & Migration',
    description: 'Restructures a whole folder path while preserving all child slugs and paths.',
    sampleUrl: 'https://example.com/blog/seo-tips-2026',
    rules: `RewriteEngine On
RewriteRule ^blog/(.*)$ /articles/$1 [R=301,L]`
  },
  {
    id: 'query-param-redirect',
    title: 'Query String Parameter to Clean URL',
    category: 'Clean URLs',
    description: 'Matches a specific query parameter and rewrites to a user-friendly RESTful structure, discarding the old query string.',
    sampleUrl: 'https://example.com/product.php?id=123',
    rules: `RewriteEngine On
RewriteCond %{QUERY_STRING} ^id=([0-9]+)$
RewriteRule ^product\\.php$ /products/%1? [R=301,L]`
  },
  {
    id: 'trailing-slash',
    title: 'Enforce Trailing Slash',
    category: 'Canonicalization',
    description: 'Appends a trailing slash to directory-like paths while avoiding existing files.',
    sampleUrl: 'https://example.com/category/digital-marketing',
    rules: `RewriteEngine On
RewriteCond %{REQUEST_URI} !(^.*\\.[a-zA-Z0-9]+$)
RewriteRule ^(.+[^/])$ /$1/ [R=301,L]`
  },
  {
    id: 'mod-alias-redirectmatch',
    title: 'Mod_alias RedirectMatch Regex',
    category: 'Mod_Alias',
    description: 'Uses Apache mod_alias RedirectMatch directive for lightweight regex redirection without mod_rewrite.',
    sampleUrl: 'https://example.com/legacy/docs/overview',
    rules: `RedirectMatch 301 ^/legacy/docs/(.*)$ /documentation/$1`
  }
];
