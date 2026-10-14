import React from 'react';

/**
 * Escapes regex special characters safely to prevent ReDoS and RegExp syntax errors.
 */
export function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Splits query into clean search tokens (min length 1, ignoring whitespace).
 */
export function extractQueryTokens(query: string): string[] {
  if (!query) return [];
  return query
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

/**
 * Safely bolds search-query terms within text without dangerouslySetInnerHTML.
 * Returns an array of ReactNodes (strings and <strong> elements) preserving original casing.
 */
export function highlightQueryMatches(text: string, query: string): React.ReactNode {
  if (!text) return text;
  
  const tokens = extractQueryTokens(query);
  if (tokens.length === 0) {
    return text;
  }

  // Sort longest tokens first so longer phrases/words match first
  const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
  const pattern = sortedTokens.map(escapeRegex).join('|');
  
  if (!pattern) return text;

  try {
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      // Check if this part matches any query token case-insensitively
      const isMatch = tokens.some(token => token.toLowerCase() === part.toLowerCase());
      if (isMatch) {
        return (
          <strong key={index} className="font-bold text-inherit">
            {part}
          </strong>
        );
      }
      return part;
    });
  } catch {
    // Graceful fallback if regex creation fails
    return text;
  }
}
