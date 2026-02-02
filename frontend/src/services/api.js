class ApiService {
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
    return this.request(endpoint, { method: 'GET' });
  }

  static async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  static async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  static async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
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
    return ApiService.get(`/termine${query}`);
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

  static async getAbwesenheit(datum) {
    return ApiService.get(`/abwesenheiten/${datum}`);
  }

  static async updateAbwesenheit(datum, data) {
    return ApiService.put(`/abwesenheiten/${datum}`, data);
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
