/**
 * HTML-entity escape for inserting untrusted strings into HTML
 * templates. Both `consent.ts` (OAuth approve form) and `login-form.ts`
 * (auth/login form) use this for any value that lands inside an
 * element's text content or an attribute value.
 *
 * Escapes the OWASP cheatsheet five: `&`, `<`, `>`, `"`, `'`. Single
 * quote is encoded as the numeric `&#39;` for compatibility with HTML
 * 4.01 and older parsers.
 */
export function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
