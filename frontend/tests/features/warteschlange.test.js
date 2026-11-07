import { describe, expect, it } from 'vitest';
import { berechneWarteschlangeLast } from '../../src/features/warteschlange/warteschlangeFeature.js';

describe('berechneWarteschlangeLast', () => {
  it('zeigt eine leere Kapazität ohne Überlauf grün und leer an', () => {
    expect(berechneWarteschlangeLast(0, 0)).toEqual({
      prozent: 0,
      balkenProzent: 0,
      farbe: '#2e7d32',
      morgen: false
    });
  });

  it('berechnet eine normale Auslastung als grünen Balken', () => {
    expect(berechneWarteschlangeLast(60, 120)).toEqual({
      prozent: 50,
      balkenProzent: 50,
      farbe: '#2e7d32',
      morgen: false
    });
  });

  it('markiert mehr als 80 Prozent ohne Überlauf orange', () => {
    expect(berechneWarteschlangeLast(100, 120)).toEqual({
      prozent: 83,
      balkenProzent: 83,
      farbe: '#f57c00',
      morgen: false
    });
  });

  it('begrenzt Überlauf optisch auf 100 Prozent und meldet morgen', () => {
    expect(berechneWarteschlangeLast(150, 120)).toEqual({
      prozent: 125,
      balkenProzent: 100,
      farbe: '#c62828',
      morgen: true
    });
  });

  it('behandelt Last ohne Kapazität als vollen roten Überlauf', () => {
    expect(berechneWarteschlangeLast(30, 0)).toEqual({
      prozent: 100,
      balkenProzent: 100,
      farbe: '#c62828',
      morgen: true
    });
  });
});
