/** Normalizes and validates user-supplied SteamX IDs. */
const STEAMX_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,31}$/;

/** Canonicalizes IDs before lookup so casing and surrounding spaces do not change identity. */
export function normalizeSteamxId(steamxId: string): string {
  return steamxId.trim().toUpperCase();
}

/** Checks the normalized platform-admin ID format. */
export function isValidSteamxId(steamxId: string): boolean {
  return STEAMX_ID_PATTERN.test(steamxId);
}
