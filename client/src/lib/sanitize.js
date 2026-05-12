import DOMPurify from 'dompurify';

// Strip all HTML tags — safe for rendering plain user text
export function sanitizeText(dirty) {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// Validate that a URL uses http: or https: before using it in href/src.
// Returns empty string for javascript:, data:, or any other dangerous protocol.
export function safeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return url;
  } catch {
    return '';
  }
}