const EinstellungenModel = require('../models/einstellungenModel');
const localAiService = require('../services/localAiService');
const { getAsync, allAsync } = require('../utils/dbHelper');

const DEFAULT_ARBEITSBEGINN_MIN = 8 * 60;
const DEFAULT_ARBEITSENDE_MIN = 18 * 60;
const DEFAULT_TERMIN_DAUER_MIN = 60;

class KIPlanungController {
  
  /**
   * Generiert einen KI-Vorschlag für die Tagesplanung
   */
  static async getPlanungsvorschlag(req, res) {
    try {
      const { datum } = req.params;
      
      if (!datum) {
        return res.status(400).json({ error: 'Datum erforderlich' });
      }

      const settings = await EinstellungenModel.getWerkstatt();
      const mode = KIPlanungController.resolveKIMode(settings);
      if (settings?.ki_enabled === false || settings?.ki_enabled === 0) {
        return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert.' });
      }
      if (settings?.smart_scheduling_enabled === 0) {
        return res.status(403).json({ error: 'Smart Scheduling ist deaktiviert.' });
      }
      if (mode === 'local' || mode === 'external') {
        const [mitarbeiter, lehrlinge, termine, schwebendeTermine, abwesenheiten] = await Promise.all([
          KIPlanungController.getMitarbeiterMitDetails(),
          KIPlanungController.getLehrlingeMitDetails(),
          KIPlanungController.getTermineFuerDatum(datum),
          KIPlanungController.getSchwebendeTermine(),
          KIPlanungController.getAbwesenheitenFuerDatum(datum)
        ]);

        const vorschlag = KIPlanungController.buildLocalTagesVorschlag({
          datum,
          mitarbeiter,
          lehrlinge,
          termine,
          schwebendeTermine,
          einstellungen: settings,
          abwesenheiten
        });

        return res.json({
          success: true,
          datum,
          vorschlag,
          mode: 'local'
        });
      }
      
      // API-Key prüfen
      const apiKey = await EinstellungenModel.getChatGPTApiKey();
      if (!apiKey) {
        return res.status(400).json({ 
          error: 'Kein ChatGPT API-Key konfiguriert. Bitte unter Einstellungen → KI / API einen API-Key hinterlegen.' 
        });
      }
      
      // Alle relevanten Daten sammeln
      const [mitarbeiter, lehrlinge, termine, schwebendeTermine, einstellungen, abwesenheiten] = await Promise.all([
        KIPlanungController.getMitarbeiterMitDetails(),
        KIPlanungController.getLehrlingeMitDetails(),
        KIPlanungController.getTermineFuerDatum(datum),
        KIPlanungController.getSchwebendeTermine(),
        EinstellungenModel.getWerkstatt(),
        KIPlanungController.getAbwesenheitenFuerDatum(datum)
      ]);
      
      // Prompt für ChatGPT erstellen
      const prompt = KIPlanungController.erstellePlanungsPrompt({
        datum,
        mitarbeiter,
        lehrlinge,
        termine,
        schwebendeTermine,
        einstellungen,
        abwesenheiten
      });
      
      // ChatGPT API aufrufen
      const kiAntwort = await KIPlanungController.chatGPTRequest(apiKey, prompt);
      
      // Antwort parsen und strukturieren
      const vorschlag = KIPlanungController.parseKIAntwort(kiAntwort, {
        mitarbeiter,
        lehrlinge,
        termine,
        schwebendeTermine
      });
      
      res.json({
        success: true,
        datum,
        vorschlag,
        rohAntwort: kiAntwort // Für Debug-Zwecke
      });
      
    } catch (error) {
      console.error('KI-Planungsvorschlag Fehler:', error);
      res.status(500).json({ 
        error: error.message || 'Fehler beim Generieren des KI-Vorschlags' 
      });
    }
  }

