/**
 * Zeitkonto Controller
 *
 * GET /api/zeitkonto?von=YYYY-MM-DD&bis=YYYY-MM-DD
 *
 * Berechnet für jeden aktiven Mitarbeiter/Lehrling:
 *  - Soll-Zeit je Tag (aus arbeitszeiten_plan)
 *  - Ist-Zeit je Tag (Tagesstempel minus Unterbrechungen/Pausen)
 *  - Abwesenheiten (urlaub/krank = Soll gilt als Ist)
 *  - Saldo = Ist - Soll
 */

const { getAsync, allAsync } = require('../utils/dbHelper');
const ArbeitszeitenPlanModel = require('../models/arbeitszeitenPlanModel');
const { asyncHandler } = require('../middleware/errorHandler');

// ISO-Timestamp oder HH:MM → Minuten seit Mitternacht
function zeitZuMinuten(s) {
  if (!s) return 0;
  let hh, mm;
  if (s.length > 5) {
    // ISO-Timestamp → lokale Zeit
    const d = new Date(s);
    hh = d.getHours();
    mm = d.getMinutes();
  } else {
    [hh, mm] = s.substring(0, 5).split(':').map(Number);
  }
  return (hh || 0) * 60 + (mm || 0);
}

// Alle Tage zwischen von und bis (inkl.) als YYYY-MM-DD-Array
function datumsBereich(von, bis) {
  const tage = [];
  const cur = new Date(von);
  const end = new Date(bis);
  while (cur <= end) {
    tage.push(cur.toISOString().substring(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return tage;
}

class ZeitkontoController {
  static get = asyncHandler(async (req, res) => {
    const { von, bis } = req.query;
    if (!von || !bis) {
      return res.status(400).json({ error: 'Parameter von und bis sind erforderlich (YYYY-MM-DD)' });
    }

    const tage = datumsBereich(von, bis);
    if (tage.length > 366) {
      return res.status(400).json({ error: 'Maximal 366 Tage pro Abfrage erlaubt' });
    }

    // Alle aktiven Mitarbeiter + Lehrlinge
    const mitarbeiter = await allAsync(
      `SELECT id, name, 'mitarbeiter' AS typ FROM mitarbeiter WHERE aktiv = 1`,
      []
    );
    const lehrlinge = await allAsync(
      `SELECT id, name, 'lehrling' AS typ FROM lehrlinge WHERE aktiv = 1`,
      []
    );
    const personen = [...mitarbeiter, ...lehrlinge];

    // Tagesstempel für den gesamten Zeitraum laden (einmalig)
    const stempelRows = await allAsync(
      `SELECT ts.mitarbeiter_id, ts.lehrling_id, ts.datum, ts.kommen_zeit, ts.gehen_zeit
       FROM tagesstempel ts
       WHERE ts.datum >= ? AND ts.datum <= ?`,
      [von, bis]
    );
    const stempelMap = {};
    stempelRows.forEach(s => {
      const key = (s.mitarbeiter_id ? `m_${s.mitarbeiter_id}` : `l_${s.lehrling_id}`) + '_' + s.datum;
      stempelMap[key] = s;
    });

    // Unterbrechungen für den Zeitraum
    const ubRows = await allAsync(
      `SELECT mitarbeiter_id, lehrling_id, datum, start_zeit, ende_zeit
       FROM arbeitsunterbrechungen
       WHERE datum >= ? AND datum <= ? AND ende_zeit IS NOT NULL`,
      [von, bis]
    );
    const ubMap = {};
    ubRows.forEach(u => {
      const key = (u.mitarbeiter_id ? `m_${u.mitarbeiter_id}` : `l_${u.lehrling_id}`) + '_' + u.datum;
      if (!ubMap[key]) ubMap[key] = [];
      ubMap[key].push(u);
    });

    // Mittagspausen für den Zeitraum
    const pauseRows = await allAsync(
      `SELECT mitarbeiter_id, lehrling_id, datum, pause_start_zeit, pause_ende_zeit
       FROM pause_tracking
       WHERE datum >= ? AND datum <= ? AND abgeschlossen = 1 AND pause_ende_zeit IS NOT NULL`,
      [von, bis]
    );
    const pauseMap = {};
    pauseRows.forEach(p => {
      const key = (p.mitarbeiter_id ? `m_${p.mitarbeiter_id}` : `l_${p.lehrling_id}`) + '_' + p.datum;
      if (!pauseMap[key]) pauseMap[key] = [];
      pauseMap[key].push(p);
    });

    // Abwesenheiten für den Zeitraum (personen-bezogen)
    const abwRows = await allAsync(
      `SELECT mitarbeiter_id, lehrling_id, typ, datum_von, datum_bis
       FROM abwesenheiten
       WHERE datum_von <= ? AND datum_bis >= ?`,
      [bis, von]
    );

    // Ergebnis aufbauen
    const ergebnis = await Promise.all(personen.map(async person => {
      const isMitarbeiter = person.typ === 'mitarbeiter';
      const personKey = isMitarbeiter ? `m_${person.id}` : `l_${person.id}`;
      const mid = isMitarbeiter ? person.id : null;
      const lid = isMitarbeiter ? null : person.id;

      // Abwesenheiten dieser Person als Set {datum: typ}
      const abwMap = {};
      abwRows
        .filter(a => isMitarbeiter ? a.mitarbeiter_id === person.id : a.lehrling_id === person.id)
        .forEach(a => {
          const start = new Date(a.datum_von);
          const end = new Date(a.datum_bis);
          const cur = new Date(start);
          while (cur <= end) {
            abwMap[cur.toISOString().substring(0, 10)] = a.typ;
            cur.setDate(cur.getDate() + 1);
          }
        });

      let gesamtSollMin = 0;
      let gesamtIstMin = 0;
      let arbeitstage = 0;

      const tageDetails = await Promise.all(tage.map(async datum => {
        const wochentag = new Date(datum).getDay(); // 0=So
        const abwTyp = abwMap[datum] || null;

        // Soll berechnen
        const plan = await ArbeitszeitenPlanModel.getForDate(mid, lid, datum);
        let sollMin = 0;
        if (plan && !plan.ist_frei) {
          sollMin = Math.round((plan.arbeitsstunden || 0) * 60);
        } else if (!plan && wochentag !== 0 && wochentag !== 6) {
          // Kein Planeintrag + kein Wochenende → Standardarbeitstag überspringen
          // (kein Soll → nicht mitrechnen)
          sollMin = 0;
        }

        // Ist berechnen
        let istMin = 0;
        const stempelKey = personKey + '_' + datum;
        const stempel = stempelMap[stempelKey];

        if (abwTyp && (abwTyp === 'urlaub' || abwTyp === 'krank' || abwTyp === 'lehrgang')) {
          // Abwesenheit → Ist = Soll
          istMin = sollMin;
        } else if (stempel && stempel.kommen_zeit && stempel.gehen_zeit) {
          const bruttoMin = zeitZuMinuten(stempel.gehen_zeit) - zeitZuMinuten(stempel.kommen_zeit);
          const ubMin = (ubMap[stempelKey] || []).reduce((s, u) =>
            s + zeitZuMinuten(u.ende_zeit) - zeitZuMinuten(u.start_zeit), 0);
          const pMin = (pauseMap[stempelKey] || []).reduce((s, p) =>
            s + zeitZuMinuten(p.pause_ende_zeit) - zeitZuMinuten(p.pause_start_zeit), 0);
          istMin = Math.max(0, bruttoMin - ubMin - pMin);
        }

        if (sollMin > 0 || istMin > 0 || abwTyp) {
          gesamtSollMin += sollMin;
          gesamtIstMin += istMin;
          if (sollMin > 0) arbeitstage++;
        }

        return {
          datum,
          soll_min: sollMin,
          ist_min: istMin,
          saldo_min: istMin - sollMin,
          abwesenheit: abwTyp,
          gestempelt: !!(stempel && stempel.kommen_zeit),
          kommen_zeit: stempel ? stempel.kommen_zeit : null,
          gehen_zeit: stempel ? stempel.gehen_zeit : null,
          soll_start: plan ? plan.arbeitszeit_start : null,
          soll_ende: plan ? plan.arbeitszeit_ende : null
        };
      }));

      // Nur Tage mit Relevanz zurückgeben
      const relevanteTage = tageDetails.filter(t => t.soll_min > 0 || t.ist_min > 0 || t.abwesenheit);

      return {
        id: person.id,
        name: person.name,
        typ: person.typ,
        arbeitstage,
        gesamt: {
          soll_min: gesamtSollMin,
          ist_min: gesamtIstMin,
          saldo_min: gesamtIstMin - gesamtSollMin
        },
        tage: relevanteTage
      };
    }));

    res.json(ergebnis);
  });
}

module.exports = ZeitkontoController;
