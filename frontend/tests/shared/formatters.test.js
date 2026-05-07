import { describe, expect, it } from 'vitest';
import {
  berechneEndzeit,
  formatDateLocal,
  formatDateGerman,
  formatMinutesToHours,
  getKalenderwoche,
  getToday,
  naechsterArbeitstag
} from '../../src/shared/formatters.js';

describe('shared formatters', () => {
  it('formats a Date as local YYYY-MM-DD', () => {
    expect(formatDateLocal(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
  });

  it('formats falsy dates as an empty string', () => {
    expect(formatDateLocal(null)).toBe('');
  });

  it('formats minutes as compact German hour text', () => {
    expect(formatMinutesToHours(90)).toBe('1.5h');
    expect(formatMinutesToHours(120)).toBe('2h');
    expect(formatMinutesToHours(45)).toBe('45min');
  });

  it('uses an injected date for getToday', () => {
    expect(getToday(new Date(2026, 4, 5, 10, 0)).toISOString()).toContain('2026-05-05');
  });

  it('calculates ISO calendar weeks around year boundaries', () => {
    expect(getKalenderwoche(new Date(2026, 0, 1))).toBe(1);
    expect(getKalenderwoche(new Date(2026, 11, 31))).toBe(53);
  });

  it('calculates an end time from start time and duration', () => {
    expect(berechneEndzeit('08:15', 90)).toBe('09:45');
    expect(berechneEndzeit('16:45', 45)).toBe('17:30');
    expect(berechneEndzeit('', 60)).toBe('08:00');
  });

  it('formats German weekday dates from YYYY-MM-DD strings', () => {
    expect(formatDateGerman('2026-05-06')).toBe('Mi, 06.05.2026');
    expect(formatDateGerman(null)).toBe('--');
  });

  it('returns the next working day while skipping weekends', () => {
    expect(naechsterArbeitstag('2026-05-07')).toBe('2026-05-08');
    expect(naechsterArbeitstag('2026-05-08')).toBe('2026-05-11');
    expect(naechsterArbeitstag('2026-05-09')).toBe('2026-05-11');
  });
});
