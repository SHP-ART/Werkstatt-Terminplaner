const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class SchichtTemplateModel {
  /**
   * Alle aktiven Schicht-Templates abrufen
   */
  static async getAll() {
    const sql = `
      SELECT * FROM schicht_templates 
      WHERE aktiv = 1 
      ORDER BY sortierung ASC, name ASC
    `;
    return await allAsync(sql);
  }

  /**
   * Einzelnes Template nach ID
   */
  static async getById(id) {
    const sql = 'SELECT * FROM schicht_templates WHERE id = ?';
    return await getAsync(sql, [id]);
  }

  /**
   * Template erstellen
   */
  static async create(data) {
    const { name, beschreibung, arbeitszeit_start, arbeitszeit_ende, farbe, sortierung } = data;
    
    const sql = `
      INSERT INTO schicht_templates (name, beschreibung, arbeitszeit_start, arbeitszeit_ende, farbe, sortierung)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const result = await runAsync(sql, [
      name,
      beschreibung || null,
      arbeitszeit_start,
      arbeitszeit_ende,
      farbe || '#667eea',
      sortierung || 0
    ]);
    
    return { id: result.lastID, ...data };
  }

  /**
   * Template aktualisieren
   */
  static async update(id, data) {
    const { name, beschreibung, arbeitszeit_start, arbeitszeit_ende, farbe, sortierung, aktiv } = data;
    
    const sql = `
      UPDATE schicht_templates 
      SET name = ?, beschreibung = ?, arbeitszeit_start = ?, arbeitszeit_ende = ?, 
          farbe = ?, sortierung = ?, aktiv = ?
      WHERE id = ?
    `;
    
    await runAsync(sql, [
      name,
      beschreibung,
      arbeitszeit_start,
      arbeitszeit_ende,
      farbe,
      sortierung,
      aktiv !== undefined ? aktiv : 1,
      id
    ]);
    
    return { id, ...data };
  }

  /**
   * Template löschen (Soft-Delete)
   */
  static async delete(id) {
    const sql = 'UPDATE schicht_templates SET aktiv = 0 WHERE id = ?';
    await runAsync(sql, [id]);
    return { success: true };
  }
}

module.exports = SchichtTemplateModel;
