const STEAMX_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,31}$/;

export function normalizeSteamxId(steamxId: string): string {
  return steamxId.trim().toUpperCase();
}

export function isValidSteamxId(steamxId: string): boolean {
  return STEAMX_ID_PATTERN.test(steamxId);
}
