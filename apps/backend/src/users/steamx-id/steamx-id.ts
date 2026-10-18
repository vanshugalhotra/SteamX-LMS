/** Pure formatting and validation rules for generated school-prefixed login IDs. */
export const STEAMX_ID_HONORIFICS = [
  'DR',
  'MR',
  'MRS',
  'MS',
  'MISS',
  'PROF',
  'SHRI',
  'SMT',
] as const;
export const STEAMX_ID_FILLER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWYZ';
export const STEAMX_ID_MIN_NAME_LENGTH = 4;
export const STEAMX_ID_MAX_NAME_LENGTH = 8;

/**
 * Builds IDs as SCHOOLCODE-NAMEPARTNNN, with no separator between the name part and digits.
 * For example, "Dr Ada Lovelace" at school "NORTH" becomes NORTH-ADAL042:
 * the title is skipped, then up to 7 first-name letters plus the last-name initial are used.
 * A single name uses up to 8 letters; short name parts get random letters to reach 4.
 * The final three digits are random too, helping avoid collisions.
 */
export function buildSteamxId(
  schoolCode: string,
  name: string,
  randomInt: (maxExclusive: number) => number,
): string {
  const tokens = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const leadingToken = tokens[0];
  // Drop a leading title only when a name token follows it.
  if (
    tokens.length > 1 &&
    leadingToken &&
    (STEAMX_ID_HONORIFICS as readonly string[]).includes(leadingToken)
  ) {
    tokens.shift();
  }

  const firstToken = tokens[0];
  const lastToken = tokens.at(-1);
  // Multi-word names use up to seven letters from the first word plus the last word's initial.
  const namePart =
    tokens.length > 1 && firstToken && lastToken
      ? `${firstToken.slice(0, STEAMX_ID_MAX_NAME_LENGTH - 1)}${lastToken[0]}`
      : (firstToken ?? '').slice(0, STEAMX_ID_MAX_NAME_LENGTH);
  let paddedNamePart = namePart;

  // Example: "Li" becomes "LIXY" if the random filler letters are X and Y.
  while (paddedNamePart.length < STEAMX_ID_MIN_NAME_LENGTH) {
    paddedNamePart += STEAMX_ID_FILLER_ALPHABET.charAt(randomInt(STEAMX_ID_FILLER_ALPHABET.length));
  }

  const digits = randomInt(1000).toString().padStart(3, '0');
  return `${schoolCode}-${paddedNamePart}${digits}`;
}

/** Validates the generated/manual ID format against the selected school's code. */
export function isValidSteamxId(id: string, schoolCode: string): boolean {
  const escapedSchoolCode = schoolCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedSchoolCode}-[A-Z]{4,8}[0-9]{3}$`).test(id);
}
