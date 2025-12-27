class ApiService {
  static async request(endpoint, options = {}) {
    // Verwende die dynamische Konfiguration aus config.js
    const url = `${CONFIG.API_URL}${endpoint}`;
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
        const error = await response.json();
        throw new Error(error.error || 'API-Fehler');
      }

      return await response.json();
    } catch (error) {
      console.error('API Request Error:', error);
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
}

class TermineService {
  static async getAll(datum = null) {
    const query = datum ? `?datum=${datum}` : '';
    return ApiService.get(`/termine${query}`);
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

  static async checkAvailability(datum, dauer) {
    return ApiService.get(`/termine/verfuegbarkeit?datum=${datum}&dauer=${dauer}`);
  }

  static async validate(termin) {
    return ApiService.post('/termine/validate', termin);
  }

  static async getVorschlaege(datum, dauer) {
    return ApiService.get(`/termine/vorschlaege?datum=${datum}&dauer=${dauer}`);
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

  static async getAbwesenheit(datum) {
    return ApiService.get(`/abwesenheiten/${datum}`);
  }

  static async updateAbwesenheit(datum, data) {
    return ApiService.put(`/abwesenheiten/${datum}`, data);
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
