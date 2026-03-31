const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class ArbeitszeitenModel {
  static async getAll() {
    return await allAsync('SELECT * FROM arbeitszeiten ORDER BY bezeichnung', []);
  }

  static async update(id, data) {
    const { standard_minuten, bezeichnung, aliase } = data;

    // Baue die SQL-Query dynamisch auf, je nachdem welche Felder vorhanden sind
    const updates = [];
    const values = [];

    if (standard_minuten !== undefined) {
      updates.push('standard_minuten = ?');
      values.push(standard_minuten);
    }

    if (bezeichnung !== undefined) {
      updates.push('bezeichnung = ?');
      values.push(bezeichnung);
    }

    if (aliase !== undefined) {
      updates.push('aliase = ?');
      values.push(aliase);
    }

    if (updates.length === 0) {
      throw new Error('Keine Felder zum Aktualisieren');
    }

    values.push(id);

    const result = await runAsync(
      `UPDATE arbeitszeiten SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return { changes: result.changes };
  }

  static async create(arbeit) {
    const { bezeichnung, standard_minuten, aliase } = arbeit;
    return await runAsync(
      'INSERT INTO arbeitszeiten (bezeichnung, standard_minuten, aliase) VALUES (?, ?, ?)',
      [bezeichnung, standard_minuten, aliase || '']
    );
  }

  static async delete(id) {
    const result = await runAsync('DELETE FROM arbeitszeiten WHERE id = ?', [id]);
    return { changes: result.changes };
  }

  // Fuzzy-Matching: Prüft ob ein Suchbegriff zu einer Bezeichnung oder deren Aliasen passt
  // Unterstützt: exakte Treffer, Teilwort-Treffer, normalisierte Vergleiche
  static _normalizeForMatch(text) {
    return text.toLowerCase()
      .replace(/[\/\-_\.]+/g, ' ')  // So/Wi → So Wi, Brems-Service → Brems Service
      .replace(/\s+/g, ' ')
      .trim();
  }

  static _fuzzyMatch(suchBegriff, bezeichnung, aliase) {
    const normSuche = ArbeitszeitenModel._normalizeForMatch(suchBegriff);
    const normBezeichnung = ArbeitszeitenModel._normalizeForMatch(bezeichnung);

    // 1. Exakte Übereinstimmung (normalisiert)
    if (normSuche === normBezeichnung) return true;

    // 2. Teilwort-Suche: Suchbegriff ist in Bezeichnung enthalten oder umgekehrt
    if (normBezeichnung.includes(normSuche) || normSuche.includes(normBezeichnung)) return true;

    // 3. Wort-Überlappung: Mindestens ein signifikantes Wort stimmt überein
    const suchWorte = normSuche.split(' ').filter(w => w.length >= 3);
    const bezWorte = normBezeichnung.split(' ').filter(w => w.length >= 3);
    if (suchWorte.length > 0 && bezWorte.length > 0) {
      const ueberlappung = suchWorte.filter(sw => 
        bezWorte.some(bw => bw.includes(sw) || sw.includes(bw))
      );
      if (ueberlappung.length > 0) return true;
    }

    // 4. Alias-Prüfung (exakt und Teilwort)
    if (aliase) {
      const aliasListe = aliase.split(',').map(a => ArbeitszeitenModel._normalizeForMatch(a));
      for (const alias of aliasListe) {
        if (!alias) continue;
        if (alias === normSuche) return true;
        if (alias.includes(normSuche) || normSuche.includes(alias)) return true;
        // Wort-Überlappung mit Alias
        const aliasWorte = alias.split(' ').filter(w => w.length >= 3);
        if (suchWorte.length > 0 && aliasWorte.length > 0) {
          const ueberlappung = suchWorte.filter(sw =>
            aliasWorte.some(aw => aw.includes(sw) || sw.includes(aw))
          );
          if (ueberlappung.length > 0) return true;
        }
      }
    }

    return false;
  }

  static async findByBezeichnung(bezeichnung) {
    // Suche zuerst nach exakter Bezeichnung (schnellster Pfad)
    const row = await getAsync(
      'SELECT * FROM arbeitszeiten WHERE LOWER(bezeichnung) = LOWER(?)',
      [bezeichnung]
    );
    
    if (row) return row;
    
    // Falls nicht gefunden, suche in Aliasen (exakt)
    const rows = await allAsync('SELECT * FROM arbeitszeiten', []);
    const suchBegriff = bezeichnung.toLowerCase();
    
    for (const arbeit of rows) {
      if (arbeit.aliase) {
        const aliasListe = arbeit.aliase.split(',').map(a => a.trim().toLowerCase());
        if (aliasListe.includes(suchBegriff)) {
          return arbeit;
        }
      }
    }

    // Fuzzy-Matching: Teilwort, normalisiert, Wort-Überlappung
    for (const arbeit of rows) {
      if (ArbeitszeitenModel._fuzzyMatch(bezeichnung, arbeit.bezeichnung, arbeit.aliase)) {
        return arbeit;
      }
    }

    return null;
  }

  static async updateByBezeichnung(bezeichnung, neueStandardzeit) {
    // Gewichteter Durchschnitt: 70% alte Zeit, 30% neue Zeit
    // Suche zuerst exakt
    let row = await getAsync(
      'SELECT * FROM arbeitszeiten WHERE LOWER(bezeichnung) = LOWER(?)',
      [bezeichnung]
    );

    // Falls nicht exakt gefunden, über Alias und Fuzzy-Match suchen
    if (!row) {
      row = await ArbeitszeitenModel.findByBezeichnung(bezeichnung);
    }

    if (!row) {
      return { changes: 0, message: 'Arbeit nicht gefunden' };
    }

    const alteZeit = row.standard_minuten || 30;
    const gewichteteZeit = Math.round((alteZeit * 0.7) + (neueStandardzeit * 0.3));

    const result = await runAsync(
      'UPDATE arbeitszeiten SET standard_minuten = ? WHERE id = ?',
      [gewichteteZeit, row.id]
    );
    
    return {
      changes: result.changes,
      alte_zeit: alteZeit,
      neue_zeit: gewichteteZeit,
      tatsaechliche_zeit: neueStandardzeit,
      bezeichnung: row.bezeichnung
    };
  }
}

module.exports = ArbeitszeitenModel;
