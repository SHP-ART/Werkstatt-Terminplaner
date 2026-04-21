const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
const { broadcastEvent } = require('../utils/websocket');
const TermineModel = require('../models/termineModel');

function getJetztZeit() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

function getHeuteDatum() {
  return new Date().toISOString().slice(0, 10);
}

class TagesstempelController {

  /**
   * POST /api/tagesstempel/kommen
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Setzt kommen_zeit auf aktuelle Uhrzeit. Idempotent: zweiter Aufruf hat keinen Effekt.
   */
  static async kommen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      if (mitarbeiter_id) {
        const existing = await getAsync(
          `SELECT id, kommen_zeit FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`,
          [mitarbeiter_id, datum]
        );
        if (existing) {
          return res.json({ success: true, message: 'Bereits gestempelt', zeit: existing.kommen_zeit });
        }
        await runAsync(
          `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, kommen_quelle, erstellt_am) VALUES (?, ?, ?, 'stempel', datetime('now'))`,
          [mitarbeiter_id, datum, zeit]
        );
      } else {
        const existing = await getAsync(
          `SELECT id, kommen_zeit FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`,
          [lehrling_id, datum]
        );
        if (existing) {
          return res.json({ success: true, message: 'Bereits gestempelt', zeit: existing.kommen_zeit });
        }
        await runAsync(
          `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, kommen_quelle, erstellt_am) VALUES (?, ?, ?, 'stempel', datetime('now'))`,
          [lehrling_id, datum, zeit]
        );
      }

