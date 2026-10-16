import { describe, expect, it } from 'vitest';
import { buildSteamxId, isValidSteamxId } from './steamx-id.js';

describe('SteamX ID generation', () => {
  const randomFromZero = (_maxExclusive: number): number => 0;

  it.each([
    ['Puneet Kaur', 'PUNEETK000'],
    ['Vansh Gupta', 'VANSHG000'],
    ['Priya Sharma', 'PRIYAS000'],
    ['Puneet', 'PUNEET000'],
    ['Dr. Anita Rao', 'ANITAR000'],
    ['Om Shah', 'OMSA000'],
    ['K. Rajan', 'KRAA000'],
    ['राहुल', 'AAAA000'],
    ['José Pérez', 'JOSEP000'],
    ['ABCDEFGHIJKL Qrstuvwxyz', 'ABCDEFGQ000'],
    ['ABCDEFGHIJKLM', 'ABCDEFGH000'],
  ])('builds the expected ID for %s', (name, expected) => {
    expect(buildSteamxId('GVS', name, randomFromZero)).toBe(`GVS-${expected}`);
  });

  it('keeps name letters deterministic while randomizing only filler and digits', () => {
    const candidateOne = buildSteamxId('GVS', 'Puneet Kaur', () => 0);
    const candidateTwo = buildSteamxId('GVS', 'Puneet Kaur', () => 99);

    expect(candidateOne.slice(0, -2)).toBe(candidateTwo.slice(0, -2));
    expect(candidateOne.slice(-3)).toBe('000');
    expect(candidateTwo.slice(-3)).toBe('099');
  });

  it('keeps a 12-character school code within the database SteamX ID limit', () => {
    const candidate = buildSteamxId('ABCDEFGHIJKL', 'abcdefghijk Qrst', randomFromZero);

    expect(candidate.length).toBe(24);
    expect(candidate).toMatch(/^[A-Z0-9][A-Z0-9._-]{2,31}$/);
    expect(isValidSteamxId(candidate, 'ABCDEFGHIJKL')).toBe(true);
  });

  it.each([
    ['GVS-PUNEETK047', 'GVS'],
    ['AB-CD-ANITAR000', 'AB-CD'],
  ])('accepts valid SteamX ID %s', (id, schoolCode) => {
    expect(isValidSteamxId(id, schoolCode)).toBe(true);
  });

  it.each([
    ['OTHER-PUNEETK047', 'GVS'],
    ['GVS-ABC000', 'GVS'],
    ['GVS-ABCDEFGHI000', 'GVS'],
    ['GVS-puneetk047', 'GVS'],
    ['GVS-PUNEETK04', 'GVS'],
    ['GVS-PUNEETK0470', 'GVS'],
    ['GVS-PUNEETK47', 'GVS'],
  ])('rejects invalid SteamX ID %s', (id, schoolCode) => {
    expect(isValidSteamxId(id, schoolCode)).toBe(false);
  });

  it('generates IDs matching the application format and DB check for varied names', () => {
    const schoolCode = 'TSTABCDEFGHI';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -éराहुल';

    for (let index = 0; index < 1000; index += 1) {
      const name = Array.from({ length: 18 }, () =>
        characters.charAt(Math.floor(Math.random() * characters.length)),
      ).join('');
      const candidate = buildSteamxId(schoolCode, name, (maxExclusive) =>
        Math.floor(Math.random() * maxExclusive),
      );

      expect(isValidSteamxId(candidate, schoolCode)).toBe(true);
      expect(candidate).toMatch(/^[A-Z0-9][A-Z0-9._-]{2,31}$/);
    }
  });
});
