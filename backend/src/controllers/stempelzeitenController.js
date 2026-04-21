const { allAsync, getAsync, runAsync } = require('../utils/dbHelper');
const { broadcastEvent } = require('../utils/websocket');
const ArbeitszeitenModel = require('../models/arbeitszeitenModel');

const ZEIT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

class StempelzeitenController {
  static async getTagUebersicht(req, res) {
    try {
      const datum = req.query.datum || new Date().toISOString().slice(0, 10);

      // Alle Termine des Tages — mit Stempel wenn vorhanden
      // Termine ohne Mitarbeiter-Zuweisung erscheinen unter "Alle Aufträge"
      // Termine MIT Stempel erscheinen unter dem jeweiligen Mitarbeiter/Lehrling
      const alleTermine = await allAsync(`
        SELECT
          t.id                     AS termin_id,
          t.termin_nr,
          t.kennzeichen,
          COALESCE(NULLIF(t.kunde_name,''), k.name, '') AS kunde_name,
          t.arbeit                 AS termin_arbeit,
          t.geschaetzte_zeit,
          t.lehrling_id,
          t.mitarbeiter_id,
          t.arbeitszeiten_details,
          t.interne_auftragsnummer,
          t.fertigstellung_zeit,
          t.tatsaechliche_zeit,
          t.startzeit,
          t.status
        FROM termine t
        LEFT JOIN kunden k ON t.kunde_id = k.id
        WHERE t.datum = ?
          AND t.geloescht_am IS NULL
          AND t.status NOT IN ('storniert')
        ORDER BY t.id
      `, [datum]);

      const stempelRows = await allAsync(`
        SELECT
          ta.id          AS arbeit_id,
          ta.termin_id,
          ta.arbeit,
          ta.zeit        AS geschaetzte_min,
          ta.stempel_start,
          ta.stempel_ende,
          ta.reihenfolge,
          CASE WHEN ta.mitarbeiter_id IS NOT NULL THEN 'mitarbeiter' ELSE 'lehrling' END AS person_typ,
          COALESCE(ta.mitarbeiter_id, ta.lehrling_id) AS person_id,
          COALESCE(m.name, l.name) AS person_name
        FROM termine_arbeiten ta
        JOIN termine t ON ta.termin_id = t.id
        LEFT JOIN mitarbeiter m ON ta.mitarbeiter_id = m.id
        LEFT JOIN lehrlinge l  ON ta.lehrling_id  = l.id
        WHERE t.datum = ?
          AND t.geloescht_am IS NULL
        ORDER BY person_name, ta.termin_id, ta.reihenfolge
      `, [datum]);

      // Personen-Map: alle bekannten Mitarbeiter und Lehrlinge laden
      // Richtwerte aus Zeitverwaltung (Herstellervorgabe) — in-memory Fuzzy-Match
      const alleArbeitszeiten = await allAsync(`SELECT bezeichnung, standard_minuten, aliase FROM arbeitszeiten`, []);
      const _norm = s => s.toLowerCase().replace(/[\/\-_\.]+/g, ' ').replace(/\s+/g, ' ').trim();
      const _getRichtwert = (arbeitName) => {
        if (!arbeitName) return null;
        const suche = _norm(arbeitName);
        // 1. Exakter Treffer
        let match = alleArbeitszeiten.find(a => _norm(a.bezeichnung) === suche);
        // 2. Teilwort
        if (!match) match = alleArbeitszeiten.find(a => {
          const b = _norm(a.bezeichnung);
          return b.includes(suche) || suche.includes(b);
        });
        // 3. Alias
        if (!match) match = alleArbeitszeiten.find(a =>
          (a.aliase || '').split(',').map(x => _norm(x)).some(al => al && (al === suche || al.includes(suche) || suche.includes(al)))
        );
        return match ? match.standard_minuten : null;
      };

      const mitarbeiterRows = await allAsync(`SELECT id, name FROM mitarbeiter WHERE aktiv = 1`, []);
      const lehrlingeRows   = await allAsync(`SELECT id, name FROM lehrlinge WHERE aktiv = 1`, []);
      const personenMap = {};
      for (const m of mitarbeiterRows) personenMap[`mitarbeiter_${m.id}`] = { person_typ: 'mitarbeiter', person_id: m.id, person_name: m.name };
      for (const l of lehrlingeRows)   personenMap[`lehrling_${l.id}`]    = { person_typ: 'lehrling',    person_id: l.id, person_name: l.name };

      // Zuweisung je Termin bestimmen: arbeitszeiten_details > termine.lehrling/mitarbeiter_id
      const terminPersonMap = {};
      for (const t of alleTermine) {
        let typ = null, pid = null;
        try {
          const az = typeof t.arbeitszeiten_details === 'string'
            ? JSON.parse(t.arbeitszeiten_details)
            : t.arbeitszeiten_details;
          if (az && az._gesamt_mitarbeiter_id) {
            typ = az._gesamt_mitarbeiter_id.type || 'mitarbeiter';
            pid = az._gesamt_mitarbeiter_id.id;
          }
        } catch(e) {}
        if (!pid && t.lehrling_id)    { typ = 'lehrling';    pid = t.lehrling_id; }
        if (!pid && t.mitarbeiter_id) { typ = 'mitarbeiter'; pid = t.mitarbeiter_id; }
        if (pid) terminPersonMap[t.termin_id] = { person_typ: typ, person_id: pid };
      }

      // Stempel nach termin_id indexieren
      const stempelByTermin = {};
      for (const s of stempelRows) {
        if (!stempelByTermin[s.termin_id]) stempelByTermin[s.termin_id] = [];
        stempelByTermin[s.termin_id].push(s);
      }

      // Fallback: wenn termine_arbeiten.stempel_start/ende leer sind, aus
      // termine.arbeitszeiten_details / termine.fertigstellung_zeit ableiten.
      // Wird gesetzt, wenn die Arbeit via "Fertig"-Button (Web) abgeschlossen
      // wurde statt via Tablet-App-Stempelung.
      const _isoToHHMM = (iso) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d)) return null;
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      };
      const _parseDetails = (termin) => {
        if (!termin || !termin.arbeitszeiten_details) return null;
        try {
          return typeof termin.arbeitszeiten_details === 'string'
            ? JSON.parse(termin.arbeitszeiten_details)
            : termin.arbeitszeiten_details;
        } catch (_) { return null; }
      };
      // Liefert { stempel_start, stempel_ende, ist_min } aus Termin-Fallbacks.
      // arbeitName=null → globaler Termin-Fallback (fertigstellung_zeit für Ende).
      const _fallbackFromTermin = (termin, arbeitName) => {
        const det = _parseDetails(termin);
        let fbStart = null, fbEnde = null;
        if (det && det._startzeit) fbStart = det._startzeit;
        if (arbeitName && det && det[arbeitName] && det[arbeitName].fertigstellung_zeit) {
          fbEnde = _isoToHHMM(det[arbeitName].fertigstellung_zeit);
        }
        if (!fbEnde && termin && termin.fertigstellung_zeit) {
          fbEnde = _isoToHHMM(termin.fertigstellung_zeit);
        }
        const ist = (fbStart && fbEnde) ? StempelzeitenController._diffMinuten(fbStart, fbEnde) : null;
        return { stempel_start: fbStart, stempel_ende: fbEnde, ist_min: ist };
      };

      // Liefert die GEPLANTEN Zeiten (Auftrags-Startzeit und berechnetes Ende).
      // plan_start = termin.startzeit || details._startzeit
      // plan_ende  = plan_start + richtwertMin  (falls richtwertMin bekannt)
      const _planZeiten = (termin, richtwertMin) => {
        const det = _parseDetails(termin);
        let planStart = termin && termin.startzeit ? String(termin.startzeit).substring(0, 5) : null;
        if (!planStart && det && det._startzeit) planStart = String(det._startzeit).substring(0, 5);
        let planEnde = null;
        if (planStart && richtwertMin && richtwertMin > 0) {
          const [h, m] = planStart.split(':').map(Number);
          if (!isNaN(h) && !isNaN(m)) {
            const end = h * 60 + m + richtwertMin;
            planEnde = String(Math.floor((end / 60) % 24)).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0');
          }
        }
        return { plan_start: planStart, plan_ende: planEnde };
      };

      const gruppenMap = new Map();

      const _getPerson = (person_typ, person_id, fallbackName) => {
        const key = `${person_typ}_${person_id}`;
        return personenMap[key] || { person_typ, person_id, person_name: fallbackName || '—' };
      };

      const _addArbeit = (grupKey, person, terminData, arbeitData) => {
        if (!gruppenMap.has(grupKey)) {
          gruppenMap.set(grupKey, { person_typ: person.person_typ, person_id: person.person_id, person_name: person.person_name, arbeiten: [] });
        }
        gruppenMap.get(grupKey).arbeiten.push(arbeitData);
      };

      // 1. Termine MIT Stempel in termine_arbeiten
      const gestempelteTerminIds = new Set();
      for (const s of stempelRows) {
        gestempelteTerminIds.add(s.termin_id);
        // Person: aus stempel-Zeile, oder aus Termin-Zuweisung
        let personTyp = s.person_typ, personId = s.person_id, personName = s.person_name;
        if (!personId) {
          const tp = terminPersonMap[s.termin_id];
          if (tp) { personTyp = tp.person_typ; personId = tp.person_id; }
          const p = personId ? _getPerson(personTyp, personId) : null;
          personName = p ? p.person_name : '—';
        }
        const grupKey = personId ? `${personTyp}_${personId}` : `unbekannt_${s.termin_id}`;
        const t = alleTermine.find(x => x.termin_id === s.termin_id) || {};
        // Fallback aus arbeitszeiten_details/fertigstellung_zeit falls stempel_* leer
        const fb = _fallbackFromTermin(t, s.arbeit);
        const effStart = s.stempel_start || fb.stempel_start;
        const effEnde  = s.stempel_ende  || fb.stempel_ende;
        const istMin = effStart && effEnde
          ? StempelzeitenController._diffMinuten(effStart, effEnde) : null;
        const richtwertS = _getRichtwert(s.arbeit || t.termin_arbeit);
        const planS = _planZeiten(t, richtwertS);
        _addArbeit(grupKey, { person_typ: personTyp, person_id: personId, person_name: personName }, t, {
          arbeit_id: s.arbeit_id, termin_id: s.termin_id,
          termin_nr: t.termin_nr || '', interne_auftragsnummer: t.interne_auftragsnummer || '', kennzeichen: t.kennzeichen || '', kunde_name: t.kunde_name || '',
          arbeit: s.arbeit || t.termin_arbeit || '',
          richtwert_min: richtwertS,
          geschaetzte_min: s.geschaetzte_min,
          plan_start: planS.plan_start, plan_ende: planS.plan_ende,
          stempel_start: s.stempel_start, stempel_ende: s.stempel_ende,
          ist_min: (s.stempel_start && s.stempel_ende)
            ? StempelzeitenController._diffMinuten(s.stempel_start, s.stempel_ende) : istMin
        });
      }

      // 2. Termine OHNE Stempel, aber mit Personzuweisung → unter jeweiliger Person
      const ohneStempel = alleTermine.filter(t => !gestempelteTerminIds.has(t.termin_id));
      for (const t of ohneStempel) {
        const tp = terminPersonMap[t.termin_id];
        if (tp) {
          const person = _getPerson(tp.person_typ, tp.person_id);
          const grupKey = `${tp.person_typ}_${tp.person_id}`;
          const rw = _getRichtwert(t.termin_arbeit);
          const planP = _planZeiten(t, rw);
          const fb = _fallbackFromTermin(t, t.termin_arbeit);
          _addArbeit(grupKey, person, t, {
            arbeit_id: null, termin_id: t.termin_id,
            termin_nr: t.termin_nr || '', interne_auftragsnummer: t.interne_auftragsnummer || '', kennzeichen: t.kennzeichen || '', kunde_name: t.kunde_name || '',
            arbeit: t.termin_arbeit || '', richtwert_min: rw,
            geschaetzte_min: t.geschaetzte_zeit,
            plan_start: planP.plan_start, plan_ende: planP.plan_ende,
            stempel_start: fb.stempel_start, stempel_ende: fb.stempel_ende, ist_min: fb.ist_min
          });
        }
      }

      // 3. Termine ohne Person und ohne Stempel → Sammelgruppe
      const ohnePersonOhneStempel = ohneStempel.filter(t => !terminPersonMap[t.termin_id]);
      if (ohnePersonOhneStempel.length > 0) {
        gruppenMap.set('alle_auftraege', {
          person_typ: 'alle', person_id: 0,
          person_name: '📋 Alle Aufträge (noch nicht gestempelt)',
          arbeiten: ohnePersonOhneStempel.map(t => {
            const rw = _getRichtwert(t.termin_arbeit);
            const planP = _planZeiten(t, rw);
            const fb = _fallbackFromTermin(t, t.termin_arbeit);
            return {
              arbeit_id: null, termin_id: t.termin_id,
              termin_nr: t.termin_nr || '', interne_auftragsnummer: t.interne_auftragsnummer || '', kennzeichen: t.kennzeichen || '', kunde_name: t.kunde_name || '',
              arbeit: t.termin_arbeit || '', richtwert_min: rw,
              geschaetzte_min: t.geschaetzte_zeit,
              plan_start: planP.plan_start, plan_ende: planP.plan_ende,
              stempel_start: fb.stempel_start, stempel_ende: fb.stempel_ende, ist_min: fb.ist_min
            };
          })
        });
      }

      res.json(Array.from(gruppenMap.values()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async setStempel(req, res) {
    try {
      const { termin_id, arbeit_name, stempel_start, stempel_ende, person_id, person_typ } = req.body;

      if (!termin_id || !arbeit_name) {
        return res.status(400).json({ error: 'termin_id und arbeit_name sind Pflichtfelder' });
      }
      if (stempel_start !== undefined && stempel_start !== null && !ZEIT_REGEX.test(stempel_start)) {
        return res.status(400).json({ error: 'stempel_start muss Format HH:MM haben' });
      }
      if (stempel_ende !== undefined && stempel_ende !== null && !ZEIT_REGEX.test(stempel_ende)) {
        return res.status(400).json({ error: 'stempel_ende muss Format HH:MM haben' });
      }

      const updates = [];
      const values = [];
      if (stempel_start !== undefined) { updates.push('stempel_start = ?'); values.push(stempel_start); }
      if (stempel_ende !== undefined)  { updates.push('stempel_ende = ?');  values.push(stempel_ende);  }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Mindestens stempel_start oder stempel_ende angeben' });
      }

      values.push(termin_id, arbeit_name);
      let result = await runAsync(
        `UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE termin_id = ? AND arbeit = ?`,
        values
      );

      // Kein Treffer: Termin existiert aber hat noch keine termine_arbeiten-Zeile
      // → auto-anlegen aus termine-Daten, dann erneut updaten
      if (result.changes === 0) {
        const termin = await getAsync(
          `SELECT id, arbeit, mitarbeiter_id, lehrling_id, geschaetzte_zeit FROM termine WHERE id = ?`,
          [termin_id]
        );
        if (!termin) {
          return res.status(404).json({ error: 'Termin nicht gefunden' });
        }
        // Person-ID aus Request bevorzugen (Intern Tab kennt den Kontext)
        // Fallback auf termin.mitarbeiter_id / lehrling_id
        const mitarbeiterId = (person_typ === 'mitarbeiter' && person_id) ? person_id
          : (person_typ !== 'lehrling' ? termin.mitarbeiter_id || null : null);
        const lehrlingId = (person_typ === 'lehrling' && person_id) ? person_id
          : (!person_typ ? termin.lehrling_id || null : null);
        await runAsync(
          `INSERT OR IGNORE INTO termine_arbeiten (termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id, reihenfolge)
           VALUES (?, ?, ?, ?, ?, 0)`,
          [termin_id, arbeit_name, termin.geschaetzte_zeit || 1, mitarbeiterId, lehrlingId]
        );
        result = await runAsync(
          `UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE termin_id = ? AND arbeit = ?`,
          values
        );
      }

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Arbeit nicht gefunden' });
      }

      broadcastEvent('stempel.updated', { termin_id, arbeit_name });

      // Wenn stempel_ende gesetzt wurde: Lernlogik triggern
      if (stempel_ende !== undefined) {
        const row = await getAsync(
          `SELECT ta.stempel_start, ta.stempel_ende, ta.zeit AS geschaetzte_min,
                  t.datum, t.mitarbeiter_id
           FROM termine_arbeiten ta
           JOIN termine t ON ta.termin_id = t.id
           WHERE ta.termin_id = ? AND ta.arbeit = ?`,
          [termin_id, arbeit_name]
        );
        if (row && row.stempel_start && row.stempel_ende) {
          const istMin = StempelzeitenController._diffMinuten(row.stempel_start, row.stempel_ende);
          if (istMin > 0) {
            // 1. arbeitszeiten: Standardzeit gewichtet aktualisieren
            try {
              await ArbeitszeitenModel.updateByBezeichnung(arbeit_name, istMin);
            } catch (e) {
              console.warn('[Stempel-Lernen] arbeitszeiten update fehlgeschlagen:', e.message);
            }
            // 2. ki_zeitlern_daten: Lernpunkt eintragen
            try {
              const EinstellungenModel = require('../models/einstellungenModel');
              const einst = await EinstellungenModel.getWerkstatt();
              const kiAktiv = einst ? (einst.ki_zeitlern_enabled === 0 ? false : true) : true;
              if (kiAktiv) {
                const { kategorisiereArbeit } = require('../services/localAiService');
                const { runAsync: dbRun } = require('../config/database');
                const kat = kategorisiereArbeit(arbeit_name);
                await dbRun(
                  `INSERT INTO ki_zeitlern_daten (termin_id, arbeit, kategorie, geschaetzte_min, tatsaechliche_min, mitarbeiter_id, datum)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [termin_id, arbeit_name, kat, row.geschaetzte_min || istMin, istMin, row.mitarbeiter_id || null, row.datum]
                );
              }
            } catch (e) {
              console.warn('[Stempel-Lernen] ki_zeitlern_daten insert fehlgeschlagen:', e.message);
            }
          }
        }
      }

      res.json({ changes: result.changes, message: 'Stempel gesetzt' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static _diffMinuten(start, ende) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = ende.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff >= 0 ? diff : null;
  }
}

module.exports = StempelzeitenController;
