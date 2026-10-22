/** Removes header control characters and path separators from a stored filename. */
function cleanFilename(filename: string): string {
  let cleaned = '';
  for (const character of filename) {
    const codePoint = character.codePointAt(0) ?? 0;
    // Remove header controls and path separators before either filename form is built.
    if (codePoint > 0x1f && codePoint !== 0x7f && character !== '/' && character !== '\\') {
      cleaned += character;
    }
  }
  return cleaned;
}

/**
 * Builds a safe inline Content-Disposition header for browser downloads.
 * The ASCII filename supports older clients; filename* preserves Unicode names.
 */
export function buildContentDisposition(filename?: string): string {
  if (filename === undefined) {
    return 'inline';
  }

  const cleaned = Array.from(cleanFilename(filename)).slice(0, 150).join('');
  if (cleaned.length === 0) {
    return `inline; filename="file"; filename*=UTF-8''file`;
  }

  // The quoted fallback is printable ASCII only and bounded for broad client compatibility.
  const asciiFallback =
    cleaned
      .trim()
      .replace(/[^\x20-\x7e]|["\\ ;%]/g, '_')
      .trim()
      .slice(0, 150)
      .trim() || 'file';
  // encodeURIComponent leaves these RFC 5987 characters unescaped, so encode them explicitly.
  const encodedFilename = encodeURIComponent(cleaned).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}
