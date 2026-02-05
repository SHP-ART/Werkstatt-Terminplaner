const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

// Einfache Verschlüsselung für API-Keys (Base64 mit Prefix)
const encryptApiKey = (key) => {
  if (!key) return null;
  return 'enc:' + Buffer.from(key).toString('base64');
};

const decryptApiKey = (encrypted) => {
  if (!encrypted) return null;
  if (encrypted.startsWith('enc:')) {
    return Buffer.from(encrypted.slice(4), 'base64').toString('utf8');
  }
  return encrypted; // Fallback für alte, unverschlüsselte Keys
};

// Maskiert einen API-Key für die Anzeige (zeigt nur die letzten 4 Zeichen)
const maskApiKey = (key) => {
  if (!key) return null;
  if (key.length <= 8) return '****';
  return '****' + key.slice(-4);
};

class EinstellungenModel {
  static async getWerkstatt() {
    try {
      const result = await getAsync('SELECT * FROM werkstatt_einstellungen WHERE id = 1', []);
      
      // Falls keine Einstellungen existieren, Standardwerte einfügen
      if (!result) {
        await runAsync(
          `INSERT OR IGNORE INTO werkstatt_einstellungen (
            id, pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl,
            nebenzeit_prozent, mittagspause_minuten
          ) VALUES (1, 15, 10, 2, 0, 30)`
        );
        return await getAsync('SELECT * FROM werkstatt_einstellungen WHERE id = 1', []);
      }
      
      return result;
    } catch (err) {
      console.error('Fehler beim Abrufen von werkstatt_einstellungen:', err);
      console.error('HINWEIS: Bitte stellen Sie sicher, dass alle Migrationen ausgeführt wurden.');
      throw new Error('Datenbankfehler beim Abrufen der Einstellungen');
    }
  }

  // Holt die Einstellungen mit maskiertem API-Key (für Frontend-Anzeige)
  static async getWerkstattSafe() {
    const settings = await this.getWerkstatt();
    if (settings && settings.chatgpt_api_key) {
      const decrypted = decryptApiKey(settings.chatgpt_api_key);
      settings.chatgpt_api_key_masked = maskApiKey(decrypted);
      settings.chatgpt_api_key_configured = !!decrypted;
      delete settings.chatgpt_api_key; // Entferne den echten Key
    } else {
      settings.chatgpt_api_key_masked = null;
      settings.chatgpt_api_key_configured = false;
    }
    // KI-Funktionen Status (Standard: aktiviert)
    if (settings) {
      settings.ki_enabled = settings.ki_enabled !== undefined ? !!settings.ki_enabled : true;
      settings.realtime_enabled = settings.realtime_enabled !== undefined ? !!settings.realtime_enabled : true;
      settings.ki_mode = settings.ki_mode || (settings.chatgpt_api_key_configured ? 'openai' : 'local');
      settings.ki_external_url = settings.ki_external_url || null;
      settings.smart_scheduling_enabled = settings.smart_scheduling_enabled !== undefined
        ? !!settings.smart_scheduling_enabled
        : true;
      settings.anomaly_detection_enabled = settings.anomaly_detection_enabled !== undefined
        ? !!settings.anomaly_detection_enabled
        : true;
    }
    return settings;
  }

