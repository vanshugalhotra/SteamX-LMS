import { describe, expect, it } from 'vitest';
import { buildSteamxId, isValidSteamxId } from './steamx-id.js';

describe('SteamX ID generation', () => {
  const randomFromZero = (_maxExclusive: number): number => 0;

  it.each([
    ['Puneet Kaur', 'PUNEETK00'],
    ['Vansh Gupta', 'VANSHG00'],
    ['Priya Sharma', 'PRIYAS00'],
    ['Puneet', 'PUNEET00'],
    ['Dr. Anita Rao', 'ANITAR00'],
    ['Om Shah', 'OMSA00'],
    ['K. Rajan', 'KRAA00'],
    ['राहुल', 'AAAA00'],
    ['José Pérez', 'JOSEP00'],
    ['ABCDEFGHIJKL Qrstuvwxyz', 'ABCDEFGQ00'],
    ['ABCDEFGHIJKLM', 'ABCDEFGH00'],
  ])('builds the expected ID for %s', (name, expected) => {
    expect(buildSteamxId('GVS', name, randomFromZero)).toBe(`GVS-${expected}`);
  });

  it('keeps name letters deterministic while randomizing only filler and digits', () => {
    const candidateOne = buildSteamxId('GVS', 'Puneet Kaur', () => 0);
    const candidateTwo = buildSteamxId('GVS', 'Puneet Kaur', () => 99);

    expect(candidateOne.slice(0, -2)).toBe(candidateTwo.slice(0, -2));
    expect(candidateOne.slice(-2)).toBe('00');
    expect(candidateTwo.slice(-2)).toBe('99');
  });

  it('keeps a 12-character school code within the database SteamX ID limit', () => {
    const candidate = buildSteamxId('ABCDEFGHIJKL', 'abcdefghijk Qrst', randomFromZero);

    expect(candidate.length).toBe(23);
    expect(candidate).toMatch(/^[A-Z0-9][A-Z0-9._-]{2,31}$/);
    expect(isValidSteamxId(candidate, 'ABCDEFGHIJKL')).toBe(true);
  });

  it.each([
    ['GVS-PUNEETK47', 'GVS'],
    ['AB-CD-ANITAR00', 'AB-CD'],
  ])('accepts valid SteamX ID %s', (id, schoolCode) => {
    expect(isValidSteamxId(id, schoolCode)).toBe(true);
  });

  it.each([
    ['OTHER-PUNEETK47', 'GVS'],
    ['GVS-ABC00', 'GVS'],
    ['GVS-ABCDEFGHI00', 'GVS'],
    ['GVS-puneetk47', 'GVS'],
    ['GVS-PUNEETK4', 'GVS'],
    ['GVS-PUNEETK470', 'GVS'],
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
