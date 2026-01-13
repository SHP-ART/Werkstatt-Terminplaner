const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class ErsatzautosModel {
  static async getAll() {
    return await allAsync('SELECT * FROM ersatzautos ORDER BY name ASC', []);
  }

  // Manuelle Sperrung umschalten (mit optionalem Bis-Datum)
  static async toggleManuellGesperrt(id) {
    // Behandle NULL als 0 (nicht gesperrt)
    await runAsync(
      'UPDATE ersatzautos SET manuell_gesperrt = CASE WHEN COALESCE(manuell_gesperrt, 0) = 1 THEN 0 ELSE 1 END, gesperrt_bis = NULL WHERE id = ?',
      [id]
    );
    // Hole das aktualisierte Auto zurück
    return await ErsatzautosModel.getById(id);
  }

  // Manuelle Sperrung direkt setzen
  static async setManuellGesperrt(id, gesperrt) {
    await runAsync(
      'UPDATE ersatzautos SET manuell_gesperrt = ?, gesperrt_bis = NULL WHERE id = ?',
      [gesperrt ? 1 : 0, id]
    );
    return await ErsatzautosModel.getById(id);
  }

  // Zeitbasierte Sperrung setzen (sperren bis zu einem bestimmten Datum) mit Sperrgrund
  static async sperrenBis(id, bisDatum, sperrgrund = null) {
    const heute = new Date().toISOString().split('T')[0];
    await runAsync(
      'UPDATE ersatzautos SET manuell_gesperrt = 1, gesperrt_bis = ?, sperrgrund = ?, gesperrt_seit = ? WHERE id = ?',
      [bisDatum, sperrgrund, heute, id]
    );
    return await ErsatzautosModel.getById(id);
  }

  // Sperrung aufheben
  static async entsperren(id) {
    await runAsync(
      'UPDATE ersatzautos SET manuell_gesperrt = 0, gesperrt_bis = NULL, sperrgrund = NULL, gesperrt_seit = NULL WHERE id = ?',
      [id]
    );
    return await ErsatzautosModel.getById(id);
  }

  static async getActive() {
    return await allAsync('SELECT * FROM ersatzautos WHERE aktiv = 1 ORDER BY name ASC', []);
  }

  static async getById(id) {
    return await getAsync('SELECT * FROM ersatzautos WHERE id = ?', [id]);
  }

  static async create(data) {
    const { kennzeichen, name, typ, aktiv } = data;
    const result = await runAsync(
      'INSERT INTO ersatzautos (kennzeichen, name, typ, aktiv) VALUES (?, ?, ?, ?)',
      [kennzeichen, name, typ || null, aktiv !== undefined ? aktiv : 1]
    );
    return { id: result.lastID, ...data };
  }

  static async update(id, data) {
    const { kennzeichen, name, typ, aktiv } = data;
    await runAsync(
      'UPDATE ersatzautos SET kennzeichen = ?, name = ?, typ = ?, aktiv = ? WHERE id = ?',
      [kennzeichen, name, typ || null, aktiv !== undefined ? aktiv : 1, id]
    );
    return await ErsatzautosModel.getById(id);
  }

  static async delete(id) {
    const result = await runAsync('DELETE FROM ersatzautos WHERE id = ?', [id]);
    return { changes: result.changes };
  }

  static async getAnzahlAktiv() {
    const row = await getAsync('SELECT COUNT(*) as anzahl FROM ersatzautos WHERE aktiv = 1', []);
    return row.anzahl;
  }

  // Anzahl aktiver UND nicht gesperrter Autos (berücksichtigt gesperrt_bis Datum)
  static async getAnzahlVerfuegbar(datum = null) {
    const heute = datum || new Date().toISOString().split('T')[0];
    // Ein Auto ist verfügbar wenn:
    // - manuell_gesperrt = 0 ODER
    // - manuell_gesperrt = 1 aber gesperrt_bis < heute (Sperrung abgelaufen)
    const row = await getAsync(
      `SELECT COUNT(*) as anzahl FROM ersatzautos 
       WHERE aktiv = 1 
       AND (
         manuell_gesperrt = 0 
         OR manuell_gesperrt IS NULL 
         OR (manuell_gesperrt = 1 AND gesperrt_bis IS NOT NULL AND gesperrt_bis < ?)
       )`,
      [heute]
    );
    return row.anzahl;
  }

  // Anzahl manuell gesperrter Autos (nur aktive Sperren)
  static async getAnzahlGesperrt(datum = null) {
    const heute = datum || new Date().toISOString().split('T')[0];
    // Ein Auto ist gesperrt wenn:
    // - manuell_gesperrt = 1 UND (gesperrt_bis ist NULL ODER gesperrt_bis >= heute)
    const row = await getAsync(
      `SELECT COUNT(*) as anzahl FROM ersatzautos 
       WHERE aktiv = 1 
       AND manuell_gesperrt = 1
       AND (gesperrt_bis IS NULL OR gesperrt_bis >= ?)`,
      [heute]
    );
    return row.anzahl;
  }

  // Verfügbarkeit für ein bestimmtes Datum prüfen
  // Berücksichtigt jetzt auch mehrtägige Buchungen UND manuell gesperrte Autos
  static async getVerfuegbarkeit(datum) {
    // Erst die Anzahl aktiver UND nicht gesperrter Autos holen (für das spezifische Datum)
    const verfuegbareAutos = await ErsatzautosModel.getAnzahlVerfuegbar(datum);
    
    // Auch Gesamtzahl aktiver Autos für Anzeige
    const gesamt = await ErsatzautosModel.getAnzahlAktiv();
    
    // Anzahl gesperrter Autos (für das spezifische Datum)
    const gesperrt = await ErsatzautosModel.getAnzahlGesperrt(datum);

    // Zähle wie viele Ersatzautos an diesem Tag vergeben sind
    // ersatzauto_bis_datum hat PRIORITÄT vor ersatzauto_tage!
    const query = `
      SELECT COUNT(*) as vergeben FROM termine 
      WHERE ersatzauto = 1 
      AND status != 'storniert'
      AND geloescht_am IS NULL
      AND datum <= ?
      AND (
        CASE 
          WHEN ersatzauto_bis_datum IS NOT NULL THEN ersatzauto_bis_datum
          WHEN abholung_datum IS NOT NULL THEN abholung_datum
          WHEN ersatzauto_tage IS NOT NULL THEN date(datum, '+' || (ersatzauto_tage - 1) || ' days')
          ELSE datum
        END >= ?
      )
    `;
    
    const row = await getAsync(query, [datum, datum]);
    const vergeben = row?.vergeben || 0;
    // Verfügbar = nicht gesperrte Autos - vergebene Autos
    return {
      gesamt,
      gesperrt,
      vergeben,
      verfuegbar: Math.max(0, verfuegbareAutos - vergeben)
    };
  }

  // Detaillierte Verfügbarkeit mit Fahrzeug-Info
  static async getVerfuegbarkeitDetails(datum) {
    const alleAutos = await ErsatzautosModel.getActive();
    
    // Hole alle Termine mit Ersatzauto an diesem Tag (inkl. mehrtägige)
    // ersatzauto_bis_datum hat PRIORITÄT!
    const query = `
        SELECT t.*, 
               COALESCE(k.name, t.kunde_name) as kunde_name,
               k.telefon as kunde_telefon
        FROM termine t
        LEFT JOIN kunden k ON t.kunde_id = k.id
        WHERE t.ersatzauto = 1 
        AND t.status != 'storniert'
        AND t.geloescht_am IS NULL
        AND t.datum <= ?
        AND (
          CASE 
            WHEN t.ersatzauto_bis_datum IS NOT NULL THEN t.ersatzauto_bis_datum
            WHEN t.abholung_datum IS NOT NULL THEN t.abholung_datum
            WHEN t.ersatzauto_tage IS NOT NULL THEN date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days')
            ELSE t.datum
          END >= ?
        )
        ORDER BY t.datum ASC
      `;
    
    const termineAmTag = await allAsync(query, [datum, datum]);
    
    return {
      autos: alleAutos,
      vergeben: termineAmTag.length,
      verfuegbar: Math.max(0, alleAutos.length - termineAmTag.length),
      termine: termineAmTag
    };
  }

  // Alle aktuellen Buchungen (heute und laufende) holen
  static async getAktuelleBuchungen() {
    const heute = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT t.id, t.termin_nr, t.kennzeichen, t.datum, 
             t.ersatzauto_tage, t.ersatzauto_bis_datum, t.ersatzauto_bis_zeit,
             t.abholung_datum, t.abholung_zeit, t.bring_zeit, t.status,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             -- Berechne End-Datum (ersatzauto_bis_datum hat Priorität!)
             CASE 
               WHEN t.ersatzauto_bis_datum IS NOT NULL THEN t.ersatzauto_bis_datum
               WHEN t.abholung_datum IS NOT NULL THEN t.abholung_datum
               WHEN t.ersatzauto_tage IS NOT NULL THEN date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days')
               ELSE t.datum
             END as bis_datum
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.ersatzauto = 1 
      AND t.status NOT IN ('storniert', 'erledigt')
      AND t.geloescht_am IS NULL
      AND t.datum <= ?
      -- End-Datum muss heute oder später sein (ersatzauto_bis_datum hat PRIORITÄT!)
      AND (
        CASE 
          WHEN t.ersatzauto_bis_datum IS NOT NULL THEN t.ersatzauto_bis_datum
          WHEN t.abholung_datum IS NOT NULL THEN t.abholung_datum
          WHEN t.ersatzauto_tage IS NOT NULL THEN date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days')
          ELSE t.datum
        END >= ?
      )
      ORDER BY t.datum ASC
    `;
    
    return await allAsync(query, [heute, heute]);
  }

  // Heute fällige Rückgaben holen
  static async getHeuteRueckgaben() {
    const heute = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT t.id, t.termin_nr, t.kennzeichen, t.datum, 
             t.ersatzauto_tage, t.ersatzauto_bis_datum, t.ersatzauto_bis_zeit,
             t.abholung_datum, t.abholung_zeit, t.status,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             -- Berechne End-Datum
             CASE 
               WHEN t.ersatzauto_bis_datum IS NOT NULL THEN t.ersatzauto_bis_datum
               WHEN t.abholung_datum IS NOT NULL THEN t.abholung_datum
               WHEN t.ersatzauto_tage IS NOT NULL THEN date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days')
               ELSE t.datum
             END as bis_datum,
             -- Rückgabe-Zeit ermitteln
             CASE 
               WHEN t.ersatzauto_bis_zeit IS NOT NULL THEN t.ersatzauto_bis_zeit
               WHEN t.abholung_zeit IS NOT NULL THEN t.abholung_zeit
               ELSE '18:00'
             END as rueckgabe_zeit
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.ersatzauto = 1 
      AND t.status NOT IN ('storniert', 'erledigt')
      AND t.geloescht_am IS NULL
      AND (
        -- Rückgabe heute: ersatzauto_bis_datum = heute
        t.ersatzauto_bis_datum = ?
        -- ODER abholung_datum = heute
        OR t.abholung_datum = ?
        -- ODER berechnet aus ersatzauto_tage
        OR (t.ersatzauto_tage IS NOT NULL AND date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days') = ?)
        -- ODER eintägiger Termin heute
        OR (t.datum = ? AND t.ersatzauto_bis_datum IS NULL AND t.abholung_datum IS NULL AND t.ersatzauto_tage IS NULL)
      )
      ORDER BY rueckgabe_zeit ASC
    `;
    
    return await allAsync(query, [heute, heute, heute, heute]);
  }

  // Buchungen im angegebenen Zeitraum finden (für Sperrwarnung)
  static async getBuchungenImZeitraum(vonDatum, bisDatum) {
    const query = `
      SELECT t.id, t.termin_nr, t.kennzeichen, t.datum, 
             t.ersatzauto_tage, t.ersatzauto_bis_datum,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             -- Berechne End-Datum
             CASE 
               WHEN t.ersatzauto_bis_datum IS NOT NULL THEN t.ersatzauto_bis_datum
               WHEN t.abholung_datum IS NOT NULL THEN t.abholung_datum
               WHEN t.ersatzauto_tage IS NOT NULL THEN date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days')
               ELSE t.datum
             END as bis_datum
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.ersatzauto = 1 
      AND t.status NOT IN ('storniert', 'erledigt')
      AND t.geloescht_am IS NULL
      AND (
        -- Termin überschneidet sich mit dem Sperrzeitraum
        (t.datum <= ? AND (
          t.ersatzauto_bis_datum >= ?
          OR t.abholung_datum >= ?
          OR (t.ersatzauto_tage IS NOT NULL AND date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days') >= ?)
          OR (t.ersatzauto_bis_datum IS NULL AND t.abholung_datum IS NULL AND t.ersatzauto_tage IS NULL AND t.datum >= ?)
        ))
      )
      ORDER BY t.datum ASC
    `;
    
    return await allAsync(query, [bisDatum, vonDatum, vonDatum, vonDatum, vonDatum]);
  }

  // Ersatzauto-Buchung als früh zurückgegeben markieren (setzt ersatzauto_bis_datum auf gestern)
  static async markiereAlsZurueckgegeben(terminId) {
    const gestern = new Date();
    gestern.setDate(gestern.getDate() - 1);
    const gesternStr = gestern.toISOString().split('T')[0];
    
    await runAsync(
      `UPDATE termine SET ersatzauto_bis_datum = ? WHERE id = ? AND ersatzauto = 1`,
      [gesternStr, terminId]
    );
    
    return await getAsync('SELECT * FROM termine WHERE id = ?', [terminId]);
  }
}
module.exports = ErsatzautosModel;