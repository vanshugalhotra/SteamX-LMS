// Keep in sync with the link protocols in extensions.ts / tiptap-whitelist.ts
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ALLOWED_PROTOCOLS.includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