      broadcastEvent('tagesstempel.kommen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum, zeit });
      res.json({ success: true, zeit });
    } catch (err) {
      console.error('[Tagesstempel-Kommen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/gehen
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Prüft laufende Aufträge – gibt diese zurück wenn vorhanden (Frontend zeigt Dialog).
   * Ohne laufende Aufträge: direkt speichern.
   */
  static async gehen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();

      let laufendeTermine = [];
      if (mitarbeiter_id) {
        laufendeTermine = await allAsync(
          `SELECT id, termin_nr, kennzeichen, kunde_name, arbeit FROM termine
           WHERE datum = ? AND mitarbeiter_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
          [datum, mitarbeiter_id]
        );
      } else {
        laufendeTermine = await allAsync(
          `SELECT id, termin_nr, kennzeichen, kunde_name, arbeit FROM termine
           WHERE datum = ? AND lehrling_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
          [datum, lehrling_id]
        );
      }

      if (laufendeTermine.length > 0) {
        return res.json({
          success: false,
          bestaetigung_erforderlich: true,
          laufende_termine: laufendeTermine
        });
      }

      await TagesstempelController._setzeGehenZeit(mitarbeiter_id, lehrling_id, datum);
      broadcastEvent('tagesstempel.gehen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, zeit: getJetztZeit() });
    } catch (err) {
      console.error('[Tagesstempel-Gehen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/gehen/bestaetigen
   * Body: { mitarbeiter_id?, lehrling_id?, termine_verschieben: boolean }
   * Setzt gehen_zeit.
   * Wenn termine_verschieben=true: alle in_arbeit-Termine bleiben heute auf 'wartend',
   * es wird ein Folgetermin für morgen mit der Restzeit (Richtwert - gestempelt) angelegt.
   */
  static async gehenBestaetigen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      // termine_verschieben wird ignoriert: laufende in_arbeit-Termine werden IMMER
      // automatisch auf morgen verschoben (ausser sie sind gerade pausiert), weil die
      // Buehne sonst blockiert bleibt und der Termin die naechste Arbeit darstellt.
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const morgen = new Date();
      morgen.setDate(morgen.getDate() + 1);
      const morgenStr = morgen.toISOString().slice(0, 10);

      const folgeTermineAngelegt = [];

      {
        // Richtwerte aus Zeitverwaltung laden (einmalig)
        const alleArbeitszeiten = await allAsync(`SELECT bezeichnung, standard_minuten, aliase FROM arbeitszeiten`, []);
        const _norm = s => s.toLowerCase().replace(/[\/\-_\.]+/g, ' ').replace(/\s+/g, ' ').trim();
        const _getRichtwert = (arbeitName) => {
          if (!arbeitName) return null;
          const suche = _norm(arbeitName);
          let match = alleArbeitszeiten.find(a => _norm(a.bezeichnung) === suche);
          if (!match) match = alleArbeitszeiten.find(a => { const b = _norm(a.bezeichnung); return b.includes(suche) || suche.includes(b); });
          if (!match) match = alleArbeitszeiten.find(a =>
            (a.aliase || '').split(',').map(x => _norm(x)).some(al => al && (al === suche || al.includes(suche) || suche.includes(al)))
          );
          return match ? match.standard_minuten : null;
        };

        // Laufende in_arbeit-Termine für diese Person holen
        let laufendeTermine = [];
        if (mitarbeiter_id) {
          laufendeTermine = await allAsync(
            `SELECT id, termin_nr, kennzeichen, kunde_id, kunde_name, kunde_telefon,
                    arbeit, umfang, geschaetzte_zeit, mitarbeiter_id, lehrling_id,
                    arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp,
                    abholung_typ, abholung_details, abholung_zeit, abholung_datum,
                    bring_zeit, kontakt_option, kilometerstand
             FROM termine WHERE datum = ? AND mitarbeiter_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
            [datum, mitarbeiter_id]
          );
        } else {
          laufendeTermine = await allAsync(
            `SELECT id, termin_nr, kennzeichen, kunde_id, kunde_name, kunde_telefon,
                    arbeit, umfang, geschaetzte_zeit, mitarbeiter_id, lehrling_id,
                    arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp,
                    abholung_typ, abholung_details, abholung_zeit, abholung_datum,
                    bring_zeit, kontakt_option, kilometerstand
             FROM termine WHERE datum = ? AND lehrling_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
            [datum, lehrling_id]
          );
        }

        // Helper: einen laufenden Termin auf 'wartend' setzen und Folgetermin fuer morgen anlegen
        const _verschiebeTermin = async (t) => {
          // Original-Termin auf 'wartend' setzen (bleibt heute als Dokumentation)
          await runAsync(
            `UPDATE termine SET status = 'wartend' WHERE id = ?`,
            [t.id]
          );
          broadcastEvent('termin.updated', { id: t.id, datum });

          // Offene Arbeiten dieses Termins (stempel_start gesetzt, stempel_ende NULL)
          // bekommen die aktuelle Uhrzeit als stempel_ende (= Arbeitsende)
          const jetztHHMM = getJetztZeit().substring(0, 5);
          await runAsync(
            `UPDATE termine_arbeiten
                SET stempel_ende = ?
              WHERE termin_id = ?
                AND stempel_start IS NOT NULL
                AND (stempel_ende IS NULL OR stempel_ende = '')`,
            [jetztHHMM, t.id]
          );

          // Bereits gestempelte Minuten ermitteln (abgeschlossene Arbeiten aus termine_arbeiten)
          const stempelZeilen = await allAsync(
            `SELECT stempel_start, stempel_ende, zeit AS geschaetzte_min FROM termine_arbeiten WHERE termin_id = ?`,
            [t.id]
          );
          const bereitsGestempeltMin = stempelZeilen.reduce((sum, s) => {
            if (!s.stempel_start || !s.stempel_ende) return sum;
            const [sh, sm] = s.stempel_start.split(':').map(Number);
            const [eh, em] = s.stempel_ende.split(':').map(Number);
            return sum + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
          }, 0);

          // Richtwert (Minuten aus Zeitverwaltung) – Fallback auf geschaetzte_zeit des Termins
          const richtwertMin = _getRichtwert(t.arbeit) || t.geschaetzte_zeit || 60;

          // Restzeit = Richtwert - bereits gestempelt (mind. 15 min)
          const restMin = Math.max(15, richtwertMin - bereitsGestempeltMin);

          // Folgetermin anlegen
          const result = await TermineModel.create({
            kunde_id:             t.kunde_id,
            kunde_name:           t.kunde_name,
            kunde_telefon:        t.kunde_telefon,
            kennzeichen:          t.kennzeichen,
            arbeit:               t.arbeit,
            umfang:               t.umfang,
            geschaetzte_zeit:     restMin,
            datum:                morgenStr,
            abholung_typ:         t.abholung_typ,
            abholung_details:     t.abholung_details,
            abholung_zeit:        t.abholung_zeit,
            abholung_datum:       t.abholung_datum,
            bring_zeit:           t.bring_zeit,
            kontakt_option:       t.kontakt_option,
            kilometerstand:       t.kilometerstand,
            mitarbeiter_id:       t.mitarbeiter_id,
            arbeitszeiten_details: null,
            dringlichkeit:        t.dringlichkeit,
            vin:                  t.vin,
            fahrzeugtyp:          t.fahrzeugtyp,
            ist_schwebend:        0,
            status:               'geplant'
          });

          folgeTermineAngelegt.push({ originalId: t.id, folgeId: result.id, folgeNr: result.terminNr, restMin });
          broadcastEvent('termin.created', { id: result.id, datum: morgenStr, folgeVon: t.id });
        };

        // Pausierte Termine (aktive pause_tracking-Zeile) nicht verschieben
        const pausierteTerminIds = new Set();
        const aktivePausen = await allAsync(
          `SELECT pause_naechster_termin_id FROM pause_tracking
            WHERE abgeschlossen = 0 AND pause_naechster_termin_id IS NOT NULL`,
          []
        );
        for (const p of aktivePausen) pausierteTerminIds.add(p.pause_naechster_termin_id);

        for (const t of laufendeTermine) {
          if (pausierteTerminIds.has(t.id)) continue;
          await _verschiebeTermin(t);
        }

        // Zusaetzlich: Wenn diese Person die LETZTE ist, die heute Gehen stempelt,
        // auch orphan-Termine (manuell auf in_arbeit gesetzt, ohne Personen-Zuweisung)
        // fuer morgen verschieben.
        const nochOffeneTagesstempel = await getAsync(
          `SELECT COUNT(*) AS cnt FROM tagesstempel
            WHERE datum = ?
              AND kommen_zeit IS NOT NULL
              AND (gehen_zeit IS NULL OR gehen_zeit = '')
              AND NOT (
                ${mitarbeiter_id ? 'mitarbeiter_id = ?' : 'lehrling_id = ?'}
              )`,
          [datum, mitarbeiter_id || lehrling_id]
        );
        const istLetztePerson = !nochOffeneTagesstempel || nochOffeneTagesstempel.cnt === 0;

        if (istLetztePerson) {
          const orphanTermine = await allAsync(
            `SELECT id, termin_nr, kennzeichen, kunde_id, kunde_name, kunde_telefon,
                    arbeit, umfang, geschaetzte_zeit, mitarbeiter_id, lehrling_id,
                    arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp,
                    abholung_typ, abholung_details, abholung_zeit, abholung_datum,
                    bring_zeit, kontakt_option, kilometerstand
             FROM termine
             WHERE datum = ? AND status = 'in_arbeit' AND geloescht_am IS NULL
               AND (mitarbeiter_id IS NULL OR mitarbeiter_id = 0)
               AND (lehrling_id IS NULL OR lehrling_id = 0)`,
            [datum]
          );
          for (const t of orphanTermine) {
            if (pausierteTerminIds.has(t.id)) continue;
            await _verschiebeTermin(t);
          }
        }
      }

      await TagesstempelController._setzeGehenZeit(mitarbeiter_id, lehrling_id, datum);
      broadcastEvent('tagesstempel.gehen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, zeit: getJetztZeit(), verschoben: folgeTermineAngelegt.length > 0, folge_termine: folgeTermineAngelegt });
    } catch (err) {
      console.error('[Tagesstempel-GehenBestaetigen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  static async _setzeGehenZeit(mitarbeiter_id, lehrling_id, datum) {
    const zeit = getJetztZeit();
    if (mitarbeiter_id) {
      const existing = await getAsync(
        `SELECT id FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`,
        [mitarbeiter_id, datum]
      );
      if (existing) {
        await runAsync(`UPDATE tagesstempel SET gehen_zeit = ?, gehen_quelle = 'stempel' WHERE mitarbeiter_id = ? AND datum = ?`, [zeit, mitarbeiter_id, datum]);
      } else {
        await runAsync(
          `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, gehen_quelle, erstellt_am) VALUES (?, ?, ?, ?, 'stempel', datetime('now'))`,
          [mitarbeiter_id, datum, zeit, zeit]
        );
      }
    } else {
      const existing = await getAsync(
        `SELECT id FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`,
        [lehrling_id, datum]
      );
      if (existing) {
        await runAsync(`UPDATE tagesstempel SET gehen_zeit = ?, gehen_quelle = 'stempel' WHERE lehrling_id = ? AND datum = ?`, [zeit, lehrling_id, datum]);
      } else {
        await runAsync(
          `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, gehen_zeit, gehen_quelle, erstellt_am) VALUES (?, ?, ?, ?, 'stempel', datetime('now'))`,
          [lehrling_id, datum, zeit, zeit]
        );
      }
    }
  }

  /**
   * DELETE /api/tagesstempel/:id
   * Löscht einen versehentlich gestarteten Tagesstempel komplett.
   * Nur erlaubt wenn noch keine gehen_zeit gesetzt ist (kein abgeschlossener Tag).
   */
  static async deleteTagesstempel(req, res) {
    try {
      const { id } = req.params;
      const existing = await getAsync(`SELECT id, gehen_zeit, mitarbeiter_id, lehrling_id, datum FROM tagesstempel WHERE id = ?`, [id]);
      if (!existing) return res.status(404).json({ error: 'Tagesstempel nicht gefunden' });
      if (existing.gehen_zeit) return res.status(409).json({ error: 'Tagesstempel hat bereits eine Gehen-Zeit – bitte manuell korrigieren' });
      await runAsync(`DELETE FROM tagesstempel WHERE id = ?`, [id]);
      broadcastEvent('tagesstempel.deleted', { id, mitarbeiter_id: existing.mitarbeiter_id, lehrling_id: existing.lehrling_id, datum: existing.datum });
      res.json({ success: true });
    } catch (err) {
      console.error('[Tagesstempel-Delete] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/tagesstempel?datum=YYYY-MM-DD
   * Gibt alle Tagesstempel + Arbeitsunterbrechungen für ein Datum zurück.
   */
  static async getByDatum(req, res) {
    try {
      const datum = req.query.datum || getHeuteDatum();

      const stempel = await allAsync(
        `SELECT ts.id, ts.mitarbeiter_id, ts.lehrling_id, ts.datum,
                ts.kommen_zeit, ts.kommen_quelle, ts.gehen_zeit, ts.gehen_quelle,
                m.name AS mitarbeiter_name, l.name AS lehrling_name
         FROM tagesstempel ts
         LEFT JOIN mitarbeiter m ON ts.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON ts.lehrling_id = l.id
         WHERE ts.datum = ?
         ORDER BY ts.kommen_zeit`,
        [datum]
      );

      const unterbrechungen = await allAsync(
        `SELECT au.id, au.mitarbeiter_id, au.lehrling_id, au.datum,
                au.start_zeit, au.ende_zeit, au.grund, au.termin_id,
                t.termin_nr, t.kennzeichen,
                m.name AS mitarbeiter_name, l.name AS lehrling_name
         FROM arbeitsunterbrechungen au
         LEFT JOIN mitarbeiter m ON au.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON au.lehrling_id = l.id
         LEFT JOIN termine t ON au.termin_id = t.id
         WHERE au.datum = ?
         ORDER BY au.start_zeit`,
        [datum]
      );

      const pausen = await allAsync(
        `SELECT pt.id, pt.mitarbeiter_id, pt.lehrling_id, pt.datum,
                pt.pause_start_zeit, pt.pause_ende_zeit, pt.abgeschlossen,
                pt.pause_aktueller_termin_id, pt.pause_naechster_termin_id,
                ta.termin_nr AS aktueller_termin_nr, ta.kennzeichen AS aktueller_kennzeichen,
                tn.termin_nr AS naechster_termin_nr, tn.kennzeichen AS naechster_kennzeichen
         FROM pause_tracking pt
         LEFT JOIN termine ta ON pt.pause_aktueller_termin_id = ta.id
         LEFT JOIN termine tn ON pt.pause_naechster_termin_id = tn.id
         WHERE pt.datum = ?
         ORDER BY pt.pause_start_zeit`,
        [datum]
      );

      res.json({ stempel, unterbrechungen, pausen });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/unterbrechung/start
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Öffnet eine neue Arbeitsunterbrechung (Ende noch offen).
   */
  static async unterbrechungStart(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, grund, termin_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      // Wenn kein termin_id mitgegeben: ersten in_arbeit-Termin der Person automatisch zuordnen
      let resolvedTerminId = termin_id || null;
      if (!resolvedTerminId) {
        const directField = mitarbeiter_id ? 'mitarbeiter_id' : 'lehrling_id';
        const direkt = await getAsync(
          `SELECT id FROM termine WHERE datum = ? AND ${directField} = ? AND status = 'in_arbeit' AND geloescht_am IS NULL ORDER BY id LIMIT 1`,
          [datum, mitarbeiter_id || lehrling_id]
        );
        if (direkt) resolvedTerminId = direkt.id;
      }

      const result = await runAsync(
        `INSERT INTO arbeitsunterbrechungen (mitarbeiter_id, lehrling_id, datum, start_zeit, grund, termin_id, erstellt_am)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [mitarbeiter_id || null, lehrling_id || null, datum, zeit, grund || null, resolvedTerminId]
      );

      broadcastEvent('tagesstempel.unterbrechung', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum, termin_id: resolvedTerminId, grund: grund || null });
      res.json({ success: true, id: result.lastID, start_zeit: zeit, termin_id: resolvedTerminId });
    } catch (err) {
      console.error('[Unterbrechung-Start] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/unterbrechung/ende
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Schließt die offene Arbeitsunterbrechung (ende_zeit = jetzt).
   */
  static async unterbrechungEnde(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      let offene;
      if (mitarbeiter_id) {
        offene = await getAsync(
          `SELECT id FROM arbeitsunterbrechungen WHERE mitarbeiter_id = ? AND datum = ? AND ende_zeit IS NULL ORDER BY id DESC LIMIT 1`,
          [mitarbeiter_id, datum]
        );
      } else {
        offene = await getAsync(
          `SELECT id FROM arbeitsunterbrechungen WHERE lehrling_id = ? AND datum = ? AND ende_zeit IS NULL ORDER BY id DESC LIMIT 1`,
          [lehrling_id, datum]
        );
      }

      if (!offene) {
        return res.status(404).json({ error: 'Keine offene Arbeitsunterbrechung gefunden' });
      }

      await runAsync(`UPDATE arbeitsunterbrechungen SET ende_zeit = ? WHERE id = ?`, [zeit, offene.id]);
      broadcastEvent('tagesstempel.unterbrechung', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, ende_zeit: zeit });
    } catch (err) {
      console.error('[Unterbrechung-Ende] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PATCH /api/tagesstempel/zeiten
   * Body: { mitarbeiter_id?, lehrling_id?, datum, kommen_zeit?, gehen_zeit? }
   * Setzt Kommen/Gehen manuell (Upsert).
   */
  static async updateZeiten(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, datum, kommen_zeit, gehen_zeit } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }
      if (!datum) return res.status(400).json({ error: 'datum erforderlich' });

      const ZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (kommen_zeit && !ZEIT_RE.test(kommen_zeit)) return res.status(400).json({ error: 'Ungültige kommen_zeit' });
      if (gehen_zeit  && !ZEIT_RE.test(gehen_zeit))  return res.status(400).json({ error: 'Ungültige gehen_zeit' });

      const existing = mitarbeiter_id
        ? await getAsync(`SELECT id FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`, [mitarbeiter_id, datum])
        : await getAsync(`SELECT id FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`, [lehrling_id, datum]);

      if (existing) {
        const sets = [];
        const params = [];
        if (kommen_zeit !== undefined) { sets.push('kommen_zeit = ?'); params.push(kommen_zeit); sets.push("kommen_quelle = 'manuell'"); }
        if (gehen_zeit  !== undefined) { sets.push('gehen_zeit = ?');  params.push(gehen_zeit);  sets.push("gehen_quelle = 'manuell'");  }
        if (sets.length) {
          params.push(existing.id);
          await runAsync(`UPDATE tagesstempel SET ${sets.join(', ')} WHERE id = ?`, params);
        }
      } else {
        const kz = kommen_zeit || null;
        const gz = gehen_zeit  || null;
        if (mitarbeiter_id) {
          await runAsync(
            `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, kommen_quelle, gehen_zeit, gehen_quelle, erstellt_am) VALUES (?, ?, ?, CASE WHEN ? IS NOT NULL THEN 'manuell' END, ?, CASE WHEN ? IS NOT NULL THEN 'manuell' END, datetime('now'))`,
            [mitarbeiter_id, datum, kz, kz, gz, gz]
          );
        } else {
          await runAsync(
            `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, kommen_quelle, gehen_zeit, gehen_quelle, erstellt_am) VALUES (?, ?, ?, CASE WHEN ? IS NOT NULL THEN 'manuell' END, ?, CASE WHEN ? IS NOT NULL THEN 'manuell' END, datetime('now'))`,
            [lehrling_id, datum, kz, kz, gz, gz]
          );
        }
      }

      broadcastEvent('tagesstempel.updated', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true });
    } catch (err) {
      console.error('[Tagesstempel-UpdateZeiten] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PATCH /api/tagesstempel/unterbrechung/:id
   * Body: { start_zeit?, ende_zeit? }
   * Ändert Start-/Endzeit einer Unterbrechung manuell.
   */
  static async updateUnterbrechung(req, res) {
    try {
      const { id } = req.params;
      const { start_zeit, ende_zeit, grund, termin_id } = req.body;
      const ZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (start_zeit && !ZEIT_RE.test(start_zeit)) return res.status(400).json({ error: 'Ungültige start_zeit' });
      if (ende_zeit  && !ZEIT_RE.test(ende_zeit))  return res.status(400).json({ error: 'Ungültige ende_zeit' });

      const existing = await getAsync(`SELECT id FROM arbeitsunterbrechungen WHERE id = ?`, [id]);
      if (!existing) return res.status(404).json({ error: 'Unterbrechung nicht gefunden' });

      const sets = [];
      const params = [];
      if (start_zeit !== undefined) { sets.push('start_zeit = ?'); params.push(start_zeit); }
      if (ende_zeit  !== undefined) { sets.push('ende_zeit = ?');  params.push(ende_zeit === '' ? null : ende_zeit); }
      if (grund      !== undefined) { sets.push('grund = ?');      params.push(grund === '' ? null : grund); }
      if (termin_id  !== undefined) { sets.push('termin_id = ?');  params.push(termin_id || null); }
      if (sets.length) {
        params.push(id);
        await runAsync(`UPDATE arbeitsunterbrechungen SET ${sets.join(', ')} WHERE id = ?`, params);
      }

      broadcastEvent('tagesstempel.unterbrechung.updated', { id: Number(id) });
      res.json({ success: true });
    } catch (err) {
      console.error('[Unterbrechung-Update] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/pause
   * Body: { mitarbeiter_id?, lehrling_id?, datum, pause_start_zeit?, pause_ende_zeit? }
   * Legt einen neuen pause_tracking-Eintrag manuell an (Nachtragen).
   */
  static async createPause(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, datum, pause_start_zeit, pause_ende_zeit } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }
      if (!datum) return res.status(400).json({ error: 'datum erforderlich' });

      const ZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (pause_start_zeit && !ZEIT_RE.test(pause_start_zeit)) return res.status(400).json({ error: 'Ungültige pause_start_zeit' });
      if (pause_ende_zeit  && !ZEIT_RE.test(pause_ende_zeit))  return res.status(400).json({ error: 'Ungültige pause_ende_zeit' });

      const abgeschlossen = (pause_start_zeit && pause_ende_zeit) ? 1 : 0;
      const result = await runAsync(
        `INSERT INTO pause_tracking (mitarbeiter_id, lehrling_id, datum, pause_start_zeit, pause_ende_zeit, abgeschlossen, erstellt_am)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [mitarbeiter_id || null, lehrling_id || null, datum, pause_start_zeit || null, pause_ende_zeit || null, abgeschlossen]
      );

      broadcastEvent('tagesstempel.pause.created', { id: result.lastID, mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, id: result.lastID });
    } catch (err) {
      console.error('[Pause-Create] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PATCH /api/tagesstempel/pause/:id
   * Body: { pause_start_zeit?, pause_ende_zeit? }
   * Aktualisiert einen bestehenden pause_tracking-Eintrag (Nachtragen/Korrigieren).
   */
  static async updatePause(req, res) {
    try {
      const { id } = req.params;
      const { pause_start_zeit, pause_ende_zeit } = req.body;

      const ZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (pause_start_zeit && !ZEIT_RE.test(pause_start_zeit)) return res.status(400).json({ error: 'Ungültige pause_start_zeit' });
      if (pause_ende_zeit  && !ZEIT_RE.test(pause_ende_zeit))  return res.status(400).json({ error: 'Ungültige pause_ende_zeit' });

      const existing = await getAsync(`SELECT id, pause_start_zeit, pause_ende_zeit FROM pause_tracking WHERE id = ?`, [id]);
      if (!existing) return res.status(404).json({ error: 'Pause nicht gefunden' });

      const sets = [];
      const params = [];
      if (pause_start_zeit !== undefined) { sets.push('pause_start_zeit = ?'); params.push(pause_start_zeit || null); }
      if (pause_ende_zeit  !== undefined) { sets.push('pause_ende_zeit = ?');  params.push(pause_ende_zeit  || null); }

      // abgeschlossen aktualisieren
      const newStart = pause_start_zeit !== undefined ? pause_start_zeit : existing.pause_start_zeit;
      const newEnde  = pause_ende_zeit  !== undefined ? pause_ende_zeit  : existing.pause_ende_zeit;
      sets.push('abgeschlossen = ?');
      params.push((newStart && newEnde) ? 1 : 0);

      if (sets.length) {
        params.push(id);
        await runAsync(`UPDATE pause_tracking SET ${sets.join(', ')} WHERE id = ?`, params);
      }

      broadcastEvent('tagesstempel.pause.updated', { id: Number(id) });
      res.json({ success: true });
    } catch (err) {
      console.error('[Pause-Update] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = TagesstempelController;
