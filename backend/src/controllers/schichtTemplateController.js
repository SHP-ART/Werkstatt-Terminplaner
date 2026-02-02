const SchichtTemplateModel = require('../models/schichtTemplateModel');

class SchichtTemplateController {
  /**
   * GET /api/schicht-templates
   * Alle Templates abrufen
   */
  static async getAll(req, res) {
    try {
      const templates = await SchichtTemplateModel.getAll();
      res.json(templates);
    } catch (error) {
      console.error('Fehler beim Abrufen der Schicht-Templates:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Schicht-Templates' });
    }
  }

  /**
   * GET /api/schicht-templates/:id
   * Einzelnes Template abrufen
   */
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const template = await SchichtTemplateModel.getById(id);
      
      if (!template) {
        return res.status(404).json({ error: 'Template nicht gefunden' });
      }
      
      res.json(template);
    } catch (error) {
      console.error('Fehler beim Abrufen des Templates:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen des Templates' });
    }
  }

  /**
   * POST /api/schicht-templates
   * Neues Template erstellen
   */
  static async create(req, res) {
    try {
      const { name, beschreibung, arbeitszeit_start, arbeitszeit_ende, farbe, sortierung } = req.body;
      
      if (!name || !arbeitszeit_start || !arbeitszeit_ende) {
        return res.status(400).json({ error: 'Name, Start- und Endzeit sind erforderlich' });
      }
      
      const template = await SchichtTemplateModel.create(req.body);
      res.status(201).json(template);
    } catch (error) {
      console.error('Fehler beim Erstellen des Templates:', error);
      res.status(500).json({ error: 'Fehler beim Erstellen des Templates' });
    }
  }

  /**
   * PUT /api/schicht-templates/:id
   * Template aktualisieren
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const template = await SchichtTemplateModel.update(id, req.body);
      res.json(template);
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Templates:', error);
      res.status(500).json({ error: 'Fehler beim Aktualisieren des Templates' });
    }
  }

  /**
   * DELETE /api/schicht-templates/:id
   * Template löschen
   */
  static async delete(req, res) {
    try {
      const { id } = req.params;
      await SchichtTemplateModel.delete(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Fehler beim Löschen des Templates:', error);
      res.status(500).json({ error: 'Fehler beim Löschen des Templates' });
    }
  }
}

module.exports = SchichtTemplateController;
