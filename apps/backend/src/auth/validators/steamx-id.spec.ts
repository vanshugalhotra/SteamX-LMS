import { describe, expect, it } from 'vitest';
import { isValidSteamxId, normalizeSteamxId } from './steamx-id.js';

describe('SteamX ID validation', () => {
  it.each(['ABC', 'A01', 'AB.C_1-X', 'A'.repeat(32)])('accepts %s', (steamxId) => {
    expect(isValidSteamxId(steamxId)).toBe(true);
  });

  it.each(['abC', ' AB1', 'AB1 ', 'AB', 'A'.repeat(33), 'AB$1'])('rejects %s', (steamxId) => {
    expect(isValidSteamxId(steamxId)).toBe(false);
  });

  it('normalizes user input before validation', () => {
    const steamxId = normalizeSteamxId('  ab.123  ');

    expect(steamxId).toBe('AB.123');
    expect(isValidSteamxId(steamxId)).toBe(true);
  });
});
