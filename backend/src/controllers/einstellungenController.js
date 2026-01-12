const EinstellungenModel = require('../models/einstellungenModel');
const TermineController = require('./termineController');
const path = require('path');

class EinstellungenController {
  static async getDatenbankPfad(req, res) {
    try {
      // Ermittle den aktuellen Datenbank-Pfad
      const dataPath = process.env.DATA_PATH || path.join(__dirname, '..', '..');
      const dbPath = path.join(dataPath, 'database', 'werkstatt.db');
      
      res.json({ 
        success: true,
        pfad: dbPath,
        verzeichnis: path.dirname(dbPath)
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
  static async getWerkstatt(req, res) {
    try {
      // Verwende getWerkstattSafe um API-Key zu maskieren
      const row = await EinstellungenModel.getWerkstattSafe();
      res.json(row || { 
        pufferzeit_minuten: 15, 
        servicezeit_minuten: 10, 
        ersatzauto_anzahl: 2,
        chatgpt_api_key_configured: false,
        chatgpt_api_key_masked: null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async updateWerkstatt(req, res) {
    const payload = {
      pufferzeit_minuten: req.body.pufferzeit_minuten !== undefined 
        ? parseInt(req.body.pufferzeit_minuten, 10) 
        : undefined,
      servicezeit_minuten: req.body.servicezeit_minuten !== undefined 
        ? parseInt(req.body.servicezeit_minuten, 10) 
        : undefined,
      ersatzauto_anzahl: req.body.ersatzauto_anzahl !== undefined 
        ? parseInt(req.body.ersatzauto_anzahl, 10) 
        : undefined,
      nebenzeit_prozent: req.body.nebenzeit_prozent !== undefined 
        ? parseFloat(req.body.nebenzeit_prozent) 
        : undefined,
      mittagspause_minuten: req.body.mittagspause_minuten !== undefined 
        ? parseInt(req.body.mittagspause_minuten, 10) 
        : undefined
    };

    try {
      const result = await EinstellungenModel.updateWerkstatt(payload);
      
      // Cache invalidieren, da Einstellungen (Nebenzeit, Pufferzeit, Servicezeit) die Auslastung beeinflussen
      TermineController.invalidateAuslastungCache(null);
      
      res.json({ message: 'Einstellungen aktualisiert', ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // ChatGPT API-Key speichern
  static async updateChatGPTApiKey(req, res) {
    try {
      const { api_key } = req.body;
      
      if (api_key && typeof api_key !== 'string') {
        return res.status(400).json({ error: 'Ungültiger API-Key Format' });
      }
      
      // Validiere das API-Key Format (OpenAI Keys beginnen mit "sk-")
      if (api_key && !api_key.startsWith('sk-')) {
        return res.status(400).json({ error: 'Ungültiges API-Key Format. OpenAI API-Keys beginnen mit "sk-"' });
      }
      
      const result = await EinstellungenModel.updateChatGPTApiKey(api_key || null);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // ChatGPT API-Key löschen
  static async deleteChatGPTApiKey(req, res) {
    try {
      const result = await EinstellungenModel.deleteChatGPTApiKey();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // ChatGPT API-Key testen
  static async testChatGPTApiKey(req, res) {
    try {
      const apiKey = await EinstellungenModel.getChatGPTApiKey();
      
      if (!apiKey) {
        return res.status(400).json({ 
          success: false, 
          error: 'Kein API-Key konfiguriert' 
        });
      }
      
      // Teste den API-Key mit einem einfachen Request an OpenAI
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (response.ok) {
        res.json({ 
          success: true, 
          message: 'API-Key ist gültig und funktioniert' 
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        res.status(400).json({ 
          success: false, 
          error: errorData.error?.message || `API-Fehler: ${response.status}` 
        });
      }
    } catch (err) {
      res.status(500).json({ 
        success: false, 
        error: `Verbindungsfehler: ${err.message}` 
      });
    }
  }

  static async getErsatzautoVerfuegbarkeit(req, res) {
    const { datum } = req.params;
    if (!datum) {
      return res.status(400).json({ error: 'Datum erforderlich' });
    }
    
    try {
      const result = await EinstellungenModel.getErsatzautoVerfuegbarkeit(datum);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = EinstellungenController;