  // KI-Funktionen aktivieren/deaktivieren
  static async updateKIEnabled(enabled) {
    const kiEnabled = enabled ? 1 : 0;
    
    const result = await runAsync(
      `UPDATE werkstatt_einstellungen SET ki_enabled = ? WHERE id = 1`,
      [kiEnabled]
    );

    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen (id, ki_enabled) VALUES (1, ?)`,
        [kiEnabled]
      );
    }
    
    return { success: true, ki_enabled: !!enabled, message: enabled ? 'KI-Funktionen aktiviert' : 'KI-Funktionen deaktiviert' };
  }

  // KI-Modus aktualisieren (local/openai/external)
  static async updateKIMode(mode) {
    const allowed = new Set(['local', 'openai', 'external']);
    if (!allowed.has(mode)) {
      throw new Error('Ungültiger KI-Modus');
    }

    const result = await runAsync(
      `UPDATE werkstatt_einstellungen SET ki_mode = ? WHERE id = 1`,
      [mode]
    );

    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen (id, ki_mode) VALUES (1, ?)`,
        [mode]
      );
    }

    return { success: true, ki_mode: mode, message: `KI-Modus gesetzt: ${mode}` };
  }

  // Externe KI-URL aktualisieren (Fallback wenn Auto-Discovery fehlschlaegt)
  static async updateKIExternalUrl(url) {
    const value = url || null;
    const result = await runAsync(
      `UPDATE werkstatt_einstellungen SET ki_external_url = ? WHERE id = 1`,
      [value]
    );

    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen (id, ki_external_url) VALUES (1, ?)`,
        [value]
      );
    }

    return { success: true, ki_external_url: value, message: 'Externe KI-URL gespeichert' };
  }

  // Echtzeit-Updates aktivieren/deaktivieren
  static async updateRealtimeEnabled(enabled) {
    const realtimeEnabled = enabled ? 1 : 0;

    const result = await runAsync(
      `UPDATE werkstatt_einstellungen SET realtime_enabled = ? WHERE id = 1`,
      [realtimeEnabled]
    );

    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen (id, realtime_enabled) VALUES (1, ?)`,
        [realtimeEnabled]
      );
    }

    return {
      success: true,
      realtime_enabled: !!enabled,
      message: enabled ? 'Echtzeit-Updates aktiviert' : 'Echtzeit-Updates deaktiviert'
    };
  }

  // Smart Scheduling aktivieren/deaktivieren
  static async updateSmartSchedulingEnabled(enabled) {
    const smartEnabled = enabled ? 1 : 0;

    const result = await runAsync(
      `UPDATE werkstatt_einstellungen SET smart_scheduling_enabled = ? WHERE id = 1`,
      [smartEnabled]
    );

    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen (id, smart_scheduling_enabled) VALUES (1, ?)`,
        [smartEnabled]
      );
    }

    return {
      success: true,
      smart_scheduling_enabled: !!enabled,
      message: enabled ? 'Smart Scheduling aktiviert' : 'Smart Scheduling deaktiviert'
    };
  }

  // Anomalie-Erkennung aktivieren/deaktivieren
  static async updateAnomalyDetectionEnabled(enabled) {
    const anomalyEnabled = enabled ? 1 : 0;

    const result = await runAsync(
      `UPDATE werkstatt_einstellungen SET anomaly_detection_enabled = ? WHERE id = 1`,
      [anomalyEnabled]
    );

    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen (id, anomaly_detection_enabled) VALUES (1, ?)`,
        [anomalyEnabled]
      );
    }

    return {
      success: true,
      anomaly_detection_enabled: !!enabled,
      message: enabled ? 'Anomalie-Erkennung aktiviert' : 'Anomalie-Erkennung deaktiviert'
    };
  }

  // Holt den entschlüsselten API-Key (nur für interne Verwendung)
  static async getChatGPTApiKey() {
    const settings = await this.getWerkstatt();
    if (settings && settings.chatgpt_api_key) {
      return decryptApiKey(settings.chatgpt_api_key);
    }
    return null;
  }

  // Speichert den ChatGPT API-Key verschlüsselt
  static async updateChatGPTApiKey(apiKey) {
    const encrypted = encryptApiKey(apiKey);
    
    const result = await runAsync(
      `UPDATE werkstatt_einstellungen SET chatgpt_api_key = ? WHERE id = 1`,
      [encrypted]
    );

    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen (id, chatgpt_api_key) VALUES (1, ?)`,
        [encrypted]
      );
    }
    
    return { success: true, message: apiKey ? 'API-Key gespeichert' : 'API-Key gelöscht' };
  }

  // Löscht den ChatGPT API-Key
  static async deleteChatGPTApiKey() {
    return await this.updateChatGPTApiKey(null);
  }

  static async updateWerkstatt(data) {
    const { pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl, nebenzeit_prozent, mittagspause_minuten } = data;
    
    // Lade erst die aktuellen Werte, um unveränderte Felder beizubehalten
    const current = await this.getWerkstatt();
    
    // Verwende neue Werte wenn vorhanden, sonst behalte aktuelle Werte, sonst Standardwerte
    const pufferzeit = pufferzeit_minuten !== undefined 
      ? parseInt(pufferzeit_minuten, 10) 
      : (current && current.pufferzeit_minuten !== undefined ? current.pufferzeit_minuten : 15);
    const servicezeit = servicezeit_minuten !== undefined 
      ? parseInt(servicezeit_minuten, 10) 
      : (current && current.servicezeit_minuten !== undefined ? current.servicezeit_minuten : 10);
    const ersatzautos = ersatzauto_anzahl !== undefined
      ? parseInt(ersatzauto_anzahl, 10)
      : (current && current.ersatzauto_anzahl !== undefined ? current.ersatzauto_anzahl : 2);
    const nebenzeit = nebenzeit_prozent !== undefined
      ? parseFloat(nebenzeit_prozent)
      : (current && current.nebenzeit_prozent !== undefined ? current.nebenzeit_prozent : 0);
    const mittagspause = mittagspause_minuten !== undefined
      ? parseInt(mittagspause_minuten, 10)
      : (current && current.mittagspause_minuten !== undefined ? current.mittagspause_minuten : 30);

    const result = await runAsync(
      `UPDATE werkstatt_einstellungen
       SET pufferzeit_minuten = ?, servicezeit_minuten = ?, ersatzauto_anzahl = ?, nebenzeit_prozent = ?, mittagspause_minuten = ?
       WHERE id = 1`,
      [pufferzeit, servicezeit, ersatzautos, nebenzeit, mittagspause]
    );

    // Falls kein Datensatz existiert, lege ihn an.
    if (result.changes === 0) {
      await runAsync(
        `INSERT OR REPLACE INTO werkstatt_einstellungen
         (id, pufferzeit_minuten, servicezeit_minuten, ersatzauto_anzahl, nebenzeit_prozent, mittagspause_minuten)
         VALUES (1, ?, ?, ?, ?, ?)`,
        [pufferzeit, servicezeit, ersatzautos, nebenzeit, mittagspause]
      );
    }
    
    return { changes: result.changes };
  }

  // Zähle Ersatzautos die an einem bestimmten Tag vergeben sind
  static async getErsatzautoVerfuegbarkeit(datum) {
    // Hole Gesamtanzahl Ersatzautos
    const settings = await this.getWerkstatt();
    
    const gesamtAnzahl = settings?.ersatzauto_anzahl || 2;
    
    // Zähle wie viele Termine an diesem Tag ein Ersatzauto haben
    const row = await getAsync(
      `SELECT COUNT(*) as vergeben FROM termine 
       WHERE datum = ? AND ersatzauto = 1 AND status != 'storniert' AND geloescht = 0`,
      [datum]
    );
    
    const vergeben = row?.vergeben || 0;
    const verfuegbar = Math.max(gesamtAnzahl - vergeben, 0);
    
    return {
      gesamt: gesamtAnzahl,
      vergeben: vergeben,
      verfuegbar: verfuegbar,
      istVerfuegbar: verfuegbar > 0
    };
  }
}

module.exports = EinstellungenModel;
