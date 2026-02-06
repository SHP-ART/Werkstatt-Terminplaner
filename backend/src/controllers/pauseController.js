/**
 * Pause Controller
 * 
 * Verwaltet Mittagspausen für Mitarbeiter und Lehrlinge:
 * - Pausenstart mit Terminverschiebung
 * - Automatisches Pause-Ende nach individueller Pausenzeit (pausenzeit_minuten aus DB)
 * - Pause-Status-Abfrage
 */

const { db } = require('../config/database');
const TermineModel = require('../models/termineModel');

class PauseController {
  /**
   * Hilfsfunktion: db.all als Promise
   */
  static dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Hilfsfunktion: db.get als Promise
   */
  static dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Hilfsfunktion: db.run als Promise
   */
  static dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  /**
   * Cleanup abgelaufener Pausen
   * Wird beim Server-Start und alle 5 Minuten aufgerufen
   */
  static async cleanupAbgelaufenePausen() {
    try {
      const now = new Date();
      
      // Finde alle aktiven Pausen (abgeschlossen=0)
      const aktivePausen = await PauseController.dbAll(`
        SELECT 
          id, mitarbeiter_id, lehrling_id, 
          pause_start_zeit, pause_naechster_termin_id
        FROM pause_tracking
        WHERE abgeschlossen = 0
      `);

      let beendet = 0;

      for (const pause of aktivePausen) {
        // Individuelle Pausenzeit aus DB laden
        let pausenDauer = 30; // Fallback
        if (pause.mitarbeiter_id) {
          const ma = await PauseController.dbGet('SELECT pausenzeit_minuten FROM mitarbeiter WHERE id = ?', [pause.mitarbeiter_id]);
          if (ma && ma.pausenzeit_minuten) pausenDauer = ma.pausenzeit_minuten;
        } else if (pause.lehrling_id) {
          const le = await PauseController.dbGet('SELECT pausenzeit_minuten FROM lehrlinge WHERE id = ?', [pause.lehrling_id]);
          if (le && le.pausenzeit_minuten) pausenDauer = le.pausenzeit_minuten;
        }

        const startZeit = new Date(pause.pause_start_zeit);
        const pausenEnde = new Date(startZeit.getTime() + pausenDauer * 60 * 1000); // +individuelle Pausenzeit

        if (now >= pausenEnde) {
          // Pause ist abgelaufen
          await PauseController.dbRun(`
            UPDATE pause_tracking
            SET abgeschlossen = 1, pause_ende_zeit = ?
            WHERE id = ?
          `, [now.toISOString(), pause.id]);

          // Setze nächsten Termin auf "in_arbeit"
          if (pause.pause_naechster_termin_id) {
            await PauseController.dbRun(`
              UPDATE termine
              SET status = 'in_arbeit'
              WHERE id = ? AND status != 'abgeschlossen'
            `, [pause.pause_naechster_termin_id]);

            console.log(`[Pause-Cleanup] Termin ${pause.pause_naechster_termin_id} auto-gestartet`);
          }

          beendet++;
        }
      }

      if (beendet > 0) {
        console.log(`[Pause-Cleanup] ${beendet} Pause(n) beendet`);
      }

      return beendet;
    } catch (error) {
      console.error('[Pause-Cleanup] Fehler:', error);
      return 0;
    }
  }