  /**
   * Generiert einen KI-Vorschlag für die Wochenplanung (schwebende Termine verteilen)
   */
  static async getWochenvorschlag(req, res) {
    try {
      const { startDatum } = req.params;
      
      if (!startDatum) {
        return res.status(400).json({ error: 'Startdatum erforderlich' });
      }

      const settings = await EinstellungenModel.getWerkstatt();
      const mode = KIPlanungController.resolveKIMode(settings);
      if (settings?.ki_enabled === false || settings?.ki_enabled === 0) {
        return res.status(403).json({ error: 'KI-Funktionen sind deaktiviert.' });
      }
      if (settings?.smart_scheduling_enabled === 0) {
        return res.status(403).json({ error: 'Smart Scheduling ist deaktiviert.' });
      }
      if (mode === 'local' || mode === 'external') {
        const wochentage = KIPlanungController.getWochentage(startDatum);
        const wochenDaten = await Promise.all(wochentage.map(async (tag) => {
          const [termine, abwesenheiten] = await Promise.all([
            KIPlanungController.getTermineFuerDatum(tag),
            KIPlanungController.getAbwesenheitenFuerDatum(tag)
          ]);
          return { datum: tag, termine, abwesenheiten };
        }));

        const [mitarbeiter, lehrlinge, schwebendeTermine] = await Promise.all([
          KIPlanungController.getMitarbeiterMitDetails(),
          KIPlanungController.getLehrlingeMitDetails(),
          KIPlanungController.getSchwebendeTermine()
        ]);

        const vorschlag = KIPlanungController.buildLocalWochenVorschlag({
          wochentage,
          wochenDaten,
          mitarbeiter,
          lehrlinge,
          schwebendeTermine,
          einstellungen: settings
        });

        return res.json({
          success: true,
          wochentage,
          vorschlag,
          mode: 'local'
        });
      }
      
      // API-Key prüfen
      const apiKey = await EinstellungenModel.getChatGPTApiKey();
      if (!apiKey) {
        return res.status(400).json({ 
          error: 'Kein ChatGPT API-Key konfiguriert.' 
        });
      }
      
      // Wochentage berechnen (Mo-Fr)
      const wochentage = KIPlanungController.getWochentage(startDatum);
      
      // Daten für die ganze Woche sammeln
      const wochenDaten = await Promise.all(wochentage.map(async (tag) => {
        const [termine, abwesenheiten] = await Promise.all([
          KIPlanungController.getTermineFuerDatum(tag),
          KIPlanungController.getAbwesenheitenFuerDatum(tag)
        ]);
        return { datum: tag, termine, abwesenheiten };
      }));
      
      const [mitarbeiter, lehrlinge, schwebendeTermine, einstellungen] = await Promise.all([
        KIPlanungController.getMitarbeiterMitDetails(),
        KIPlanungController.getLehrlingeMitDetails(),
        KIPlanungController.getSchwebendeTermine(),
        EinstellungenModel.getWerkstatt()
      ]);
      
      // Prompt für Wochenplanung
      const prompt = KIPlanungController.erstelleWochenPrompt({
        wochentage,
        wochenDaten,
        mitarbeiter,
        lehrlinge,
        schwebendeTermine,
        einstellungen
      });
      
      const kiAntwort = await KIPlanungController.chatGPTRequest(apiKey, prompt);
      
      const vorschlag = KIPlanungController.parseWochenAntwort(kiAntwort, {
        wochentage,
        schwebendeTermine,
        mitarbeiter,
        lehrlinge
      });
      
      res.json({
        success: true,
        wochentage,
        vorschlag,
        rohAntwort: kiAntwort
      });
      
    } catch (error) {
      console.error('KI-Wochenvorschlag Fehler:', error);
      res.status(500).json({ 
        error: error.message || 'Fehler beim Generieren des Wochenvorschlags' 
      });
    }
  }

  // ==================== HILFSFUNKTIONEN ====================

  static async getMitarbeiterMitDetails() {
    return await allAsync(`
      SELECT id, name, arbeitsstunden_pro_tag, mittagspause_start, aktiv, nur_service
      FROM mitarbeiter 
      WHERE aktiv = 1
    `, []);
  }

  static async getLehrlingeMitDetails() {
    return await allAsync(`
      SELECT id, name, arbeitsstunden_pro_tag, mittagspause_start, aufgabenbewaeltigung_prozent, aktiv
      FROM lehrlinge 
      WHERE aktiv = 1
    `, []);
  }

  static async getTermineFuerDatum(datum) {
    return await allAsync(`
      SELECT t.*, k.name as kunde_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.datum = ? AND t.geloescht_am IS NULL AND t.status != 'storniert' AND (t.ist_schwebend = 0 OR t.ist_schwebend IS NULL)
    `, [datum]);
  }

  static async getSchwebendeTermine() {
    return await allAsync(`
      SELECT t.*, k.name as kunde_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.ist_schwebend = 1 AND t.geloescht_am IS NULL AND t.status != 'storniert'
      ORDER BY t.schwebend_prioritaet DESC, t.erstellt_am ASC
    `, []);
  }

  static async getAbwesenheitenFuerDatum(datum) {
    return await allAsync(`
      SELECT * FROM mitarbeiter_abwesenheiten
      WHERE von_datum <= ? AND bis_datum >= ?
    `, [datum, datum]);
  }

  static getWochentage(startDatum) {
    const start = new Date(startDatum);
    // Zum Montag der Woche gehen
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    
    const tage = [];
    for (let i = 0; i < 5; i++) { // Mo-Fr
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      tage.push(d.toISOString().split('T')[0]);
    }
    return tage;
  }

  static resolveKIMode(settings) {
    if (!settings) return 'local';
    if (settings.ki_mode) return settings.ki_mode;
    return settings.chatgpt_api_key ? 'openai' : 'local';
  }

