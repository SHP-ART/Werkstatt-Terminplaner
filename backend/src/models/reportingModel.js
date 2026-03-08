/**
 * Reporting Model
 * KPI-Aggregationen für das Dashboard und Berichte
 */

const { allAsync, getAsync } = require('../utils/dbHelper');

/**
 * Allgemeine KPIs für einen Zeitraum
 */
async function getKPIs(vonDatum, bisDatum) {
  const [
    durchlaufzeit,
    genauigkeit,
    abgeschlossene,
    nacharbeit,
    storniert,
    schwebend,
    teileOffen,
    teileDringend,
    ueberfaellig
  ] = await Promise.all([
    // Ø Durchlaufzeit abgeschlossener Termine
    getAsync(`
      SELECT AVG(tatsaechliche_zeit) as wert
      FROM termine
      WHERE status = 'abgeschlossen'
        AND datum BETWEEN ? AND ?
        AND geloescht_am IS NULL
        AND tatsaechliche_zeit > 0
    `, [vonDatum, bisDatum]),

    // Schätzgenauigkeit: tatsächlich / geschätzt
    getAsync(`
      SELECT AVG(CAST(tatsaechliche_zeit AS FLOAT) / NULLIF(geschaetzte_zeit, 0)) as wert
      FROM termine
      WHERE status = 'abgeschlossen'
        AND tatsaechliche_zeit > 0
        AND geschaetzte_zeit > 0
        AND datum BETWEEN ? AND ?
        AND geloescht_am IS NULL
    `, [vonDatum, bisDatum]),

    // Gesamtzahl abgeschlossener Termine
    getAsync(`
      SELECT COUNT(*) as wert
      FROM termine
      WHERE status = 'abgeschlossen'
        AND datum BETWEEN ? AND ?
        AND geloescht_am IS NULL
    `, [vonDatum, bisDatum]),

    // Nacharbeiten (Erweiterungen)
    getAsync(`
      SELECT COUNT(*) as wert
      FROM termine
      WHERE erweiterung_von_id IS NOT NULL
        AND datum BETWEEN ? AND ?
        AND geloescht_am IS NULL
    `, [vonDatum, bisDatum]),

    // Stornierte Termine
    getAsync(`
      SELECT COUNT(*) as wert
      FROM termine
      WHERE status = 'storniert'
        AND datum BETWEEN ? AND ?
        AND geloescht_am IS NULL
    `, [vonDatum, bisDatum]),

    // Schwebende Termine (Anzahl + Wartezeit)
    getAsync(`
      SELECT
        COUNT(*) as anzahl,
        AVG(julianday('now') - julianday(erstellt_am)) as avg_wartezeit_tage
      FROM termine
      WHERE ist_schwebend = 1
        AND geloescht_am IS NULL
        AND status != 'storniert'
    `, []),

    // Teile offen (bestellt / ausstehend)
    getAsync(`
      SELECT COUNT(*) as wert
      FROM teile_bestellungen
      WHERE status IN ('bestellt', 'ausstehend')
    `, []),

    // Teile dringend (Teile mit Status 'bestellt' die älter als 7 Tage sind)
    getAsync(`
      SELECT COUNT(*) as wert
      FROM teile_bestellungen
      WHERE status IN ('bestellt', 'ausstehend')
        AND bestellt_am < date('now', '-7 days')
    `, []),

    // Überfällige Termine (Datum vergangen, noch nicht abgeschlossen/storniert)
    getAsync(`
      SELECT COUNT(*) as wert
      FROM termine
      WHERE datum < date('now')
        AND status NOT IN ('abgeschlossen', 'storniert')
        AND ist_schwebend = 0
        AND geloescht_am IS NULL
    `, [])
  ]);

  const gesamt = (abgeschlossene?.wert || 0) + (storniert?.wert || 0);

  return {
    avg_durchlaufzeit_minuten: Math.round(durchlaufzeit?.wert || 0),
    schaetzgenauigkeit: genauigkeit?.wert ? Math.min(genauigkeit.wert, 2) : null, // Max 200%
    abgeschlossene_termine: abgeschlossene?.wert || 0,
    nacharbeitsquote: gesamt > 0 ? (nacharbeit?.wert || 0) / gesamt : 0,
    stornoquote: gesamt > 0 ? (storniert?.wert || 0) / gesamt : 0,
    schwebende_anzahl: schwebend?.anzahl || 0,
    avg_wartezeit_tage: Math.round((schwebend?.avg_wartezeit_tage || 0) * 10) / 10,
    teile_offen: teileOffen?.wert || 0,
    teile_dringend: teileDringend?.wert || 0,
    ueberfaellige_termine: ueberfaellig?.wert || 0
  };
}

/**
 * Mitarbeiter-Produktivität im Zeitraum
 */
async function getMitarbeiterProduktivitaet(vonDatum, bisDatum) {
  return await allAsync(`
    SELECT
      t.mitarbeiter_id,
      m.name as mitarbeiter_name,
      COUNT(*) as termine_count,
      SUM(t.tatsaechliche_zeit) as gesamt_minuten,
      AVG(t.tatsaechliche_zeit) as avg_minuten,
      AVG(CAST(t.tatsaechliche_zeit AS FLOAT) / NULLIF(t.geschaetzte_zeit, 0)) as schaetzgenauigkeit
    FROM termine t
    LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
    WHERE t.status = 'abgeschlossen'
      AND t.datum BETWEEN ? AND ?
      AND t.geloescht_am IS NULL
      AND t.mitarbeiter_id IS NOT NULL
    GROUP BY t.mitarbeiter_id
    ORDER BY gesamt_minuten DESC
  `, [vonDatum, bisDatum]);
}

/**
 * Trend-Daten für einen KPI (Zeitreihe)
 */
async function getTrend(kpi, intervall, monate) {
  const endDatum = new Date().toISOString().split('T')[0];
  const startDatum = new Date();
  startDatum.setMonth(startDatum.getMonth() - (parseInt(monate) || 3));
  const startStr = startDatum.toISOString().split('T')[0];

  let datumFormat;
  if (intervall === 'woche') {
    datumFormat = "strftime('%Y-W%W', datum)";
  } else {
    datumFormat = "strftime('%Y-%m', datum)";
  }

  let selectExpr;
  switch (kpi) {
    case 'durchlaufzeit':
      selectExpr = 'AVG(tatsaechliche_zeit)';
      break;
    case 'schaetzgenauigkeit':
      selectExpr = 'AVG(CAST(tatsaechliche_zeit AS FLOAT) / NULLIF(geschaetzte_zeit, 0))';
      break;
    case 'abgeschlossen':
      selectExpr = 'COUNT(*)';
      break;
    default:
      selectExpr = 'COUNT(*)';
  }

  return await allAsync(`
    SELECT
      ${datumFormat} as periode,
      ${selectExpr} as wert,
      COUNT(*) as anzahl
    FROM termine
    WHERE status = 'abgeschlossen'
      AND datum BETWEEN ? AND ?
      AND geloescht_am IS NULL
      AND tatsaechliche_zeit > 0
    GROUP BY periode
    ORDER BY periode ASC
  `, [startStr, endDatum]);
}

module.exports = {
  getKPIs,
  getMitarbeiterProduktivitaet,
  getTrend
};
