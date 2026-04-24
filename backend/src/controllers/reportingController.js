/**
 * Reporting Controller
 * KPI-Daten und Berichte
 */

const reportingModel = require('../models/reportingModel');

async function getKPIs(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = today.slice(0, 8) + '01';
    const von = req.query.von || firstOfMonth;
    const bis = req.query.bis || today;

    const data = await reportingModel.getKPIs(von, bis);
    res.json({ success: true, von, bis, kpis: data });
  } catch (err) {
    console.error('Fehler bei getKPIs:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getMitarbeiterReport(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = today.slice(0, 8) + '01';
    const von = req.query.von || firstOfMonth;
    const bis = req.query.bis || today;

    const data = await reportingModel.getMitarbeiterProduktivitaet(von, bis);
    res.json({ success: true, von, bis, mitarbeiter: data });
  } catch (err) {
    console.error('Fehler bei getMitarbeiterReport:', err);
    res.status(500).json({ error: err.message });
  }
}

async function getTrend(req, res) {
  try {
    const { kpi = 'abgeschlossen', intervall = 'monat', monate = '3' } = req.query;
    const data = await reportingModel.getTrend(kpi, intervall, monate);
    res.json({ success: true, kpi, intervall, daten: data });
  } catch (err) {
    console.error('Fehler bei getTrend:', err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/reporting/pausen?von=YYYY-MM-DD&bis=YYYY-MM-DD
 * Liefert Pausenuebersicht je Person/Tag mit Aufteilung nach Mittagspause vs. Unterbrechung.
 */
async function getPausenReport(req, res) {
  try {
    const { allAsync } = require('../utils/dbHelper');
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = today.slice(0, 8) + '01';
    const von = req.query.von || firstOfMonth;
    const bis = req.query.bis || today;

    // Mittagspausen aggregiert je Person/Datum
    const pausen = await allAsync(`
      SELECT pt.datum,
             pt.mitarbeiter_id, pt.lehrling_id,
             COALESCE(m.name, l.name) AS person_name,
             CASE WHEN pt.mitarbeiter_id IS NOT NULL THEN 'mitarbeiter' ELSE 'lehrling' END AS person_typ,
             pt.id, pt.pause_start_zeit, pt.pause_ende_zeit, pt.abgeschlossen,
             pt.pause_aktueller_termin_id,
             ta.termin_nr AS aktueller_termin_nr, ta.kennzeichen AS aktueller_kennzeichen
      FROM pause_tracking pt
      LEFT JOIN mitarbeiter m ON pt.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l   ON pt.lehrling_id = l.id
      LEFT JOIN termine ta    ON pt.pause_aktueller_termin_id = ta.id
      WHERE pt.datum BETWEEN ? AND ?
      ORDER BY pt.datum, person_name, pt.pause_start_zeit
    `, [von, bis]);

    const unterbr = await allAsync(`
      SELECT au.datum,
             au.mitarbeiter_id, au.lehrling_id,
             COALESCE(m.name, l.name) AS person_name,
             CASE WHEN au.mitarbeiter_id IS NOT NULL THEN 'mitarbeiter' ELSE 'lehrling' END AS person_typ,
             au.id, au.start_zeit, au.ende_zeit, au.grund, au.termin_id,
             t.termin_nr, t.kennzeichen
      FROM arbeitsunterbrechungen au
      LEFT JOIN mitarbeiter m ON au.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l   ON au.lehrling_id = l.id
      LEFT JOIN termine t     ON au.termin_id = t.id
      WHERE au.datum BETWEEN ? AND ?
      ORDER BY au.datum, person_name, au.start_zeit
    `, [von, bis]);

    // Helper
    const _isoToMin = iso => {
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d)) return null;
      return d.getHours() * 60 + d.getMinutes();
    };
    const _hhmmToMin = hhmm => {
      if (!hhmm) return null;
      const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
    };
    // Robustes HH:MM aus beliebigem Wert (ISO-String, Date, "HH:MM:SS", etc.) — niemals throw
    const _toHHMM = v => {
      if (!v) return null;
      try {
        const d = new Date(v);
        if (!isNaN(d.getTime())) {
          return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        }
      } catch (e) { /* fallthrough */ }
      const m = String(v).match(/(\d{1,2}):(\d{2})/);
      return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
    };

    // Aggregat-Map: key = datum|person_typ|person_id
    const aggMap = new Map();
    const _key = (datum, typ, id) => `${datum}|${typ}|${id}`;
    const _ensure = (datum, typ, id, name) => {
      const k = _key(datum, typ, id);
      if (!aggMap.has(k)) {
        aggMap.set(k, {
          datum, person_typ: typ, person_id: id, person_name: name,
          mittagspause_min: 0, unterbrechung_min: 0, gesamt_min: 0,
          mittagspausen: [], unterbrechungen: []
        });
      }
      return aggMap.get(k);
    };

    for (const p of pausen) {
      const personId = p.mitarbeiter_id || p.lehrling_id;
      const a = _ensure(p.datum, p.person_typ, personId, p.person_name);
      let dauer = 0;
      if (p.abgeschlossen && p.pause_ende_zeit) {
        const s = _isoToMin(p.pause_start_zeit);
        const e = _isoToMin(p.pause_ende_zeit);
        if (s != null && e != null && e > s) dauer = e - s;
      }
      a.mittagspause_min += dauer;
      a.gesamt_min += dauer;
      a.mittagspausen.push({
        id: p.id,
        start: _toHHMM(p.pause_start_zeit),
        ende: _toHHMM(p.pause_ende_zeit),
        dauer_min: dauer,
        abgeschlossen: !!p.abgeschlossen,
        aktueller_termin_nr: p.aktueller_termin_nr || null,
        aktueller_kennzeichen: p.aktueller_kennzeichen || null
      });
    }

    for (const u of unterbr) {
      const personId = u.mitarbeiter_id || u.lehrling_id;
      const a = _ensure(u.datum, u.person_typ, personId, u.person_name);
      let dauer = 0;
      if (u.ende_zeit) {
        const s = _hhmmToMin(u.start_zeit);
        const e = _hhmmToMin(u.ende_zeit);
        if (s != null && e != null && e > s) dauer = e - s;
      }
      a.unterbrechung_min += dauer;
      a.gesamt_min += dauer;
      a.unterbrechungen.push({
        id: u.id,
        start: u.start_zeit ? String(u.start_zeit).substring(0, 5) : null,
        ende: u.ende_zeit ? String(u.ende_zeit).substring(0, 5) : null,
        dauer_min: dauer,
        grund: u.grund || null,
        termin_nr: u.termin_nr || null,
        kennzeichen: u.kennzeichen || null
      });
    }

    const result = Array.from(aggMap.values()).sort((a, b) => {
      if (a.datum !== b.datum) return a.datum.localeCompare(b.datum);
      return (a.person_name || '').localeCompare(b.person_name || '');
    });

    res.json({ success: true, von, bis, eintraege: result });
  } catch (err) {
    console.error('Fehler bei getPausenReport:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getKPIs, getMitarbeiterReport, getTrend, getPausenReport };