  static timeToMinutes(time) {
    if (!time || typeof time !== 'string') return null;
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  static minutesToTime(minutes) {
    const safe = Math.max(0, Math.round(minutes || 0));
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  static parseArbeitszeitenDetails(termin) {
    if (!termin || !termin.arbeitszeiten_details) return null;
    try {
      if (typeof termin.arbeitszeiten_details === 'string') {
        return JSON.parse(termin.arbeitszeiten_details);
      }
      return termin.arbeitszeiten_details;
    } catch (e) {
      return null;
    }
  }

  static getTerminGesamtZuordnung(termin) {
    const details = KIPlanungController.parseArbeitszeitenDetails(termin);
    if (details && details._gesamt_mitarbeiter_id) {
      const gesamt = details._gesamt_mitarbeiter_id;
      if (typeof gesamt === 'object' && gesamt.id) {
        return { type: gesamt.type || 'mitarbeiter', id: gesamt.id };
      }
      if (typeof gesamt === 'number') {
        return { type: 'mitarbeiter', id: gesamt };
      }
    }
    if (termin?.mitarbeiter_id) {
      return { type: 'mitarbeiter', id: termin.mitarbeiter_id };
    }
    return null;
  }

  static hasEinzelZuordnung(details) {
    if (!details || typeof details !== 'object') return false;
    return Object.keys(details).some(key => {
      if (key.startsWith('_')) return false;
      const value = details[key];
      if (value && typeof value === 'object') {
        return !!(value.mitarbeiter_id || value.lehrling_id);
      }
      return false;
    });
  }

  static isTerminZugeordnet(termin) {
    if (!termin) return false;
    if (termin.mitarbeiter_id) return true;
    const details = KIPlanungController.parseArbeitszeitenDetails(termin);
    if (details && details._gesamt_mitarbeiter_id) return true;
    return KIPlanungController.hasEinzelZuordnung(details);
  }

  static getTerminDauerMinuten(termin) {
    const value = termin?.tatsaechliche_zeit || termin?.geschaetzte_zeit || DEFAULT_TERMIN_DAUER_MIN;
    const minuten = parseInt(value, 10);
    return Number.isFinite(minuten) && minuten > 0 ? minuten : DEFAULT_TERMIN_DAUER_MIN;
  }

  static getTerminStartMinuten(termin) {
    const details = KIPlanungController.parseArbeitszeitenDetails(termin);
    const start = details?._startzeit || termin?.bring_zeit || null;
    return KIPlanungController.timeToMinutes(start);
  }

  static buildPersonList(mitarbeiter, lehrlinge, abwesenheiten, einstellungen) {
    const mittagspause = parseInt(einstellungen?.mittagspause_minuten, 10);
    const pauseMin = Number.isFinite(mittagspause) ? Math.max(mittagspause, 0) : 0;
    const abwesendMitarbeiter = new Set(
      (abwesenheiten || []).filter(a => a.mitarbeiter_id).map(a => a.mitarbeiter_id)
    );
    const abwesendLehrlinge = new Set(
      (abwesenheiten || []).filter(a => a.lehrling_id).map(a => a.lehrling_id)
    );

    const personen = [];
    (mitarbeiter || []).forEach(ma => {
      if (abwesendMitarbeiter.has(ma.id)) return;
      const stunden = ma.arbeitsstunden_pro_tag || 8;
      const capacity = Math.max(0, stunden * 60 - pauseMin);
      const dayEnd = Math.min(DEFAULT_ARBEITSENDE_MIN, DEFAULT_ARBEITSBEGINN_MIN + stunden * 60);
      personen.push({
        type: 'mitarbeiter',
        id: ma.id,
        name: ma.name,
        nur_service: !!ma.nur_service,
        effizienz: 1,
        capacityMin: capacity,
        dayStartMin: DEFAULT_ARBEITSBEGINN_MIN,
        dayEndMin: dayEnd
      });
    });

    (lehrlinge || []).forEach(l => {
      if (abwesendLehrlinge.has(l.id)) return;
      const stunden = l.arbeitsstunden_pro_tag || 8;
      const capacity = Math.max(0, stunden * 60 - pauseMin);
      const effizienz = Math.max(0.5, (l.aufgabenbewaeltigung_prozent || 100) / 100);
      const dayEnd = Math.min(DEFAULT_ARBEITSENDE_MIN, DEFAULT_ARBEITSBEGINN_MIN + stunden * 60);
      personen.push({
        type: 'lehrling',
        id: l.id,
        name: l.name,
        nur_service: false,
        effizienz,
        capacityMin: capacity,
        dayStartMin: DEFAULT_ARBEITSBEGINN_MIN,
        dayEndMin: dayEnd
      });
    });

    return personen;
  }

  static buildScheduleMap(personen) {
    const schedule = new Map();
    (personen || []).forEach(person => {
      schedule.set(`${person.type}:${person.id}`, {
        person,
        usedMin: 0,
        blocks: []
      });
    });
    return schedule;
  }

  static addTerminToSchedule(schedule, assignment, termin, durationMin) {
    if (!assignment) return;
    const key = `${assignment.type}:${assignment.id}`;
    const entry = schedule.get(key);
    if (!entry) return;

    const adjusted = Math.ceil(durationMin / (entry.person.effizienz || 1));
    entry.usedMin += adjusted;

    const startMin = KIPlanungController.getTerminStartMinuten(termin);
    if (startMin === null) {
      return;
    }
    entry.blocks.push({
      start: startMin,
      end: startMin + adjusted
    });
  }

  static buildExistingSchedules(termine, personen) {
    const schedule = KIPlanungController.buildScheduleMap(personen);
    (termine || []).forEach(termin => {
      const assignment = KIPlanungController.getTerminGesamtZuordnung(termin);
      if (!assignment) return;
      const duration = KIPlanungController.getTerminDauerMinuten(termin);
      KIPlanungController.addTerminToSchedule(schedule, assignment, termin, duration);
    });
    return schedule;
  }

  static findAvailableSlot(blocks, preferredStart, duration, dayStart, dayEnd) {
    const start = Math.max(dayStart, preferredStart ?? dayStart);
    const sorted = [...blocks].sort((a, b) => a.start - b.start);
    let cursor = start;

    for (const block of sorted) {
      if (cursor + duration <= block.start) {
        return cursor;
      }
      if (cursor < block.end) {
        cursor = block.end;
      }
    }

    if (cursor + duration <= dayEnd) {
      return cursor;
    }
    return null;
  }

  static pickBestCandidate(candidates) {
    if (!candidates.length) return null;
    const withCapacity = candidates.filter(c => c.remaining >= 0);
    const pool = withCapacity.length ? withCapacity : candidates;
    pool.sort((a, b) => {
      if (a.slotStart !== b.slotStart) return a.slotStart - b.slotStart;
      return b.remaining - a.remaining;
    });
    return pool[0];
  }

  static buildLocalTagesVorschlag({ datum, mitarbeiter, lehrlinge, termine, schwebendeTermine, einstellungen, abwesenheiten }) {
    const personen = KIPlanungController.buildPersonList(mitarbeiter, lehrlinge, abwesenheiten, einstellungen);
    const schedule = KIPlanungController.buildExistingSchedules(termine, personen);
    const tagesZuordnungen = [];
    const schwebendeVorschlaege = [];
    const warnungen = [];

    const offeneTermine = (termine || []).filter(t => !KIPlanungController.isTerminZugeordnet(t));

    offeneTermine.forEach(termin => {
      const duration = KIPlanungController.getTerminDauerMinuten(termin);
      const preferredStart = KIPlanungController.getTerminStartMinuten(termin) ?? DEFAULT_ARBEITSBEGINN_MIN;
      const candidates = [];
      schedule.forEach(entry => {
        const adjusted = Math.ceil(duration / (entry.person.effizienz || 1));
        const slotStart = KIPlanungController.findAvailableSlot(
          entry.blocks,
          preferredStart,
          adjusted,
          entry.person.dayStartMin,
          entry.person.dayEndMin
        );
        if (slotStart === null) return;
        const remaining = entry.person.capacityMin - entry.usedMin - adjusted;
        candidates.push({
          entry,
          slotStart,
          remaining,
          durationAdjusted: adjusted
        });
      });

      const best = KIPlanungController.pickBestCandidate(candidates);
      if (!best) {
        warnungen.push(`Kein freier Slot für Termin #${termin.id} (${termin.arbeit || 'ohne Arbeit'}).`);
        return;
      }

      const { entry, slotStart, durationAdjusted } = best;
      const startzeit = KIPlanungController.minutesToTime(slotStart);
      entry.usedMin += durationAdjusted;
      entry.blocks.push({ start: slotStart, end: slotStart + durationAdjusted });

      tagesZuordnungen.push({
        terminId: termin.id,
        mitarbeiterId: entry.person.id,
        mitarbeiterTyp: entry.person.type,
        startzeit,
        begruendung: 'Freier Slot innerhalb der Kapazität.',
        terminInfo: `${termin.arbeit || 'Termin'} - ${termin.kunde_name || 'k.A.'}`,
        personName: entry.person.name,
        gueltig: true
      });
    });

    const gesamtKapazitaet = personen.reduce((sum, p) => sum + p.capacityMin, 0);
    let remainingKapazitaet = Math.max(
      gesamtKapazitaet - Array.from(schedule.values()).reduce((sum, entry) => sum + entry.usedMin, 0),
      0
    );

    (schwebendeTermine || []).forEach(termin => {
      const duration = KIPlanungController.getTerminDauerMinuten(termin);
      const preferredStart = DEFAULT_ARBEITSBEGINN_MIN;
      const candidates = [];
      schedule.forEach(entry => {
        const adjusted = Math.ceil(duration / (entry.person.effizienz || 1));
        const slotStart = KIPlanungController.findAvailableSlot(
          entry.blocks,
          preferredStart,
          adjusted,
          entry.person.dayStartMin,
          entry.person.dayEndMin
        );
        if (slotStart === null) return;
        const remaining = entry.person.capacityMin - entry.usedMin - adjusted;
        candidates.push({
          entry,
          slotStart,
          remaining,
          durationAdjusted: adjusted
        });
      });

      const best = KIPlanungController.pickBestCandidate(candidates);
      if (!best) {
        schwebendeVorschlaege.push({
          terminId: termin.id,
          mitarbeiterId: null,
          mitarbeiterTyp: 'mitarbeiter',
          startzeit: null,
          begruendung: 'Keine freie Kapazität für heute.',
          empfehlung: 'spaeter',
          terminInfo: `${termin.arbeit || 'Termin'} - ${termin.kunde_name || 'k.A.'}`,
          personName: 'Nicht zugeordnet',
          gueltig: false
        });
        return;
      }

      const empfehlung = remainingKapazitaet >= best.durationAdjusted ? 'heute_einplanen' : 'spaeter';
      const startzeit = KIPlanungController.minutesToTime(best.slotStart);

      if (empfehlung === 'heute_einplanen') {
        best.entry.usedMin += best.durationAdjusted;
        best.entry.blocks.push({ start: best.slotStart, end: best.slotStart + best.durationAdjusted });
        remainingKapazitaet = Math.max(remainingKapazitaet - best.durationAdjusted, 0);
      }

      schwebendeVorschlaege.push({
        terminId: termin.id,
        mitarbeiterId: best.entry.person.id,
        mitarbeiterTyp: best.entry.person.type,
        startzeit,
        begruendung: empfehlung === 'heute_einplanen'
          ? 'Freie Kapazität vorhanden, Termin passt in den Tagesplan.'
          : 'Kapazität knapp, besser später einplanen.',
        empfehlung,
        terminInfo: `${termin.arbeit || 'Termin'} - ${termin.kunde_name || 'k.A.'}`,
        personName: best.entry.person.name,
        gueltig: true
      });
    });

    if (einstellungen?.anomaly_detection_enabled !== 0) {
      warnungen.push(...KIPlanungController.collectAnomalien(termine, schedule, personen, einstellungen));
    }

    const genutztMinuten = Array.from(schedule.values()).reduce((sum, entry) => sum + entry.usedMin, 0);
    const freiMinuten = Math.max(gesamtKapazitaet - genutztMinuten, 0);
    const zusammenfassung = `Lokale Planung: ${tagesZuordnungen.length} offene Termine zugeordnet, ${schwebendeVorschlaege.filter(v => v.empfehlung === 'heute_einplanen').length} schwebende Termine für heute vorgeschlagen.`;

    return {
      zusammenfassung,
      kapazitaetsAnalyse: {
        gesamtKapazitaet: `${gesamtKapazitaet} min`,
        genutzt: `${genutztMinuten} min`,
        frei: `${freiMinuten} min`
      },
      warnungen,
      tagesZuordnungen,
      schwebendeVorschlaege
    };
  }

  static buildLocalWochenVorschlag({ wochentage, wochenDaten, mitarbeiter, lehrlinge, schwebendeTermine, einstellungen }) {
    const dayStats = (wochenDaten || []).map(day => {
      const personen = KIPlanungController.buildPersonList(mitarbeiter, lehrlinge, day.abwesenheiten, einstellungen);
      const schedule = KIPlanungController.buildExistingSchedules(day.termine, personen);
      const capacity = personen.reduce((sum, p) => sum + p.capacityMin, 0);
      const used = Array.from(schedule.values()).reduce((sum, entry) => sum + entry.usedMin, 0);
      return {
        datum: day.datum,
        personen,
        schedule,
        capacity,
        used
      };
    });

    const verteilung = [];
    const warnungen = [];

    (schwebendeTermine || []).forEach(termin => {
      const duration = KIPlanungController.getTerminDauerMinuten(termin);
      let bestDay = null;
      let bestFree = -Infinity;

      dayStats.forEach(day => {
        const free = day.capacity - day.used;
        if (free >= duration && free > bestFree) {
          bestDay = day;
          bestFree = free;
        } else if (bestDay === null && free > bestFree) {
          bestDay = day;
          bestFree = free;
        }
      });

      if (!bestDay) return;

      bestDay.used += duration;

      const begruendung = bestFree >= duration
        ? 'Tag mit der höchsten freien Kapazität gewählt.'
        : 'Kapazität knapp, dennoch bester verfügbarer Tag.';

      verteilung.push({
        terminId: termin.id,
        empfohlenesDatum: bestDay.datum,
        begruendung,
        terminInfo: `${termin.arbeit || 'Termin'} - ${termin.kunde_name || 'k.A.'}`,
        gueltig: wochentage.includes(bestDay.datum)
      });
    });

    if (einstellungen?.anomaly_detection_enabled !== 0) {
      dayStats.forEach(day => {
        warnungen.push(...KIPlanungController.collectAnomalien(day.termine, day.schedule, day.personen, einstellungen));
      });
    }

    const wochenAuslastung = {};
    const tageKeys = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag'];
    dayStats.forEach((day, idx) => {
      const percent = day.capacity > 0 ? Math.round((day.used / day.capacity) * 100) : 0;
      wochenAuslastung[tageKeys[idx]] = percent;
    });

    const zusammenfassung = `Lokale Wochenverteilung: ${verteilung.length} schwebende Termine verteilt.`;

    return {
      zusammenfassung,
      warnungen,
      wochenAuslastung,
      verteilung
    };
  }

  static collectAnomalien(termine, schedule, personen, einstellungen) {
    const warnungen = new Set();
    const shortThreshold = 15;
    const longThreshold = DEFAULT_ARBEITSENDE_MIN - DEFAULT_ARBEITSBEGINN_MIN;

    (termine || []).forEach(termin => {
      const dauer = KIPlanungController.getTerminDauerMinuten(termin);
      if (dauer < shortThreshold) {
        warnungen.add(`Unrealistische Zeit für Termin #${termin.id}: ${dauer} min.`);
      }
      if (dauer > longThreshold) {
        warnungen.add(`Sehr lange Dauer bei Termin #${termin.id}: ${dauer} min.`);
      }
      if (termin.tatsaechliche_zeit && termin.geschaetzte_zeit) {
        const ratio = termin.tatsaechliche_zeit / Math.max(termin.geschaetzte_zeit, 1);
        if (ratio > 2.5) {
          warnungen.add(`Abweichung bei Termin #${termin.id}: tatsächliche Zeit deutlich höher.`);
        } else if (ratio < 0.4) {
          warnungen.add(`Abweichung bei Termin #${termin.id}: tatsächliche Zeit deutlich niedriger.`);
        }
      }
    });

    (personen || []).forEach(person => {
      const entry = schedule.get(`${person.type}:${person.id}`);
      if (!entry) return;
      if (entry.usedMin > person.capacityMin) {
        warnungen.add(`Überlastung: ${person.name} ${entry.usedMin}/${person.capacityMin} min.`);
      }

      const blocks = [...entry.blocks].sort((a, b) => a.start - b.start);
      for (let i = 1; i < blocks.length; i++) {
        if (blocks[i].start < blocks[i - 1].end) {
          warnungen.add(`Doppelbuchung bei ${person.name} um ${KIPlanungController.minutesToTime(blocks[i].start)}.`);
          break;
        }
      }
    });

    return Array.from(warnungen).slice(0, 12);
  }

  static erstellePlanungsPrompt({ datum, mitarbeiter, lehrlinge, termine, schwebendeTermine, einstellungen, abwesenheiten }) {
    const datumFormatiert = new Date(datum).toLocaleDateString('de-DE', { 
      weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
    });
    
    // Abwesende IDs sammeln
    const abwesendeIds = new Set(abwesenheiten.map(a => `${a.person_typ}_${a.person_id}`));
    
    // Mitarbeiter-Info
    const mitarbeiterInfo = mitarbeiter.map(m => {
      const istAbwesend = abwesendeIds.has(`mitarbeiter_${m.id}`);
      const pause = m.mittagspause_start || '12:00';
      return `- ${m.name} (ID: ${m.id}): ${m.arbeitsstunden_pro_tag || 8}h/Tag, Pause: ${pause}${istAbwesend ? ' [ABWESEND]' : ''}`;
    }).join('\n');
    
    // Lehrlinge-Info
    const lehrlingeInfo = lehrlinge.map(l => {
      const istAbwesend = abwesendeIds.has(`lehrling_${l.id}`);
      const faktor = l.aufgabenbewaeltigung_prozent || 100;
      const pause = l.mittagspause_start || '12:00';
      return `- ${l.name} (Lehrling-ID: ${l.id}): ${l.arbeitsstunden_pro_tag || 8}h/Tag, Pause: ${pause}, Zeitfaktor: ${faktor}%${istAbwesend ? ' [ABWESEND]' : ''}`;
    }).join('\n');
    
    // Bereits zugeordnete Termine
    const zugeordneteTermine = termine.filter(t => t.mitarbeiter_id || t.arbeitszeiten_details);
    const zugeordnetInfo = zugeordneteTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const zuordnung = t.mitarbeiter_id ? `MA-ID: ${t.mitarbeiter_id}` : 'individuell';
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Kunde: ${t.kunde_name || 'k.A.'}, Bring: ${t.bring_zeit || '-'}, Abhol: ${t.abhol_zeit || '-'}, Zuordnung: ${zuordnung}`;
    }).join('\n') || 'Keine';
    
    // Nicht zugeordnete Termine
    const nichtZugeordneteTermine = termine.filter(t => !t.mitarbeiter_id && !t.arbeitszeiten_details);
    const nichtZugeordnetInfo = nichtZugeordneteTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const kundeWartet = t.kunde_wartet ? '⚡ WARTET' : '';
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Kunde: ${t.kunde_name || 'k.A.'}, Bring: ${t.bring_zeit || '-'}, Abhol: ${t.abhol_zeit || '-'} ${kundeWartet}`;
    }).join('\n') || 'Keine';
    
    // Schwebende Termine (ohne festes Datum)
    const schwebendeInfo = schwebendeTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const prio = t.prioritaet ? `Prio: ${t.prioritaet}` : '';
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Kunde: ${t.kunde_name || 'k.A.'}, Kennz: ${t.kennzeichen || '-'} ${prio}`;
    }).join('\n') || 'Keine';
    
    const servicezeit = einstellungen?.servicezeit_minuten || 10;
    const nebenzeit = einstellungen?.nebenzeit_prozent || 0;
    const mittagspause = einstellungen?.mittagspause_minuten || 30;

    return `Du bist ein Werkstatt-Planungsassistent. Optimiere die Tagesplanung für eine KFZ-Werkstatt.

DATUM: ${datumFormatiert}

WERKSTATT-EINSTELLUNGEN:
- Servicezeit pro Termin: ${servicezeit} Minuten (Annahme/Rechnung)
- Nebenzeit-Aufschlag: ${nebenzeit}% (Holen, Waschen etc.)
- Mittagspause: ${mittagspause} Minuten

MITARBEITER (verfügbar):
${mitarbeiterInfo || 'Keine Mitarbeiter'}

LEHRLINGE (verfügbar):
${lehrlingeInfo || 'Keine Lehrlinge'}

BEREITS ZUGEORDNETE TERMINE:
${zugeordnetInfo}

NICHT ZUGEORDNETE TERMINE (für heute):
${nichtZugeordnetInfo}

SCHWEBENDE TERMINE (ohne Datum, können eingeplant werden):
${schwebendeInfo}

AUFGABE:
1. Analysiere die aktuelle Situation
2. Schlage eine optimale Zuordnung für die NICHT ZUGEORDNETEN Termine vor
3. Prüfe, ob SCHWEBENDE Termine heute eingeplant werden können (bei freier Kapazität)
4. Beachte: Termine mit "Kunde wartet" sollten früh und an erfahrene Mitarbeiter
5. Beachte Bring- und Abholzeiten
6. Lehrlinge nur für einfache Arbeiten, mit Zeitfaktor berücksichtigen

ANTWORT-FORMAT (JSON):
{
  "zusammenfassung": "Kurze Analyse der Situation",
  "tagesZuordnungen": [
    {
      "terminId": 123,
      "mitarbeiterId": 1,
      "mitarbeiterTyp": "mitarbeiter",
      "startzeit": "09:00",
      "begruendung": "Warum diese Zuordnung"
    }
  ],
  "schwebendeVorschlaege": [
    {
      "terminId": 456,
      "empfehlung": "heute_einplanen",
      "mitarbeiterId": 2,
      "mitarbeiterTyp": "mitarbeiter",
      "startzeit": "14:00",
      "begruendung": "Genug Kapazität vorhanden"
    }
  ],
  "warnungen": ["Mögliche Probleme oder Hinweise"],
  "kapazitaetsAnalyse": {
    "gesamtKapazitaet": "X Stunden",
    "genutzt": "Y Stunden",
    "frei": "Z Stunden"
  }
}

Antworte NUR mit dem JSON, ohne zusätzlichen Text.`;
  }

  static erstelleWochenPrompt({ wochentage, wochenDaten, mitarbeiter, lehrlinge, schwebendeTermine, einstellungen }) {
    const wochenInfo = wochenDaten.map(wd => {
      const termineAnzahl = wd.termine.length;
      const totalDauer = wd.termine.reduce((sum, t) => sum + (t.geschaetzte_dauer || 60), 0);
      return `- ${wd.datum}: ${termineAnzahl} Termine, ca. ${Math.round(totalDauer/60)}h geplant`;
    }).join('\n');
    
    const schwebendeInfo = schwebendeTermine.map(t => {
      const dauer = t.dauer_stunden ? `${t.dauer_stunden}h` : `${t.geschaetzte_dauer || 60}min`;
      const prio = t.prioritaet || 0;
      return `- #${t.id}: ${t.arbeit || 'Arbeit'} (${dauer}), Prio: ${prio}, Kunde: ${t.kunde_name || 'k.A.'}`;
    }).join('\n') || 'Keine';
    
    const kapazitaet = mitarbeiter.reduce((sum, m) => sum + (m.arbeitsstunden_pro_tag || 8), 0) +
                       lehrlinge.reduce((sum, l) => sum + (l.arbeitsstunden_pro_tag || 8) * ((l.aufgabenbewaeltigung_prozent || 100) / 100), 0);

    return `Du bist ein Werkstatt-Planungsassistent. Verteile schwebende Termine auf die Woche.

WOCHE: ${wochentage[0]} bis ${wochentage[4]}

AKTUELLE BELEGUNG:
${wochenInfo}

TAGESKAPAZITÄT: ca. ${Math.round(kapazitaet)}h (${mitarbeiter.length} Mitarbeiter, ${lehrlinge.length} Lehrlinge)

SCHWEBENDE TERMINE ZUM VERTEILEN:
${schwebendeInfo}

AUFGABE:
1. Verteile die schwebenden Termine gleichmäßig auf die Woche
2. Berücksichtige Prioritäten (höhere Prio = früher in der Woche)
3. Überlaste keinen einzelnen Tag
4. Lasse Puffer für spontane Termine

ANTWORT-FORMAT (JSON):
{
  "zusammenfassung": "Kurze Analyse",
  "verteilung": [
    {
      "terminId": 123,
      "empfohlenesDatum": "2026-01-13",
      "begruendung": "Warum dieser Tag"
    }
  ],
  "warnungen": ["Hinweise"],
  "wochenAuslastung": {
    "montag": "X%",
    "dienstag": "Y%",
    "mittwoch": "Z%",
    "donnerstag": "A%",
    "freitag": "B%"
  }
}

Antworte NUR mit dem JSON.`;
  }

  static async chatGPTRequest(apiKey, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Du bist ein Experte für Werkstatt-Planung und Ressourcenoptimierung. Antworte immer auf Deutsch und im angeforderten JSON-Format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `OpenAI API Fehler: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  static parseKIAntwort(antwort, { mitarbeiter, lehrlinge, termine, schwebendeTermine }) {
    try {
      // JSON aus der Antwort extrahieren
      let json = antwort.trim();
      
      // Falls in Markdown-Blöcken
      const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        json = jsonMatch[1];
      }
      
      const parsed = JSON.parse(json);
      
      // Validierung und Anreicherung der Zuordnungen
      if (parsed.tagesZuordnungen) {
        parsed.tagesZuordnungen = parsed.tagesZuordnungen.map(z => {
          const termin = termine.find(t => t.id === z.terminId);
          const person = z.mitarbeiterTyp === 'lehrling' 
            ? lehrlinge.find(l => l.id === z.mitarbeiterId)
            : mitarbeiter.find(m => m.id === z.mitarbeiterId);
          
          return {
            ...z,
            terminInfo: termin ? `${termin.arbeit} - ${termin.kunde_name || 'k.A.'}` : 'Unbekannt',
            personName: person ? person.name : 'Unbekannt',
            gueltig: !!termin && !!person
          };
        });
      }
      
      // Schwebende Vorschläge validieren
      if (parsed.schwebendeVorschlaege) {
        parsed.schwebendeVorschlaege = parsed.schwebendeVorschlaege.map(v => {
          const termin = schwebendeTermine.find(t => t.id === v.terminId);
          const person = v.mitarbeiterTyp === 'lehrling'
            ? lehrlinge.find(l => l.id === v.mitarbeiterId)
            : mitarbeiter.find(m => m.id === v.mitarbeiterId);
          
          return {
            ...v,
            terminInfo: termin ? `${termin.arbeit} - ${termin.kunde_name || 'k.A.'}` : 'Unbekannt',
            personName: person ? person.name : 'Unbekannt',
            gueltig: !!termin
          };
        });
      }
      
      return parsed;
    } catch (e) {
      console.error('Fehler beim Parsen der KI-Antwort:', e);
      return {
        zusammenfassung: 'Die KI-Antwort konnte nicht verarbeitet werden.',
        tagesZuordnungen: [],
        schwebendeVorschlaege: [],
        warnungen: ['Fehler beim Parsen: ' + e.message],
        rohAntwort: antwort
      };
    }
  }

  static parseWochenAntwort(antwort, { wochentage, schwebendeTermine, mitarbeiter, lehrlinge }) {
    try {
      let json = antwort.trim();
      const jsonMatch = json.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        json = jsonMatch[1];
      }
      
      const parsed = JSON.parse(json);
      
      if (parsed.verteilung) {
        parsed.verteilung = parsed.verteilung.map(v => {
          const termin = schwebendeTermine.find(t => t.id === v.terminId);
          return {
            ...v,
            terminInfo: termin ? `${termin.arbeit} - ${termin.kunde_name || 'k.A.'}` : 'Unbekannt',
            gueltig: !!termin && wochentage.includes(v.empfohlenesDatum)
          };
        });
      }
      
      return parsed;
    } catch (e) {
      console.error('Fehler beim Parsen der Wochen-Antwort:', e);
      return {
        zusammenfassung: 'Die KI-Antwort konnte nicht verarbeitet werden.',
        verteilung: [],
        warnungen: ['Fehler beim Parsen: ' + e.message]
      };
    }
  }
}

module.exports = KIPlanungController;
