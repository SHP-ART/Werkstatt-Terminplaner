class ApiService {
  /**
   * Retry-Konfiguration für Backend-Verfügbarkeit
   */
  static RETRY_CONFIG = {
    maxRetries: 3,
    initialDelay: 500,    // 500ms
    maxDelay: 4000,       // 4s
    backoffMultiplier: 2
  };

  /**
   * Prüft ob Backend bereit ist (Health-Check)
   */
  static async checkHealth(maxAttempts = 5) {
    const baseUrl = CONFIG.API_URL.endsWith('/') ? CONFIG.API_URL.slice(0, -1) : CONFIG.API_URL;
    const healthUrl = `${baseUrl}/api/health`;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(healthUrl, { 
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.status === 200) {
          return true; // Backend ist bereit
        }
        
        if (response.status === 503) {
          // Backend läuft, aber DB initialisiert noch
          console.log(`⏳ Backend initialisiert noch (Versuch ${attempt}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        return false; // Unerwarteter Status
      } catch (error) {
        console.log(`🔄 Health-Check Versuch ${attempt}/${maxAttempts} fehlgeschlagen`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    return false;
  }

  /**
   * Führt Request mit Retry-Logik durch
   */
  static async requestWithRetry(endpoint, options = {}, retryCount = 0) {
    try {
      return await this.request(endpoint, options);
    } catch (error) {
      const shouldRetry = (
        (error.status === 503) || // Service Unavailable
        (error.isNetworkError) ||  // Netzwerkfehler
        (error.code === 'DB_NOT_READY') // DB noch nicht bereit
      );
      
      if (shouldRetry && retryCount < this.RETRY_CONFIG.maxRetries) {
        const delay = Math.min(
          this.RETRY_CONFIG.initialDelay * Math.pow(this.RETRY_CONFIG.backoffMultiplier, retryCount),
          this.RETRY_CONFIG.maxDelay
        );
        
        console.log(`🔄 Retry ${retryCount + 1}/${this.RETRY_CONFIG.maxRetries} nach ${delay}ms...`);
        
        // Bei 503 zusätzlich Health-Check machen
        if (error.status === 503) {
          const isHealthy = await this.checkHealth(2);
          if (!isHealthy) {
            throw new Error('Backend bleibt nicht verfügbar - bitte Backend prüfen');
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry(endpoint, options, retryCount + 1);
      }
      
      throw error; // Keine Retries mehr oder nicht retry-fähiger Fehler
    }
  }

  static async request(endpoint, options = {}) {
    // Prüfe ob CONFIG verfügbar ist
    if (typeof CONFIG === 'undefined' || typeof CONFIG.API_URL === 'undefined') {
      const error = new Error('API-Konfiguration nicht verfügbar. Bitte Seite neu laden.');
      console.error('API Service Error: CONFIG ist nicht verfügbar', error);
      throw error;
    }
    // URL korrekt konstruieren (doppelte Slashes vermeiden)
    const baseUrl = CONFIG.API_URL.endsWith('/') ? CONFIG.API_URL.slice(0, -1) : CONFIG.API_URL;
    const endpointPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${endpointPath}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        const error = new Error(errorData.error || 'API-Fehler');
        error.status = response.status;
        error.data = errorData;
        throw error;
      }

      return await response.json();
    } catch (error) {
      console.error('API Request Error:', error);
      
      // Verbesserte Fehlerbehandlung für Netzwerkfehler
      if (error.name === 'TypeError' && (error.message.includes('fetch') || error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
        // Netzwerkfehler (Backend nicht erreichbar, CORS, etc.)
        const networkError = new Error(`Verbindung zum Server fehlgeschlagen. Bitte prüfen Sie, ob das Backend läuft und erreichbar ist. (${url})`);
        networkError.isNetworkError = true;
        networkError.originalError = error;
        networkError.url = url;
        throw networkError;
      }
      
      // Wenn der Fehler bereits eine Status-Eigenschaft hat, ist es ein HTTP-Fehler
      if (error.status) {
        throw error;
      }
      
      // Unbekannter Fehler
      throw error;
    }
  }

  static async get(endpoint) {
    return this.requestWithRetry(endpoint, { method: 'GET' });
  }

  static async post(endpoint, data) {
    return this.requestWithRetry(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  static async put(endpoint, data) {
    return this.requestWithRetry(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  static async delete(endpoint) {
    return this.requestWithRetry(endpoint, { method: 'DELETE' });
  }
}

class KundenService {
  static async getAll() {
    return ApiService.get('/kunden');
  }

  static async getById(id) {
    return ApiService.get(`/kunden/${id}`);
  }

  static async create(kunde) {
    return ApiService.post('/kunden', kunde);
  }

  static async import(kunden) {
    return ApiService.post('/kunden/import', kunden);
  }

  static async update(id, kunde) {
    return ApiService.put(`/kunden/${id}`, kunde);
  }

  static async delete(id) {
    return ApiService.delete(`/kunden/${id}`);
  }

  static async search(searchTerm) {
    return ApiService.get(`/kunden/search?search=${encodeURIComponent(searchTerm)}`);
  }

  // Alle Fahrzeuge (Kennzeichen) eines Kunden abrufen
  static async getFahrzeuge(kundeId) {
    return ApiService.get(`/kunden/${kundeId}/fahrzeuge`);
  }

  // Fahrzeug zu einem Kunden hinzufügen
  static async addFahrzeug(kundeId, fahrzeug) {
    return ApiService.post(`/kunden/${kundeId}/fahrzeuge`, fahrzeug);
  }

  // Fahrzeug eines Kunden löschen
  static async deleteFahrzeug(kundeId, kennzeichen) {
    return ApiService.delete(`/kunden/${kundeId}/fahrzeuge/${encodeURIComponent(kennzeichen)}`);
  }

  // Fahrzeugdaten aktualisieren
  static async updateFahrzeug(kundeId, altesKennzeichen, neuesDaten) {
    return ApiService.put(`/kunden/${kundeId}/fahrzeuge/${encodeURIComponent(altesKennzeichen)}`, neuesDaten);
  }

  // Gesamtanzahl aller Fahrzeuge
  static async countFahrzeuge() {
    return ApiService.get('/kunden/stats/fahrzeuge');
  }
}

class TermineService {
  static async getAll(datum = null) {
    const query = datum ? `?datum=${datum}` : '';
    const result = await ApiService.get(`/termine${query}`);
    // Backend gibt bei Datum-Filter { termine: [...], aktivePausen: [...] } zurück
    if (result && result.termine && Array.isArray(result.termine)) {
      return result.termine;
    }
    // Ohne Datum oder bei Pagination kommt ein Array oder Objekt mit data
    if (result && result.data && Array.isArray(result.data)) {
      return result.data;
    }
    return Array.isArray(result) ? result : [];
  }

  /**
   * Gibt Termine mit aktivePausen für ein Datum zurück (für Auslastung etc.)
   */
  static async getAllMitPausen(datum) {
    const result = await ApiService.get(`/termine?datum=${datum}`);
    if (result && result.termine) {
      return { termine: result.termine, aktivePausen: result.aktivePausen || [] };
    }
    return { termine: Array.isArray(result) ? result : [], aktivePausen: [] };
  }

  /**
   * Optimierter Endpoint für Teile-Status-Übersicht
   * Gibt nur Termine mit Teile-Status zurück (bereits serverseitig gefiltert)
   */
  static async getTeileStatus() {
    return ApiService.get('/termine/teile-status');
  }

  static async getById(id) {
    return ApiService.get(`/termine/${id}`);
  }

  static async create(termin) {
    return ApiService.post('/termine', termin);
  }

  static async update(id, data) {
    return ApiService.put(`/termine/${id}`, data);
  }

  static async delete(id) {
    return ApiService.delete(`/termine/${id}`);
  }

  // Papierkorb-Funktionen
  static async getDeleted() {
    return ApiService.get('/termine/papierkorb');
  }

  static async restore(id) {
    return ApiService.post(`/termine/${id}/restore`, {});
  }

  static async permanentDelete(id) {
    return ApiService.delete(`/termine/${id}/permanent`);
  }

  static async checkAvailability(datum, dauer) {
    return ApiService.get(`/termine/verfuegbarkeit?datum=${datum}&dauer=${dauer}`);
  }

  static async validate(termin) {
    return ApiService.post('/termine/validate', termin);
  }

  static async getVorschlaege(datum, dauer) {
    return ApiService.get(`/termine/vorschlaege?datum=${datum}&dauer=${dauer}`);
  }

  /**
   * Prüft Bringzeit-Überschneidungen für ein Datum und eine Zeit
   * Gibt Termine zurück, die ±15 Minuten um die angegebene Zeit liegen
   */
  static async getBringzeitUeberschneidungen(datum, bringzeit, excludeTerminId = null) {
    let url = `/termine/bringzeit-ueberschneidungen?datum=${datum}&bringzeit=${bringzeit}`;
    if (excludeTerminId) {
      url += `&exclude=${excludeTerminId}`;
    }
    return ApiService.get(url);
  }

  /**
   * Prüft ob es bereits Termine für einen Kunden am gleichen Tag gibt
   * @param {string} datum - Das Datum im Format YYYY-MM-DD
   * @param {number|null} kundeId - Die Kunden-ID (optional)
   * @param {string|null} kundeName - Der Kundenname (falls keine ID)
   * @param {number|null} excludeId - Optional: Termin-ID die ausgeschlossen werden soll
   * @returns {Promise<{hatDuplikate: boolean, anzahl: number, termine: Array}>}
   */
  static async checkDuplikate(datum, kundeId, kundeName, excludeId = null) {
    let url = `/termine/duplikat-check?datum=${datum}`;
    if (kundeId) {
      url += `&kunde_id=${kundeId}`;
    } else if (kundeName) {
      url += `&kunde_name=${encodeURIComponent(kundeName)}`;
    }
    if (excludeId) {
      url += `&exclude_id=${excludeId}`;
    }
    return ApiService.get(url);
  }

  // Schwebend-Funktionen (Termin noch nicht fest eingeplant)
  static async setSchwebend(id, istSchwebend) {
    return ApiService.post(`/termine/${id}/schwebend`, { ist_schwebend: istSchwebend });
  }

  // Termin-Split-Funktionen (Termin aufteilen auf mehrere Tage)
  static async splitTermin(id, teil1Zeit, teil2Datum, teil2Zeit) {
    return ApiService.post(`/termine/${id}/split`, {
      teil1_zeit: teil1Zeit,
      teil2_datum: teil2Datum,
      teil2_zeit: teil2Zeit
    });
  }

  static async getSplitTermine(id) {
    return ApiService.get(`/termine/${id}/split-termine`);
  }

  // =====================================================
  // AUFTRAGSERWEITERUNG FUNKTIONEN
  // =====================================================

  /**
   * Prüft Konflikte für eine geplante Erweiterung
   */
  static async pruefeErweiterungsKonflikte(terminId, minuten) {
    return ApiService.get(`/termine/${terminId}/erweiterung/konflikte?minuten=${minuten}`);
  }

  /**
   * Findet verfügbare Mitarbeiter für einen Zeitraum
   */
  static async findeVerfuegbareMitarbeiter(datum, startzeit, dauer) {
    return ApiService.get(`/termine/erweiterung/verfuegbare-mitarbeiter?datum=${datum}&startzeit=${startzeit}&dauer=${dauer}`);
  }

  /**
   * Erstellt eine Auftragserweiterung
   */
  static async erweiterungErstellen(terminId, erweiterungsDaten) {
    return ApiService.post(`/termine/${terminId}/erweiterung`, erweiterungsDaten);
  }

  /**
   * Lädt alle Erweiterungen eines Termins
   */
  static async getErweiterungen(terminId) {
    return ApiService.get(`/termine/${terminId}/erweiterungen`);
  }

  /**
   * Zählt Erweiterungen eines Termins
   */
  static async countErweiterungen(terminId) {
    return ApiService.get(`/termine/${terminId}/erweiterungen/count`);
  }
}

class ArbeitszeitenService {
  static async getAll() {
    return ApiService.get('/arbeitszeiten');
  }

  static async update(id, data) {
    return ApiService.put(`/arbeitszeiten/${id}`, data);
  }

  static async create(arbeit) {
    return ApiService.post('/arbeitszeiten', arbeit);
  }

  static async delete(id) {
    return ApiService.delete(`/arbeitszeiten/${id}`);
  }
}

class AuslastungService {
  static async getByDatum(datum) {
    return ApiService.get(`/auslastung/${datum}`);
  }

  static async getByDateRange(startDatum, endDatum) {
    // Wenn Start- und Enddatum identisch sind, nutze getByDatum
    if (startDatum === endDatum) {
      return this.getByDatum(startDatum);
    }
    // Ansonsten hole beide Daten und kombiniere sie
    const [start, end] = await Promise.all([
      this.getByDatum(startDatum),
      this.getByDatum(endDatum)
    ]);
    return { start, end };
  }
}

class EinstellungenService {
  static async getWerkstatt() {
    return ApiService.get('/einstellungen/werkstatt');
  }

  static async updateWerkstatt(data) {
    return ApiService.put('/einstellungen/werkstatt', data);
  }

  static async getErsatzautoVerfuegbarkeit(datum) {
    return ApiService.get(`/einstellungen/ersatzauto/${datum}`);
  }

  // ChatGPT API-Key Methoden
  static async updateChatGPTApiKey(apiKey) {
    return ApiService.put('/einstellungen/chatgpt-api-key', { api_key: apiKey });
  }

  static async deleteChatGPTApiKey() {
    return ApiService.delete('/einstellungen/chatgpt-api-key');
  }

  static async testChatGPTApiKey() {
    return ApiService.get('/einstellungen/chatgpt-api-key/test');
  }

  // KI-Funktionen aktivieren/deaktivieren
  static async updateKIEnabled(enabled) {
    return ApiService.put('/einstellungen/ki-enabled', { enabled });
  }

  // KI-Modus aktualisieren (local/openai/external)
  static async updateKIMode(mode) {
    return ApiService.put('/einstellungen/ki-mode', { mode });
  }

  // Externe KI-URL speichern (Fallback)
  static async updateKIExternalUrl(url) {
    return ApiService.put('/einstellungen/ki-external-url', { url });
  }

  // Echtzeit-Updates aktivieren/deaktivieren
  static async updateRealtimeEnabled(enabled) {
    return ApiService.put('/einstellungen/realtime-enabled', { enabled });
  }

  // Smart Scheduling aktivieren/deaktivieren
  static async updateSmartSchedulingEnabled(enabled) {
    return ApiService.put('/einstellungen/smart-scheduling-enabled', { enabled });
  }

  // Anomalie-Erkennung aktivieren/deaktivieren
  static async updateAnomalyDetectionEnabled(enabled) {
    return ApiService.put('/einstellungen/anomaly-detection-enabled', { enabled });
  }

  // Legacy-Methoden für alte Abwesenheiten-Tabelle
  static async getAbwesenheit(datum) {
    return ApiService.get(`/abwesenheiten/legacy/${datum}`);
  }

  static async updateAbwesenheit(datum, data) {
    return ApiService.put(`/abwesenheiten/legacy/${datum}`, data);
  }

  // Neue Methoden für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
  static async getAllAbwesenheiten() {
    return ApiService.get('/abwesenheiten');
  }

  static async getAbwesenheitenByDateRange(datumVon, datumBis) {
    return ApiService.get(`/abwesenheiten/range?datum_von=${datumVon}&datum_bis=${datumBis}`);
  }

  static async createAbwesenheit(data) {
    return ApiService.post('/abwesenheiten', data);
  }

  static async deleteAbwesenheit(id) {
    return ApiService.delete(`/abwesenheiten/${id}`);
  }

  static async getAbwesenheitById(id) {
    return ApiService.get(`/abwesenheiten/${id}`);
  }
}

class ArbeitszeitenPlanService {
  // Alle Arbeitszeitenmuster
  static async getAll() {
    return ApiService.get('/arbeitszeiten-plan');
  }

  // Arbeitszeitenmuster für einen Mitarbeiter
  static async getByMitarbeiterId(mitarbeiterId) {
    return ApiService.get(`/arbeitszeiten-plan/mitarbeiter/${mitarbeiterId}`);
  }

  // Arbeitszeitenmuster für einen Lehrling
  static async getByLehrlingId(lehrlingId) {
    return ApiService.get(`/arbeitszeiten-plan/lehrling/${lehrlingId}`);
  }

  // Effektive Arbeitszeit für ein spezifisches Datum
  static async getForDate(mitarbeiterId, lehrlingId, datum) {
    const params = datum ? `&datum=${datum}` : '';
    if (mitarbeiterId) {
      return ApiService.get(`/arbeitszeiten-plan/for-date?mitarbeiter_id=${mitarbeiterId}${params}`);
    } else if (lehrlingId) {
      return ApiService.get(`/arbeitszeiten-plan/for-date?lehrling_id=${lehrlingId}${params}`);
    }
    throw new Error('Entweder mitarbeiterId oder lehrlingId erforderlich');
  }

  // Arbeitszeitenmuster für Zeitraum
  static async getByDateRange(mitarbeiterId, lehrlingId, datumVon, datumBis) {
    const params = `datum_von=${datumVon}&datum_bis=${datumBis}`;
    if (mitarbeiterId) {
      return ApiService.get(`/arbeitszeiten-plan/range?mitarbeiter_id=${mitarbeiterId}&${params}`);
    } else if (lehrlingId) {
      return ApiService.get(`/arbeitszeiten-plan/range?lehrling_id=${lehrlingId}&${params}`);
    }
    throw new Error('Entweder mitarbeiterId oder lehrlingId erforderlich');
  }

  // Wochentag-Muster erstellen/aktualisieren
  static async upsertWochentagMuster(data) {
    return ApiService.post('/arbeitszeiten-plan/muster', data);
  }

  // Spezifischen Datumseintrag erstellen
  static async createDateEntry(data) {
    return ApiService.post('/arbeitszeiten-plan/datum', data);
  }

  // Eintrag aktualisieren
  static async update(id, data) {
    return ApiService.put(`/arbeitszeiten-plan/${id}`, data);
  }

  // Eintrag löschen
  static async delete(id) {
    return ApiService.delete(`/arbeitszeiten-plan/${id}`);
  }

  // Auf Standard zurücksetzen
  static async resetToStandard(typ, id) {
    return ApiService.delete(`/arbeitszeiten-plan/reset/${typ}/${id}`);
  }

  // Einzelnen Eintrag laden
  static async getById(id) {
    return ApiService.get(`/arbeitszeiten-plan/${id}`);
  }
}

class MitarbeiterService {
  static async getAll() {
    return ApiService.get('/mitarbeiter');
  }

  static async getAktive() {
    return ApiService.get('/mitarbeiter/aktive');
  }

  static async getById(id) {
    return ApiService.get(`/mitarbeiter/${id}`);
  }

  static async create(mitarbeiter) {
    return ApiService.post('/mitarbeiter', mitarbeiter);
  }

  static async update(id, mitarbeiter) {
    return ApiService.put(`/mitarbeiter/${id}`, mitarbeiter);
  }

  static async delete(id) {
    return ApiService.delete(`/mitarbeiter/${id}`);
  }
}

class LehrlingeService {
  static async getAll() {
    return ApiService.get('/lehrlinge');
  }

  static async getAktive() {
    return ApiService.get('/lehrlinge/aktive');
  }

  static async getById(id) {
    return ApiService.get(`/lehrlinge/${id}`);
  }

  static async create(lehrling) {
    return ApiService.post('/lehrlinge', lehrling);
  }

  static async update(id, lehrling) {
    return ApiService.put(`/lehrlinge/${id}`, lehrling);
  }

  static async delete(id) {
    return ApiService.delete(`/lehrlinge/${id}`);
  }
}

class BackupService {
  static async status() {
    return ApiService.get('/backup/status');
  }

  static async list() {
    return ApiService.get('/backup/list');
  }

  static async create() {
    return ApiService.post('/backup/create', {});
  }

  static async restore(filename) {
    return ApiService.post('/backup/restore', { filename });
  }

  static async upload({ filename, fileBase64, restoreNow = false }) {
    return ApiService.post('/backup/upload', { filename, fileBase64, restoreNow });
  }
}

class ErsatzautosService {
  static async getAll() {
    return ApiService.get('/ersatzautos');
  }

  static async getActive() {
    return ApiService.get('/ersatzautos/aktiv');
  }

  static async getById(id) {
    return ApiService.get(`/ersatzautos/${id}`);
  }

  static async create(auto) {
    return ApiService.post('/ersatzautos', auto);
  }

  static async update(id, auto) {
    return ApiService.put(`/ersatzautos/${id}`, auto);
  }

  static async delete(id) {
    return ApiService.delete(`/ersatzautos/${id}`);
  }

  static async getVerfuegbarkeit(datum) {
    return ApiService.get(`/ersatzautos/verfuegbarkeit/${datum}`);
  }

  static async getVerfuegbarkeitDetails(datum) {
    return ApiService.get(`/ersatzautos/verfuegbarkeit/${datum}/details`);
  }

  static async getAktuelleBuchungen() {
    return ApiService.get('/ersatzautos/buchungen/aktuell');
  }

  // Buchungen im Zeitraum prüfen (für Sperrwarnung)
  static async getBuchungenImZeitraum(von, bis) {
    return ApiService.get(`/ersatzautos/buchungen/zeitraum?von=${von}&bis=${bis}`);
  }

  // Heute fällige Rückgaben
  static async getHeuteRueckgaben() {
    return ApiService.get('/ersatzautos/rueckgaben/heute');
  }

  // Manuelle Sperrung umschalten (Toggle)
  static async toggleManuellGesperrt(id) {
    return ApiService.post(`/ersatzautos/${id}/toggle-gesperrt`);
  }

  // Manuelle Sperrung direkt setzen
  static async setManuellGesperrt(id, gesperrt) {
    return ApiService.put(`/ersatzautos/${id}/gesperrt`, { gesperrt });
  }

  // Zeitbasierte Sperrung setzen (sperren bis zu einem bestimmten Datum) mit Sperrgrund
  static async sperrenBis(id, bisDatum, sperrgrund = null) {
    return ApiService.post(`/ersatzautos/${id}/sperren-bis`, { bisDatum, sperrgrund });
  }

  // Sperrung aufheben
  static async entsperren(id) {
    return ApiService.post(`/ersatzautos/${id}/entsperren`);
  }

  // Buchung als früh zurückgegeben markieren
  static async markiereAlsZurueckgegeben(terminId) {
    return ApiService.post(`/ersatzautos/buchung/${terminId}/zurueckgegeben`);
  }
}

// Phasen-Service für mehrtägige Arbeiten (z.B. Unfallreparatur)
class PhasenService {
  static async getByTerminId(terminId) {
    return ApiService.get(`/phasen/termin/${terminId}`);
  }

  static async getByDatum(datum) {
    return ApiService.get(`/phasen/datum/${datum}`);
  }

  static async getById(id) {
    return ApiService.get(`/phasen/${id}`);
  }

  static async create(phase) {
    return ApiService.post('/phasen', phase);
  }

  static async update(id, data) {
    return ApiService.put(`/phasen/${id}`, data);
  }

  static async delete(id) {
    return ApiService.delete(`/phasen/${id}`);
  }

  static async syncPhasen(terminId, phasen) {
    return ApiService.put(`/phasen/termin/${terminId}/sync`, { phasen });
  }
}

// =============================================================================
// AI-Service für ChatGPT-Integration (Version 1.2.0)
// =============================================================================
class AIService {
  /**
   * Prüft den Status der KI-Integration
   * @returns {Promise<Object>} Status mit enabled, configured, costStatus
   */
  static async getStatus() {
    return ApiService.get('/ai/status');
  }

  /**
   * Externes Modell neu trainieren (Daten abgleichen)
   * @returns {Promise<Object>} Ergebnis des Trainings
   */
  static async retrainExternalModel() {
    return ApiService.post('/ai/external/retrain', {});
  }

  /**
   * Testet die Verbindung zur OpenAI API
   * @returns {Promise<Object>} Ergebnis des Verbindungstests
   */
  static async testConnection() {
    return ApiService.get('/ai/test');
  }

  /**
   * Parst einen Freitext in strukturierte Termin-Daten
   * @param {string} text - Freitext-Beschreibung des Termins
   * @returns {Promise<Object>} Strukturierte Termin-Daten
   */
  static async parseTermin(text) {
    return ApiService.post('/ai/parse-termin', { text });
  }

  /**
   * Schlägt Arbeiten basierend auf einer Problembeschreibung vor
   * @param {string} beschreibung - Problembeschreibung
   * @param {string} fahrzeug - Optional: Fahrzeuginfo
   * @returns {Promise<Object>} Vorgeschlagene Arbeiten
   */
  static async suggestArbeiten(beschreibung, fahrzeug = '') {
    return ApiService.post('/ai/suggest-arbeiten', { beschreibung, fahrzeug });
  }

  /**
   * Schätzt die Zeit für gegebene Arbeiten
   * @param {Array<string>} arbeiten - Liste der Arbeiten
   * @param {string} fahrzeug - Optional: Fahrzeuginfo
   * @returns {Promise<Object>} Zeitschätzungen
   */
  static async estimateZeit(arbeiten, fahrzeug = '') {
    return ApiService.post('/ai/estimate-zeit', { arbeiten, fahrzeug });
  }

  /**
   * Schätzt die Zeit für gegebene Arbeiten (Alias)
   */
  static async estimateTime(arbeiten, fahrzeug = '') {
    return ApiService.post('/ai/estimate-time', { arbeiten, fahrzeug });
  }

  /**
   * Erkennt benötigte Teile aus einer Beschreibung
   * @param {string} beschreibung - Arbeitsbeschreibung
   * @param {string} fahrzeug - Optional: Fahrzeuginfo
   * @returns {Promise<Object>} Liste benötigter Teile
   */
  static async erkenneTeilebedarf(beschreibung, fahrzeug = '') {
    return ApiService.post('/ai/teile-bedarf', { beschreibung, fahrzeug });
  }

  /**
   * Prüft ob ein Text eine Fremdmarke enthält (KEIN API-Call nötig)
   * @param {string} text - Text mit Fahrzeuginfo
   * @returns {Promise<Object>} Fremdmarken-Info mit Warnung
   */
  static async checkFremdmarke(text) {
    return ApiService.post('/ai/check-fremdmarke', { text });
  }

  /**
   * Führt eine vollständige Analyse durch
   * @param {string} text - Freitext-Beschreibung
   * @param {boolean} includeTeile - Teile-Erkennung einbeziehen
   * @returns {Promise<Object>} Vollständige Analyse
   */
  static async fullAnalysis(text, includeTeile = false) {
    return ApiService.post('/ai/analyze', { text, includeTeile });
  }

  /**
   * Erstellt einen Wartungsplan basierend auf Fahrzeug und km-Stand
   * @param {string} fahrzeug - Fahrzeugtyp (z.B. "Citroën C3 1.2 PureTech")
   * @param {number} kmStand - Aktueller Kilometerstand
   * @param {number} alter - Optional: Fahrzeugalter in Jahren
   * @returns {Promise<Object>} Wartungsplan mit fälligen und bald fälligen Arbeiten
   */
  static async getWartungsplan(fahrzeug, kmStand, alter = null) {
    return ApiService.post('/ai/wartungsplan', { fahrzeug, kmStand, alter });
  }

  /**
   * Dekodiert eine Fahrgestellnummer (VIN) und liefert Fahrzeugdaten
   * @param {string} vin - 17-stellige VIN/FIN
   * @returns {Promise<Object>} Fahrzeugdaten inkl. Motor, Öl-Spezifikation, Teile-Hinweise
   */
  static async decodeVIN(vin) {
    return ApiService.post('/ai/vin-decode', { vin });
  }

  /**
   * Prüft Teile-Kompatibilität basierend auf VIN
   * @param {string} vin - Fahrgestellnummer
   * @param {string} arbeit - Geplante Arbeit
   * @returns {Promise<Object>} Warnungen und Empfehlungen
   */
  static async checkTeileKompatibilitaet(vin, arbeit) {
    return ApiService.post('/ai/vin-teile-check', { vin, arbeit });
  }

  // ---------------------------------------------------------------------------
  // OLLAMA TEST-METHODEN (unabhängig vom aktiven ki_mode)
  // ---------------------------------------------------------------------------

  /**
   * Prüft ob Ollama erreichbar ist und welche Modelle verfügbar sind.
   * Läuft IMMER gegen Ollama — egal welcher ki_mode aktiv ist.
   * @returns {Promise<Object>} Ollama-Status + verfügbare Modelle
   */
  static async getOllamaStatus() {
    return ApiService.get('/ai/ollama/status');
  }

  /**
   * Listet alle auf dem Ollama-Server installierten Modelle.
   * @returns {Promise<Object>} Modell-Liste
   */
  static async getOllamaModelle() {
    return ApiService.get('/ai/ollama/modelle');
  }

  /**
   * Sendet einen freien Testprompt direkt an Ollama.
   * @param {string} prompt - Testprompt
   * @param {string} systemPrompt - Optional: System-Prompt
   * @returns {Promise<Object>} Ollama-Antwort + Dauer
   */
  static async testOllamaPrompt(prompt, systemPrompt = null) {
    return ApiService.post('/ai/ollama/test-prompt', { prompt, systemPrompt });
  }

  /**
   * Testet parseTerminFromText über Ollama.
   * Ignoriert den aktiven ki_mode — läuft immer gegen Ollama.
   * @param {string} text - Freitext (z.B. "Müller C3 Ölwechsel morgen 9 Uhr")
   * @returns {Promise<Object>} Strukturierter Termin + Dauer
   */
  static async testOllamaTermin(text) {
    return ApiService.post('/ai/ollama/test-termin', { text });
  }

  /**
   * Führt einen Ollama Performance-Test durch.
   * @returns {Promise<Object>} Bewertung + System-Info (CPU, RAM)
   */
  static async benchmarkOllama() {
    return ApiService.get('/ai/ollama/benchmark');
  }

  /**
   * Speichert das Ollama-Modell in den Einstellungen.
   * Das Modell wird sofort live angewendet (kein Neustart nötig).
   * @param {string} model - Modellname (z.B. 'tinyllama', 'llama3.2')
   */
  static async updateOllamaModel(model) {
    return ApiService.put('/einstellungen/ollama-model', { model });
  }
}

/**
 * Service für Teile-Bestellungen
 */
class TeileBestellService {
  
  /**
   * Alle Bestellungen abrufen
   * @param {Object} filter - Optional: status, termin_id, von, bis
   */
  static async getAll(filter = {}) {
    const params = new URLSearchParams();
    if (filter.status) params.append('status', filter.status);
    if (filter.termin_id) params.append('termin_id', filter.termin_id);
    if (filter.von) params.append('von', filter.von);
    if (filter.bis) params.append('bis', filter.bis);
    
    const query = params.toString();
    return ApiService.get(`/teile-bestellungen${query ? '?' + query : ''}`);
  }

  /**
   * Fällige Bestellungen abrufen (gruppiert nach Dringlichkeit)
   * @param {number} tage - Anzahl Tage voraus (default: 7)
   */
  static async getFaellige(tage = 7) {
    return ApiService.get(`/teile-bestellungen/faellig?tage=${tage}`);
  }

  /**
   * Bestellungen für einen Termin abrufen
   */
  static async getByTermin(terminId) {
    return ApiService.get(`/teile-bestellungen/termin/${terminId}`);
  }

  /**
   * Einzelne Bestellung abrufen
   */
  static async getById(id) {
    return ApiService.get(`/teile-bestellungen/${id}`);
  }

  /**
   * Neue Bestellung anlegen
   */
  static async create(data) {
    return ApiService.post('/teile-bestellungen', data);
  }

  /**
   * Mehrere Bestellungen anlegen
   */
  static async createBulk(bestellungen) {
    return ApiService.post('/teile-bestellungen/bulk', { bestellungen });
  }

  /**
   * Bestellung aktualisieren
   */
  static async update(id, data) {
    return ApiService.put(`/teile-bestellungen/${id}`, data);
  }

  /**
   * Status ändern (offen, bestellt, geliefert, storniert)
   */
  static async updateStatus(id, status) {
    return ApiService.put(`/teile-bestellungen/${id}/status`, { status });
  }

  /**
   * Mehrere Bestellungen als "bestellt" markieren
   */
  static async markAlsBestellt(ids) {
    return ApiService.put('/teile-bestellungen/mark-bestellt', { ids });
  }

  /**
   * Bestellung löschen
   */
  static async delete(id) {
    return ApiService.delete(`/teile-bestellungen/${id}`);
  }

  /**
   * Statistiken abrufen
   */
  static async getStatistik() {
    return ApiService.get('/teile-bestellungen/statistik');
  }
}

/**
 * KI-Planungs-Service für intelligente Terminoptimierung
 */
class KIPlanungService {
  /**
   * KI-Vorschlag für Tagesplanung abrufen
   */
  static async getTagesvorschlag(datum) {
    return ApiService.get(`/ki-planung/tagesplanung/${datum}`);
  }

  /**
   * KI-Vorschlag für Wochenplanung abrufen (schwebende Termine verteilen)
   */
  static async getWochenvorschlag(startDatum) {
    return ApiService.get(`/ki-planung/wochenplanung/${startDatum}`);
  }
}

class SchichtTemplateService {
  static async getAll() {
    return ApiService.get('/schicht-templates');
  }

  static async getById(id) {
    return ApiService.get(`/schicht-templates/${id}`);
  }

  static async create(template) {
    return ApiService.post('/schicht-templates', template);
  }

  static async update(id, template) {
    return ApiService.put(`/schicht-templates/${id}`, template);
  }

  static async delete(id) {
    return ApiService.delete(`/schicht-templates/${id}`);
  }
}

class TabletService {
  /**
   * Tablet-Display-Einstellungen abrufen
   */
  static async getEinstellungen() {
    return ApiService.request('/tablet/einstellungen');
  }

  /**
   * Tablet-Display-Einstellungen aktualisieren
   * @param {Object} data - { display_einschaltzeit, display_ausschaltzeit, manueller_display_status }
   */
  static async updateEinstellungen(data) {
    return ApiService.request('/tablet/einstellungen', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  /**
   * Manuellen Display-Status setzen
   * @param {string} status - 'auto', 'an' oder 'aus'
   */
  static async setDisplayManuell(status) {
    return ApiService.request('/tablet/display-manuell', {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }
}

// Global verfügbar machen (für Vite-Kompatibilität)
window.ApiService = ApiService;
window.KundenService = KundenService;
window.TermineService = TermineService;
window.ArbeitszeitenService = ArbeitszeitenService;
window.AuslastungService = AuslastungService;
window.EinstellungenService = EinstellungenService;
window.MitarbeiterService = MitarbeiterService;
window.LehrlingeService = LehrlingeService;
window.BackupService = BackupService;
window.ErsatzautosService = ErsatzautosService;
window.PhasenService = PhasenService;
window.AIService = AIService;
window.TeileBestellService = TeileBestellService;
window.KIPlanungService = KIPlanungService;
window.SchichtTemplateService = SchichtTemplateService;
window.TabletService = TabletService;
