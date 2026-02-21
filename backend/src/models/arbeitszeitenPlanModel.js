const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class ArbeitszeitenPlanModel {
  /**
   * Gibt alle Arbeitszeitenmuster zurück (mit Namen)
   */
  static async getAll() {
    const query = `
      SELECT
        a.id,
        a.mitarbeiter_id,
        a.lehrling_id,
        a.wochentag,
        a.datum_von,
        a.datum_bis,
        a.arbeitsstunden,
        a.pausenzeit_minuten,
        a.ist_frei,
        a.beschreibung,
        a.erstellt_am,
        a.aktualisiert_am,
        m.name as mitarbeiter_name,
        l.name as lehrling_name
      FROM arbeitszeiten_plan a
      LEFT JOIN mitarbeiter m ON a.mitarbeiter_id = m.id
      LEFT JOIN lehrlinge l ON a.lehrling_id = l.id
      ORDER BY 
        COALESCE(a.mitarbeiter_id, -1),
        COALESCE(a.lehrling_id, -1),
        CASE WHEN a.wochentag IS NOT NULL THEN 0 ELSE 1 END,
        a.wochentag,
        a.datum_von
    `;
    return await allAsync(query, []);
  }

  /**
   * Gibt Arbeitszeitenmuster für einen Mitarbeiter zurück
   */
  static async getByMitarbeiterId(mitarbeiter_id) {
    const query = `
      SELECT * FROM arbeitszeiten_plan
      WHERE mitarbeiter_id = ?
      ORDER BY 
        CASE WHEN wochentag IS NOT NULL THEN 0 ELSE 1 END,
        wochentag,
        datum_von
    `;
    return await allAsync(query, [mitarbeiter_id]);
  }

  /**
   * Gibt Arbeitszeitenmuster für einen Lehrling zurück
   */
  static async getByLehrlingId(lehrling_id) {
    const query = `
      SELECT * FROM arbeitszeiten_plan
      WHERE lehrling_id = ?
      ORDER BY 
        CASE WHEN wochentag IS NOT NULL THEN 0 ELSE 1 END,
        wochentag,
        datum_von
    `;
    return await allAsync(query, [lehrling_id]);
  }

  /**
   * Gibt Arbeitszeitenmuster für eine Person (Mitarbeiter oder Lehrling) zurück
   */
  static async getByPerson(mitarbeiter_id, lehrling_id) {
    if (mitarbeiter_id) {
      return await this.getByMitarbeiterId(mitarbeiter_id);
    } else if (lehrling_id) {
      return await this.getByLehrlingId(lehrling_id);
    }
    return [];
  }

  /**
   * Berechnet die effektiven Arbeitsstunden für ein spezifisches Datum
   * Priorität: Spezifisches Datum > Wochentag-Muster > Standard
   */
  static async getForDate(mitarbeiter_id, lehrling_id, datum) {
    // Datumsobjekt für Wochentag-Berechnung (1=Mo, 2=Di, ..., 7=So)
    const dateObj = new Date(datum);
    const wochentag = dateObj.getDay() === 0 ? 7 : dateObj.getDay();

    // 1. Versuche spezifischen Datumseintrag zu finden
    const spezifischQuery = `
      SELECT * FROM arbeitszeiten_plan
      WHERE 
        ${mitarbeiter_id ? 'mitarbeiter_id = ?' : 'lehrling_id = ?'}
        AND wochentag IS NULL
        AND ? BETWEEN datum_von AND COALESCE(datum_bis, datum_von)
      LIMIT 1
    `;
    const spezifisch = await getAsync(spezifischQuery, [mitarbeiter_id || lehrling_id, datum]);
    if (spezifisch) {
      return spezifisch;
    }

    // 2. Fallback auf Wochentag-Muster
    const musterQuery = `
      SELECT * FROM arbeitszeiten_plan
      WHERE 
        ${mitarbeiter_id ? 'mitarbeiter_id = ?' : 'lehrling_id = ?'}
        AND wochentag = ?
      LIMIT 1
    `;
    const muster = await getAsync(musterQuery, [mitarbeiter_id || lehrling_id, wochentag]);
    if (muster) {
      return muster;
    }

    // 3. Kein Eintrag gefunden - null zurückgeben (Caller nutzt dann Standard-Wochenarbeitszeit)
    return null;
  }

  /**
   * Gibt alle Arbeitszeitenmuster für einen Datumsbereich zurück
   */
  static async getByDateRange(mitarbeiter_id, lehrling_id, datum_von, datum_bis) {
    const query = `
      SELECT * FROM arbeitszeiten_plan
      WHERE 
        ${mitarbeiter_id ? 'mitarbeiter_id = ?' : 'lehrling_id = ?'}
        AND (
          (wochentag IS NOT NULL) OR
          (datum_von <= ? AND COALESCE(datum_bis, datum_von) >= ?) OR
          (datum_von >= ? AND datum_von <= ?)
        )
      ORDER BY 
        CASE WHEN wochentag IS NOT NULL THEN 0 ELSE 1 END,
        wochentag,
        datum_von
    `;
    return await allAsync(query, [
      mitarbeiter_id || lehrling_id,
      datum_bis, datum_von,
      datum_von, datum_bis
    ]);
  }

  /**
   * Erstellt oder aktualisiert ein Wochentag-Muster
   */
  static async upsertWochentagMuster(data) {
    const { mitarbeiter_id, lehrling_id, wochentag, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung, arbeitszeit_start, arbeitszeit_ende } = data;

    // Falls keine explizite Endzeit angegeben: aus Arbeitsstunden berechnen
    const startStr = arbeitszeit_start || '08:00';
    let endeStr = arbeitszeit_ende;
    if (!endeStr || endeStr === startStr) {
      const [sh, sm] = startStr.split(':').map(Number);
      const totalMin = sm + ((arbeitsstunden || 0) * 60) + (ist_frei ? 0 : (pausenzeit_minuten || 30));
      const eh = sh + Math.floor(totalMin / 60);
      const em = totalMin % 60;
      endeStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
    }

    const query = `
      INSERT INTO arbeitszeiten_plan 
      (mitarbeiter_id, lehrling_id, wochentag, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung, arbeitszeit_start, arbeitszeit_ende, aktualisiert_am)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(
        COALESCE(mitarbeiter_id, -1), 
        COALESCE(lehrling_id, -1), 
        wochentag
      ) WHERE wochentag IS NOT NULL
      DO UPDATE SET
        arbeitsstunden = excluded.arbeitsstunden,
        pausenzeit_minuten = excluded.pausenzeit_minuten,
        ist_frei = excluded.ist_frei,
        beschreibung = excluded.beschreibung,
        arbeitszeit_start = excluded.arbeitszeit_start,
        arbeitszeit_ende = excluded.arbeitszeit_ende,
        aktualisiert_am = CURRENT_TIMESTAMP
    `;

    const result = await runAsync(query, [
      mitarbeiter_id || null,
      lehrling_id || null,
      wochentag,
      arbeitsstunden,
      pausenzeit_minuten || 30,
      ist_frei || 0,
      beschreibung || null,
      startStr,
      endeStr
    ]);

    return { id: result.lastID, changes: result.changes };
  }

  /**
   * Erstellt einen spezifischen Datumseintrag
   */
  static async createDateEntry(data) {
    const { mitarbeiter_id, lehrling_id, datum_von, datum_bis, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung } = data;

    // Validierung: datum_von muss in der Zukunft liegen
    const heute = new Date().toISOString().split('T')[0];
    if (datum_von < heute) {
      throw new Error('Arbeitszeiteneintrag kann nur für die Zukunft erstellt werden');
    }

    const query = `
      INSERT INTO arbeitszeiten_plan 
      (mitarbeiter_id, lehrling_id, datum_von, datum_bis, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await runAsync(query, [
      mitarbeiter_id || null,
      lehrling_id || null,
      datum_von,
      datum_bis || datum_von,
      arbeitsstunden,
      pausenzeit_minuten || 30,
      ist_frei || 0,
      beschreibung || null
    ]);

    return { id: result.lastID, changes: result.changes };
  }

  /**
   * Aktualisiert einen spezifischen Eintrag (nur Zukunft!)
   */
  static async update(id, data) {
    const { arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung, datum_von, datum_bis } = data;

    // Prüfe ob Eintrag in der Zukunft liegt
    const eintrag = await getAsync('SELECT * FROM arbeitszeiten_plan WHERE id = ?', [id]);
    if (!eintrag) {
      throw new Error('Eintrag nicht gefunden');
    }

    if (eintrag.datum_von) {
      const heute = new Date().toISOString().split('T')[0];
      if (eintrag.datum_von < heute) {
        throw new Error('Historische Arbeitszeiteneinträge können nicht bearbeitet werden');
      }
    }

    const updates = [];
    const values = [];

    if (arbeitsstunden !== undefined) {
      updates.push('arbeitsstunden = ?');
      values.push(arbeitsstunden);
    }
    if (pausenzeit_minuten !== undefined) {
      updates.push('pausenzeit_minuten = ?');
      values.push(pausenzeit_minuten);
    }
    if (ist_frei !== undefined) {
      updates.push('ist_frei = ?');
      values.push(ist_frei);
    }
    if (beschreibung !== undefined) {
      updates.push('beschreibung = ?');
      values.push(beschreibung);
    }
    if (datum_von !== undefined) {
      updates.push('datum_von = ?');
      values.push(datum_von);
    }
    if (datum_bis !== undefined) {
      updates.push('datum_bis = ?');
      values.push(datum_bis);
    }

    if (updates.length === 0) {
      throw new Error('Keine Felder zum Aktualisieren angegeben');
    }

    updates.push('aktualisiert_am = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `UPDATE arbeitszeiten_plan SET ${updates.join(', ')} WHERE id = ?`;
    const result = await runAsync(query, values);

    return { changes: result.changes };
  }

  /**
   * Löscht einen Eintrag
   */
  static async delete(id) {
    const result = await runAsync('DELETE FROM arbeitszeiten_plan WHERE id = ?', [id]);
    return { changes: result.changes };
  }

  /**
   * Löscht alle Wochentag-Muster für eine Person (für Reset auf Standard)
   */
  static async deleteAllMusterForPerson(mitarbeiter_id, lehrling_id) {
    const query = `
      DELETE FROM arbeitszeiten_plan
      WHERE ${mitarbeiter_id ? 'mitarbeiter_id = ?' : 'lehrling_id = ?'}
      AND wochentag IS NOT NULL
    `;
    const result = await runAsync(query, [mitarbeiter_id || lehrling_id]);
    return { changes: result.changes };
  }

  /**
   * Gibt einen einzelnen Eintrag zurück
   */
  static async getById(id) {
    return await getAsync('SELECT * FROM arbeitszeiten_plan WHERE id = ?', [id]);
  }
}

module.exports = ArbeitszeitenPlanModel;