  /**
   * POST /api/pause/starten
   * Startet eine Pause für Mitarbeiter/Lehrling
   */
  static async starten(req, res) {
    try {
      const { personId, personTyp, datum } = req.body;

      if (!personId || !personTyp || !datum) {
        return res.status(400).json({
          error: 'Fehlende Parameter: personId, personTyp, datum erforderlich'
        });
      }

      // 1. Lade Person-Daten für mittagspause_start und pausenzeit_minuten
      const personTable = personTyp === 'mitarbeiter' ? 'mitarbeiter' : 'lehrlinge';
      const person = await PauseController.dbGet(`
        SELECT id, name, mittagspause_start, pausenzeit_minuten
        FROM ${personTable}
        WHERE id = ?
      `, [personId]);

      if (!person) {
        return res.status(404).json({ error: 'Person nicht gefunden' });
      }

      // 2. Prüfe ob bereits aktive Pause existiert
      const aktivePause = await PauseController.dbGet(`
        SELECT id FROM pause_tracking
        WHERE ${personTyp === 'mitarbeiter' ? 'mitarbeiter_id' : 'lehrling_id'} = ?
          AND abgeschlossen = 0
      `, [personId]);

      if (aktivePause) {
        return res.status(409).json({ error: 'Pause läuft bereits' });
      }

      // 3. Lade alle offenen Termine des Datums
      const termine = await PauseController.dbAll(`
        SELECT 
          id, arbeitszeiten_details, startzeit, endzeit_berechnet,
          status
        FROM termine
        WHERE datum = ?
          AND (status = 'geplant' OR status = 'in_arbeit')
          AND geloescht_am IS NULL
        ORDER BY startzeit ASC
      `, [datum]);

      // 4. Filtere Termine nach _gesamt_mitarbeiter_id
      const eigeneTermine = [];
      let naechsterTerminId = null;

      for (const termin of termine) {
        if (termin.arbeitszeiten_details) {
          try {
            const details = JSON.parse(termin.arbeitszeiten_details);
            const gesamt = details._gesamt_mitarbeiter_id;
            
            if (gesamt) {
              const istEigener = (
                (personTyp === 'mitarbeiter' && gesamt.type === 'mitarbeiter' && gesamt.id === personId) ||
                (personTyp === 'lehrling' && gesamt.type === 'lehrling' && gesamt.id === personId)
              );

              if (istEigener) {
                eigeneTermine.push(termin);
                if (!naechsterTerminId && termin.status === 'geplant') {
                  naechsterTerminId = termin.id;
                }
              }
            }
          } catch (e) {
            console.error('Fehler beim Parsen von arbeitszeiten_details:', e);
          }
        }
      }

      if (eigeneTermine.length === 0) {
        console.log('Keine eigenen Termine gefunden - Pause wird trotzdem gestartet (keine Verschiebung nötig)');
        // Keine Termine zum Verschieben, aber Pause kann trotzdem gestartet werden
      }

      // 5. Verschiebe eigene Termine und unterbreche laufende Termine
      const jetzt = new Date();
      const jetztZeit = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;

      for (const termin of eigeneTermine) {
        // Prüfe ob Termin läuft (status = 'in_arbeit')
        if (termin.status === 'in_arbeit') {
          try {
            // Laufenden Termin unterbrechen
            let details = {};
            if (termin.arbeitszeiten_details) {
              details = JSON.parse(termin.arbeitszeiten_details);
            }
            
            // Speichere Pausenunterbrechung
            details._pause_unterbrochen_bei = jetztZeit;
            details._pause_start_zeit = jetzt.toISOString();
            
            // Verschiebe Endzeit um individuelle Pausendauer
            const pausenDauer = person.pausenzeit_minuten || 30;
            const neueEndzeit = termin.endzeit_berechnet ? addMinutesToTime(termin.endzeit_berechnet, pausenDauer) : null;

            await PauseController.dbRun(`
              UPDATE termine
              SET endzeit_berechnet = ?, arbeitszeiten_details = ?
              WHERE id = ?
            `, [neueEndzeit, JSON.stringify(details), termin.id]);

            console.log(`[Pause-Start] Laufender Termin ${termin.id} unterbrochen um ${jetztZeit}`);
          } catch (e) {
            console.error('Fehler beim Unterbrechen des laufenden Termins:', e);
          }
        } else if (termin.startzeit && termin.startzeit >= jetztZeit) {
          // Verschiebe nur zukünftige Termine um individuelle Pausendauer
          const pausenDauer = person.pausenzeit_minuten || 30;
          const neueStartzeit = addMinutesToTime(termin.startzeit, pausenDauer);
          const neueEndzeit = termin.endzeit_berechnet ? addMinutesToTime(termin.endzeit_berechnet, pausenDauer) : null;

          await PauseController.dbRun(`
            UPDATE termine
            SET startzeit = ?, endzeit_berechnet = ?
            WHERE id = ?
          `, [neueStartzeit, neueEndzeit, termin.id]);
        }
      }

      // 6. Erstelle Pause-Eintrag
      const pauseStartZeit = jetzt.toISOString();
      const mitarbeiterId = personTyp === 'mitarbeiter' ? personId : null;
      const lehrlingId = personTyp === 'lehrling' ? personId : null;

      const result = await PauseController.dbRun(`
        INSERT INTO pause_tracking (
          mitarbeiter_id, lehrling_id, pause_start_zeit,
          pause_naechster_termin_id, datum, abgeschlossen
        ) VALUES (?, ?, ?, ?, ?, 0)
      `, [mitarbeiterId, lehrlingId, pauseStartZeit, naechsterTerminId, datum]);

      res.json({
        success: true,
        pause_tracking_id: result.lastID,
        verschobene_termine: eigeneTermine.length,
        naechster_termin_id: naechsterTerminId,
        pause_start_zeit: pauseStartZeit
      });

    } catch (error) {
      console.error('[Pause-Start] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Starten der Pause', details: error.message });
    }
  }

  /**
   * GET /api/pause/aktive
   * Gibt alle aktiven Pausen zurück (abgeschlossen=0)
   */
  static async getAktive(req, res) {
    try {
      const aktivePausen = await PauseController.dbAll(`
        SELECT 
          pt.id,
          pt.mitarbeiter_id,
          pt.lehrling_id,
          pt.pause_start_zeit,
          pt.pause_naechster_termin_id,
          pt.datum,
          CASE 
            WHEN pt.mitarbeiter_id IS NOT NULL THEN m.name
            ELSE l.name
          END as person_name
        FROM pause_tracking pt
        LEFT JOIN mitarbeiter m ON pt.mitarbeiter_id = m.id
        LEFT JOIN lehrlinge l ON pt.lehrling_id = l.id
        WHERE pt.abgeschlossen = 0
      `);

      // Berechne verbleibende Zeit
      const now = new Date();
      const resultPausen = [];
      for (const pause of aktivePausen) {
        // Individuelle Pausenzeit aus DB laden
        let pausenDauer = 30; // Fallback
        if (pause.mitarbeiter_id) {
          const ma = await PauseController.dbGet('SELECT pausenzeit_minuten FROM mitarbeiter WHERE id = ?', [pause.mitarbeiter_id]);
          if (ma && ma.pausenzeit_minuten) pausenDauer = ma.pausenzeit_minuten;
        } else if (pause.lehrling_id) {
          const le = await PauseController.dbGet('SELECT pausenzeit_minuten FROM lehrlinge WHERE id = ?', [pause.lehrling_id]);
          if (le && le.pausenzeit_minuten) pausenDauer = le.pausenzeit_minuten;
        }

        const startZeit = new Date(pause.pause_start_zeit);
        const pausenEnde = new Date(startZeit.getTime() + pausenDauer * 60 * 1000);
        const verbleibendeMs = pausenEnde.getTime() - now.getTime();
        const verbleibendeMinuten = Math.max(0, Math.ceil(verbleibendeMs / (60 * 1000)));

        resultPausen.push({
          ...pause,
          verbleibende_minuten: verbleibendeMinuten,
          pause_ende_zeit: pausenEnde.toISOString()
        });
      }

      res.json(resultPausen);
    } catch (error) {
      console.error('[Pause-Aktive] Fehler:', error);
      res.status(500).json({ error: 'Fehler beim Laden der Pausen', details: error.message });
    }
  }
}

/**
 * Hilfsfunktion: Addiere Minuten zu HH:MM Zeit
 */
function addMinutesToTime(time, minutes) {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

module.exports = PauseController;
