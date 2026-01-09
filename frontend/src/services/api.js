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

  static async getAbwesenheit(datum) {
    return ApiService.get(`/abwesenheiten/${datum}`);
  }

  static async updateAbwesenheit(datum, data) {
    return ApiService.put(`/abwesenheiten/${datum}`, data);
  }

  // Neue Methoden für individuelle Mitarbeiter-/Lehrlinge-Abwesenheiten
  static async getAllAbwesenheiten() {
    return ApiService.get('/abwesenheiten/liste');
  }

  static async getAbwesenheitenByDateRange(vonDatum, bisDatum) {
    return ApiService.get(`/abwesenheiten/range?von_datum=${vonDatum}&bis_datum=${bisDatum}`);
  }

  static async createAbwesenheit(data) {
    return ApiService.post('/abwesenheiten', data);
  }

  static async deleteAbwesenheit(id) {
    return ApiService.delete(`/abwesenheiten/item/${id}`);
  }

  static async getAbwesenheitById(id) {
    return ApiService.get(`/abwesenheiten/item/${id}`);
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
