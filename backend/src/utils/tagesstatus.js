/**
 * Status-Berechnung für Zeitkonto-Ampel (siehe Spec 2026-04-24, Section 3).
 * Reine Funktion — keine DB-Zugriffe, keine Seiteneffekte.
 */

/**
 * @param {object} input
 * @param {number} input.sollMin - Soll-Minuten laut Dienstplan (0 = kein Arbeitstag)
 * @param {string|null} input.abwTyp - 'urlaub' | 'krank' | 'lehrgang' | andere | null
 * @param {boolean} input.hatKommen
 * @param {boolean} input.hatGehen
 * @param {boolean} input.hatMittag
 * @returns {{status: string, fehlt: {kommen: boolean, gehen: boolean, mittag: boolean}}}
 */
function berechneTagesStatus({ sollMin, abwTyp, hatKommen, hatGehen, hatMittag }) {
  const istAbwesenheit = abwTyp === 'urlaub' || abwTyp === 'krank' || abwTyp === 'lehrgang';

  // Regel 2: Abwesenheit gewinnt immer
  if (istAbwesenheit) {
    return { status: 'blau', fehlt: { kommen: false, gehen: false, mittag: false } };
  }

  // Regel 1: kein Soll-Tag UND keine Abwesenheit
  if (sollMin <= 0) {
    return { status: 'kein_punkt', fehlt: { kommen: false, gehen: false, mittag: false } };
  }

  // Ab hier: Soll-Tag ohne Abwesenheit

  // Regel 3: nichts gestempelt
  if (!hatKommen && !hatGehen && !hatMittag) {
    return { status: 'rot', fehlt: { kommen: true, gehen: true, mittag: true } };
  }

  // Regel 4: alles da
  if (hatKommen && hatGehen && hatMittag) {
    return { status: 'gruen', fehlt: { kommen: false, gehen: false, mittag: false } };
  }

  // Regel 5: Kommen fehlt (Gehen vorhanden)
  if (!hatKommen && hatGehen) {
    return { status: 'orange', fehlt: { kommen: true, gehen: false, mittag: !hatMittag } };
  }

  // Regel 6: Gehen fehlt (Kommen vorhanden)
  if (hatKommen && !hatGehen) {
    return { status: 'orange', fehlt: { kommen: false, gehen: true, mittag: !hatMittag } };
  }

  // Regel 7: Kommen + Gehen vorhanden, nur Mittag fehlt
  return { status: 'gelb', fehlt: { kommen: false, gehen: false, mittag: true } };
}

module.exports = { berechneTagesStatus };
