import { describe, expect, it } from 'vitest';
import { normalizeKennzeichen, parseKennzeichen } from '../../src/shared/licensePlate.js';

describe('license plate helpers', () => {
  it('normalizes license plates by uppercasing and removing separators', () => {
    expect(normalizeKennzeichen('hy-d 107')).toBe('HYD107');
    expect(normalizeKennzeichen('  ab c-42 ')).toBe('ABC42');
    expect(normalizeKennzeichen(null)).toBe('');
  });

  it('parses license plates with separators', () => {
    expect(parseKennzeichen('HY-D 107')).toEqual({ bezirk: 'HY', buchstaben: 'D', nummer: '107' });
    expect(parseKennzeichen('HY D107')).toEqual({ bezirk: 'HY', buchstaben: 'D', nummer: '107' });
  });

  it('parses compact license plates with fallback behavior', () => {
    expect(parseKennzeichen('HYD107')).toEqual({ bezirk: 'H', buchstaben: 'YD', nummer: '107' });
    expect(parseKennzeichen('')).toEqual({ bezirk: '', buchstaben: '', nummer: '' });
  });
});
