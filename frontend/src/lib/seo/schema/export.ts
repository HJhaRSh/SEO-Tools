import { SupportedSchemaType } from './types';
import { buildSchemaObject } from './builders';
import { escapeJsonForHtmlScript } from './fieldUtils';

/**
 * Generate formatted JSON-LD or script-wrapped HTML string from current schema type and form state
 */
export function generateSchemaOutput(
  type: SupportedSchemaType,
  state: Record<string, unknown>,
  format: 'script' | 'json' = 'script'
): { code: string; rawObject: Record<string, unknown> } {
  const schemaObj = buildSchemaObject(type, state);
  const jsonString = JSON.stringify(schemaObj, null, 2);

  if (format === 'script') {
    const escapedJson = escapeJsonForHtmlScript(jsonString);
    const scriptCode = `<script type="application/ld+json">\n${escapedJson}\n</script>`;
    return {
      code: scriptCode,
      rawObject: schemaObj,
    };
  }

  return {
    code: jsonString,
    rawObject: schemaObj,
  };
}

/**
 * Download schema string to client browser as a JSON or HTML file
 */
export function triggerFileDownload(content: string, filename: string, mimeType: string = 'application/json') {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Copy text string safely using Navigator Clipboard API with textarea fallback
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to document.execCommand
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
