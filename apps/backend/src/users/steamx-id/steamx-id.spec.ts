import { describe, expect, it } from 'vitest';
import {
  STEAMX_ID_FILLER_ALPHABET,
  STEAMX_ID_HONORIFICS,
  buildSteamxId,
  isValidSteamxId,
} from './steamx-id.js';

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

  // Every supported leading honorific is omitted only when followed by a real name.
  it.each(STEAMX_ID_HONORIFICS)('ignores the %s honorific', (honorific) => {
    expect(buildSteamxId('GVS', `${honorific}. Ada Lovelace`, randomFromZero)).toBe('GVS-ADAL000');
  });

  // Filler generation is restricted to the documented letters, including the final alphabet entry.
  it.each(STEAMX_ID_FILLER_ALPHABET.split('').map((letter, index) => [letter, index]))(
    'uses %s as a valid filler letter',
    (letter, index) => {
      let fillerDraws = 0;
      const id = buildSteamxId('GVS', 'Li', () => {
        fillerDraws += 1;
        return fillerDraws <= 2 ? index : 0;
      });

      expect(id).toBe(`GVS-Li${letter}${letter}000`.toUpperCase());
    },
  );

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

  // Deterministic edge inputs prove formatting remains valid for punctuation, accents, and Unicode.
  it.each(['Dr. María-José O’Neil', 'राहुल शर्मा', '李 雷', 'A'.repeat(200), '... --'])(
    'generates a valid ID for the input name %s',
    (name) => {
      const schoolCode = 'TSTABCDEFGHI';
      const candidate = buildSteamxId(schoolCode, name, randomFromZero);

      expect(isValidSteamxId(candidate, schoolCode)).toBe(true);
      expect(candidate).toMatch(/^[A-Z0-9][A-Z0-9._-]{2,31}$/);
    },
  );

  // The generated name segment remains within its four-to-eight-letter boundary.
  it.each([
    ['ABCD', true],
    ['ABCDEFGH', true],
    ['ABC', false],
    ['ABCDEFGHI', false],
  ])('validates name-part length at %s', (namePart, valid) => {
    expect(isValidSteamxId(`GVS-${namePart}000`, 'GVS')).toBe(valid);
  });
});
