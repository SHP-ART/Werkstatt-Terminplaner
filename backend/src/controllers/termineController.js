const TermineModel = require('../models/termineModel');
const EinstellungenModel = require('../models/einstellungenModel');
const AbwesenheitenModel = require('../models/abwesenheitenModel');
const ArbeitszeitenModel = require('../models/arbeitszeitenModel');
const MitarbeiterModel = require('../models/mitarbeiterModel');
const LehrlingeModel = require('../models/lehrlingeModel');

// Cache für Mitarbeiter und Lehrlinge (Performance-Optimierung)
let mitarbeiterCache = { data: null, timestamp: 0 };
let lehrlingeCache = { data: null, timestamp: 0 };
let aktiveMitarbeiterCache = { data: null, timestamp: 0 };
let aktiveLehrlingeCache = { data: null, timestamp: 0 };
const CACHE_TTL = 60000; // 1 Minute

async function getCachedMitarbeiter() {
  const now = Date.now();
  if (!mitarbeiterCache.data || (now - mitarbeiterCache.timestamp > CACHE_TTL)) {
    mitarbeiterCache.data = await MitarbeiterModel.getAll();
    mitarbeiterCache.timestamp = now;
  }
  return mitarbeiterCache.data;
}

async function getCachedLehrlinge() {
  const now = Date.now();
  if (!lehrlingeCache.data || (now - lehrlingeCache.timestamp > CACHE_TTL)) {
    lehrlingeCache.data = await LehrlingeModel.getAll();
    lehrlingeCache.timestamp = now;
  }
  return lehrlingeCache.data;
}

async function getCachedAktiveMitarbeiter() {
  const now = Date.now();
  if (!aktiveMitarbeiterCache.data || (now - aktiveMitarbeiterCache.timestamp > CACHE_TTL)) {
    aktiveMitarbeiterCache.data = await MitarbeiterModel.getAktive();
    aktiveMitarbeiterCache.timestamp = now;
  }
  return aktiveMitarbeiterCache.data;
}

async function getCachedAktiveLehrlinge() {
  const now = Date.now();
  if (!aktiveLehrlingeCache.data || (now - aktiveLehrlingeCache.timestamp > CACHE_TTL)) {
    aktiveLehrlingeCache.data = await LehrlingeModel.getAktive();
    aktiveLehrlingeCache.timestamp = now;
  }
  return aktiveLehrlingeCache.data;
}

// Hilfsfunktion: Kalenderwoche berechnen (ISO 8601)
function getKalenderwoche(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  // Donnerstag dieser Woche bestimmt das Jahr der KW
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// Prüft, ob ein Lehrling an einem bestimmten Datum in der Berufsschule ist
function isLehrlingInBerufsschule(lehrling, datum) {
  if (!lehrling || !lehrling.berufsschul_wochen || !datum) {
    return false;
  }
  // berufsschul_wochen kann sein: "1,5,9,13" oder "1, 5, 9, 13"
  const kw = getKalenderwoche(datum);
  const schulwochen = lehrling.berufsschul_wochen.split(',')
    .map(w => parseInt(w.trim(), 10))
    .filter(w => !isNaN(w));
  return schulwochen.includes(kw);
}

// =====================================================
// HILFSFUNKTION: Berechnet Endzeit für einen Termin
// =====================================================
async function berechneEndzeitFuerTermin(termin, arbeitszeitenDetails) {
  try {
    // Lade Einstellungen
    const einstellungen = await EinstellungenModel.getWerkstatt();
    const nebenzeitProzent = einstellungen.nebenzeit_prozent || 0;
    
    // Lade Mitarbeiter und Lehrlinge für Aufgabenbewältigung (Cached)
    const mitarbeiter = await getCachedMitarbeiter();
    const lehrlinge = await getCachedLehrlinge();
    const mitarbeiterMap = {};
    const lehrlingeMap = {};
    mitarbeiter.forEach(m => mitarbeiterMap[m.id] = m);
    lehrlinge.forEach(l => lehrlingeMap[l.id] = l);
    
    let gesamtMinuten = 0;
    let fruehesteStartzeit = null;
    
    // Parse arbeitszeiten_details
    let details = null;
    if (arbeitszeitenDetails) {
      try {
        details = typeof arbeitszeitenDetails === 'string' 
          ? JSON.parse(arbeitszeitenDetails) 
          : arbeitszeitenDetails;
      } catch (e) {
        details = null;
      }
    }
    
    if (details) {
      for (const [key, value] of Object.entries(details)) {
        // Überspringe Meta-Felder
        if (key.startsWith('_')) {
          if (key === '_startzeit' && value) {
            fruehesteStartzeit = value;
          }
          continue;
        }
        
        let zeitMinuten = typeof value === 'object' ? (value.zeit || 0) : value;
        
        // Globale Nebenzeit anwenden
        if (nebenzeitProzent > 0 && zeitMinuten > 0) {
          zeitMinuten = zeitMinuten * (1 + nebenzeitProzent / 100);
        }
        
        // Individuelle Faktoren (Lehrling Aufgabenbewältigung)
        if (typeof value === 'object' && zeitMinuten > 0) {
          if (value.type === 'lehrling' && value.mitarbeiter_id) {
            const lehr = lehrlingeMap[value.mitarbeiter_id];
            if (lehr && lehr.aufgabenbewaeltigung_prozent && lehr.aufgabenbewaeltigung_prozent !== 100) {
              zeitMinuten = zeitMinuten * (lehr.aufgabenbewaeltigung_prozent / 100);
            }
          }
        }
        
        gesamtMinuten += zeitMinuten;
        
        // Startzeit aus Arbeit
        if (typeof value === 'object' && value.startzeit && value.startzeit !== '') {
          if (!fruehesteStartzeit || value.startzeit < fruehesteStartzeit) {
            fruehesteStartzeit = value.startzeit;
          }
        }
      }
    } else if (termin.geschaetzte_zeit) {
      // Fallback auf geschätzte Zeit
      gesamtMinuten = termin.geschaetzte_zeit;
      if (nebenzeitProzent > 0) {
        gesamtMinuten = gesamtMinuten * (1 + nebenzeitProzent / 100);
      }
    }
    
    // Startzeit bestimmen
    const startzeit = fruehesteStartzeit || termin.startzeit || termin.bring_zeit;
    
    if (!startzeit || gesamtMinuten <= 0) {
      return { startzeit: startzeit || null, endzeit: null };
    }
    
    // Endzeit berechnen
    const [startH, startM] = startzeit.split(':').map(Number);
    const startInMinuten = startH * 60 + startM;
    const endInMinuten = startInMinuten + Math.round(gesamtMinuten);
    const endH = Math.floor(endInMinuten / 60);
    const endM = endInMinuten % 60;
    const endzeit = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    
    return { startzeit, endzeit };
  } catch (e) {
    console.error('Fehler bei Endzeit-Berechnung:', e);
    return { startzeit: null, endzeit: null };
  }
}

// Einfacher In-Memory-Cache für Auslastungsdaten
const auslastungCache = new Map();
const AUSLASTUNG_CACHE_TTL = 5 * 60 * 1000; // 5 Minuten

function getCacheKey(datum, mitPuffer) {
  return `${datum}_${mitPuffer || 'false'}`;
}

function getCachedAuslastung(datum, mitPuffer) {
  const key = getCacheKey(datum, mitPuffer);
  const cached = auslastungCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < AUSLASTUNG_CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedAuslastung(datum, mitPuffer, data) {
  const key = getCacheKey(datum, mitPuffer);
  auslastungCache.set(key, {
    data: data,
    timestamp: Date.now()
  });
}

function invalidateAuslastungCache(datum) {
  // Lösche Cache für das spezifische Datum und die aktuelle Woche
  if (datum) {
    auslastungCache.delete(getCacheKey(datum, 'true'));
    auslastungCache.delete(getCacheKey(datum, 'false'));
  } else {
    // Lösche gesamten Cache
    auslastungCache.clear();
  }
}

// =====================================================
// GEMEINSAME HILFSFUNKTION FÜR AUSLASTUNGSBERECHNUNG
// =====================================================
// Diese Funktion berechnet die Auslastung für Mitarbeiter und Lehrlinge
// und wird sowohl mit als auch ohne Puffer-Parameter verwendet.
// =====================================================

function berechneAuslastungErgebnis(params) {
  const {
    row,                      // DB-Ergebnis (gesamt_minuten, etc.)
    mitPuffer,                // true/false - ob Pufferzeit verwendet wird
    mitarbeiter,              // Array aller aktiven Mitarbeiter
    lehrlinge,                // Array aller aktiven Lehrlinge
    auslastungProMitarbeiter, // DB-Ergebnis pro Mitarbeiter
    auslastungProLehrling,    // DB-Ergebnis pro Lehrling
    abwesendeMitarbeiter,     // Set mit abwesenden Mitarbeiter-IDs
    abwesendeLehrlinge,       // Set mit abwesenden Lehrling-IDs
    alleTermine,              // Alle Termine des Tages
    globaleNebenzeit,         // Nebenzeit in Prozent
    servicezeitWert,          // Servicezeit pro Termin in Minuten
    pufferzeit,               // Pufferzeit in Minuten
    urlaub,                   // Anzahl Urlaub
    krank,                    // Anzahl Krank
    debugAbwesenheiten,       // Debug-Info für Abwesenheiten
    datum                     // Das Datum
  } = params;

  // Nebenzeit-Faktor
  const nebenzeitFaktor = 1 + (globaleNebenzeit / 100);

  // Basis-Werte aus DB-Ergebnis - MIT Nebenzeit-Aufschlag für Gesamtstatistiken
  const belegtRoh = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
  const belegt = Math.round(belegtRoh * nebenzeitFaktor);
  const belegtMitPufferRoh = mitPuffer ? ((row && row.gesamt_minuten_mit_puffer) ? row.gesamt_minuten_mit_puffer : belegtRoh) : belegtRoh;
  const belegtMitPufferWert = Math.round(belegtMitPufferRoh * nebenzeitFaktor);
  
  // Status-Zeiten auch mit Nebenzeit multiplizieren
  const geplantRoh = (row && row.geplant_minuten) ? row.geplant_minuten : 0;
  const geplant = Math.round(geplantRoh * nebenzeitFaktor);
  const inArbeitRoh = (row && row.in_arbeit_minuten) ? row.in_arbeit_minuten : 0;
  const inArbeit = Math.round(inArbeitRoh * nebenzeitFaktor);
  const abgeschlossenRoh = (row && row.abgeschlossen_minuten) ? row.abgeschlossen_minuten : 0;
  const abgeschlossen = Math.round(abgeschlossenRoh * nebenzeitFaktor);
  const pufferMinuten = mitPuffer ? ((row && row.puffer_minuten) ? row.puffer_minuten : 0) : 0;

  // Gesamtanzahl der AKTIVEN Termine für Servicezeit-Berechnung
  const gesamtTerminAnzahlFuerService = (row && row.aktive_termine) 
    ? row.aktive_termine 
    : ((row && row.termin_anzahl) ? row.termin_anzahl : 0);

  // Berechne zusätzliche Zeit durch Lehrlinge (Aufgabenbewältigung)
  let lehrlingeZusaetzlicheZeit = 0;
  (alleTermine || []).forEach(termin => {
    if (termin.arbeitszeiten_details) {
      try {
        const details = JSON.parse(termin.arbeitszeiten_details);
        Object.keys(details).forEach(arbeit => {
          if (arbeit === '_gesamt_mitarbeiter_id') return;
          
          const arbeitDetail = details[arbeit];
          let zeitMinuten = 0;
          let zugeordnetId = null;
          let zugeordnetTyp = null;
          
          if (typeof arbeitDetail === 'object') {
            zeitMinuten = arbeitDetail.zeit || 0;
            if (arbeitDetail.type === 'lehrling' && arbeitDetail.lehrling_id) {
              zugeordnetId = arbeitDetail.lehrling_id;
              zugeordnetTyp = 'lehrling';
            } else if (arbeitDetail.mitarbeiter_id) {
              zugeordnetId = arbeitDetail.mitarbeiter_id;
              zugeordnetTyp = arbeitDetail.type || 'mitarbeiter';
            }
          } else {
            zeitMinuten = arbeitDetail || 0;
          }
          
          if (!zugeordnetId && details._gesamt_mitarbeiter_id) {
            const gesamt = details._gesamt_mitarbeiter_id;
            if (typeof gesamt === 'object' && gesamt.type === 'lehrling') {
              zugeordnetId = gesamt.id;
              zugeordnetTyp = 'lehrling';
            }
          }
          
          if (zugeordnetTyp === 'lehrling' && zugeordnetId && zeitMinuten > 0) {
            const lehrling = (lehrlinge || []).find(l => l.id === zugeordnetId);
            if (lehrling) {
              const aufgabenbewaeltigung = lehrling.aufgabenbewaeltigung_prozent || 100;
              const zusaetzlicheZeit = zeitMinuten * ((aufgabenbewaeltigung / 100) - 1);
              lehrlingeZusaetzlicheZeit += zusaetzlicheZeit;
            }
          }
        });
      } catch (e) {
        // Ignoriere Parsing-Fehler
      }
    }
  });

  // Erstelle Map für schnellen Zugriff auf Termin-Daten pro Mitarbeiter
  let gesamtVerfuegbar = 0;
  let gesamtTerminAnzahl = 0;
  let nurServiceZugeordneteZeit = 0;
  
  const terminDatenMap = {};
  (auslastungProMitarbeiter || []).forEach(ma => {
    const mitarbeiterId = typeof ma.mitarbeiter_id === 'number' ? ma.mitarbeiter_id : parseInt(ma.mitarbeiter_id, 10);
    terminDatenMap[mitarbeiterId] = ma;
    gesamtTerminAnzahl += ma.termin_anzahl || 0;
    
    const mitarbeiterInfo = (mitarbeiter || []).find(m => m.id === mitarbeiterId);
    if (mitarbeiterInfo) {
      const istNurService = mitarbeiterInfo.nur_service === 1 || mitarbeiterInfo.nur_service === true || 
                           mitarbeiterInfo.nur_service === '1' || mitarbeiterInfo.nur_service === 'true';
      if (istNurService) {
        nurServiceZugeordneteZeit += ma.belegt_minuten || 0;
      }
    }
  });

  // Berechne Mitarbeiter-Auslastung
  const mitarbeiterAuslastung = (mitarbeiter || []).map(m => {
    const mitarbeiterId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
    const ma = terminDatenMap[mitarbeiterId] || {
      mitarbeiter_id: mitarbeiterId,
      belegt_minuten: 0,
      geplant_minuten: 0,
      in_arbeit_minuten: 0,
      abgeschlossen_minuten: 0,
      termin_anzahl: 0
    };
    
    const arbeitszeitMinuten = (m.arbeitsstunden_pro_tag || 8) * 60;
    let verfuegbar = arbeitszeitMinuten;
    
    const istAbwesend = abwesendeMitarbeiter.has(mitarbeiterId);
    if (istAbwesend) {
      verfuegbar = 0;
    }

    const terminAnzahl = ma.termin_anzahl || 0;
    const nurService = m.nur_service === 1 || m.nur_service === true || 
                       m.nur_service === '1' || m.nur_service === 'true';
    
    let servicezeitFuerMitarbeiter = 0;
    let belegtRoh = ma.belegt_minuten || 0;
    let belegtMitNebenzeit = Math.round(belegtRoh * nebenzeitFaktor);
    let belegtMitService = belegtMitNebenzeit;
    let verfuegbarNachService = verfuegbar;
    let nebenzeitMinuten = 0;
    
    if (nurService) {
      // VEREINFACHTE BERECHNUNG für "Nur Service" Mitarbeiter:
      // Belegt = Servicezeit + Arbeitszeit (ohne Nebenzeit-Aufschlag)
      // Nebenzeit wird separat als Prozent berechnet und angezeigt
      servicezeitFuerMitarbeiter = gesamtTerminAnzahlFuerService * servicezeitWert;
      belegtMitService = belegtRoh + servicezeitFuerMitarbeiter; // Ohne Nebenzeit-Faktor
      nebenzeitMinuten = Math.round(belegtMitService * (globaleNebenzeit / 100));
      verfuegbarNachService = verfuegbar;
    } else {
      servicezeitFuerMitarbeiter = 0;
      belegtMitService = belegtMitNebenzeit;
      nebenzeitMinuten = belegtMitNebenzeit - belegtRoh;
      verfuegbarNachService = verfuegbar;
      if (!istAbwesend) {
        gesamtVerfuegbar += verfuegbar;
      }
    }

    const prozent = verfuegbarNachService > 0 
      ? (belegtMitService / verfuegbarNachService) * 100 
      : (istAbwesend ? 0 : 100);

    return {
      mitarbeiter_id: m.id,
      mitarbeiter_name: m.name,
      arbeitsstunden_pro_tag: m.arbeitsstunden_pro_tag,
      nebenzeit_prozent: globaleNebenzeit,
      nebenzeit_minuten: nebenzeitMinuten,
      nur_service: nurService,
      ist_abwesend: istAbwesend,
      verfuegbar_minuten: verfuegbarNachService,
      belegt_minuten: belegtMitService,
      belegt_minuten_roh: belegtRoh,
      servicezeit_minuten: servicezeitFuerMitarbeiter,
      auslastung_prozent: Math.round(prozent),
      geplant_minuten: ma.geplant_minuten || 0,
      in_arbeit_minuten: ma.in_arbeit_minuten || 0,
      abgeschlossen_minuten: ma.abgeschlossen_minuten || 0,
      termin_anzahl: terminAnzahl
    };
  });

  // Berechne Lehrlinge-Auslastung
  const lehrlingeAuslastung = Array.isArray(auslastungProLehrling)
    ? auslastungProLehrling.map(la => {
        const lehrlingId = typeof la.lehrling_id === 'number' ? la.lehrling_id : parseInt(la.lehrling_id, 10);
        const istAbwesend = abwesendeLehrlinge.has(lehrlingId);
        const arbeitszeitMinuten = (la.arbeitsstunden_pro_tag || 8) * 60;
        const verfuegbar = istAbwesend ? 0 : arbeitszeitMinuten;
        const belegtRoh = la.belegt_minuten_roh || la.belegt_minuten || 0;
        const belegtMitNebenzeit = Math.round(belegtRoh * nebenzeitFaktor);
        const auslastung = verfuegbar > 0
          ? Math.round((belegtMitNebenzeit / verfuegbar) * 100)
          : (istAbwesend ? 0 : 100);

        return {
          lehrling_id: la.lehrling_id,
          lehrling_name: la.lehrling_name,
          arbeitsstunden_pro_tag: la.arbeitsstunden_pro_tag,
          nebenzeit_prozent: globaleNebenzeit,
          aufgabenbewaeltigung_prozent: la.aufgabenbewaeltigung_prozent,
          ist_abwesend: istAbwesend,
          verfuegbar_minuten: verfuegbar,
          belegt_minuten: belegtMitNebenzeit,
          belegt_minuten_roh: belegtRoh,
          servicezeit_minuten: la.servicezeit_minuten || 0,
          auslastung_prozent: auslastung,
          geplant_minuten: la.geplant_minuten,
          in_arbeit_minuten: la.in_arbeit_minuten,
          abgeschlossen_minuten: la.abgeschlossen_minuten,
          termin_anzahl: la.termin_anzahl
        };
      })
    : [];

  // Lehrlinge erhöhen verfügbare Zeit
  const lehrlingeVerfuegbar = (lehrlinge || []).reduce((sum, l) => {
    const lehrlingId = typeof l.id === 'number' ? l.id : parseInt(l.id, 10);
    const istAbwesend = abwesendeLehrlinge.has(lehrlingId);
    if (istAbwesend) return sum;
    
    const arbeitszeitMinuten = (l.arbeitsstunden_pro_tag || 8) * 60;
    const aufgabenbewaeltigung = (l.aufgabenbewaeltigung_prozent || 100) / 100;
    const effektiveVerfuegbar = arbeitszeitMinuten / aufgabenbewaeltigung;
    return sum + effektiveVerfuegbar;
  }, 0);
  
  gesamtVerfuegbar = gesamtVerfuegbar + lehrlingeVerfuegbar;

  // Berechne Gesamtauslastung
  const belegtOhneNurService = Math.max(belegtMitPufferWert - nurServiceZugeordneteZeit, 0);
  const belegtMitService = belegtOhneNurService + lehrlingeZusaetzlicheZeit;
  const verfuegbar = Math.max(gesamtVerfuegbar - belegtMitService, 0);
  
  // Auslastung berechnen: Belegte Zeit / Verfügbare Zeit
  let prozent = 0;
  
  if (gesamtVerfuegbar > 0) {
    // Einfache Berechnung: belegte Zeit / verfügbare Gesamtzeit
    prozent = (belegtMitService / gesamtVerfuegbar) * 100;
  } else if (belegtMitService > 0) {
    // Es gibt Termine aber keine Kapazität - zeige 100% (voll ausgelastet)
    prozent = 100;
  }
  
  // Für die Ausgabe: wenn keine Kapazität verfügbar ist, setze gesamt_minuten auf 0
  const gesamtMinutenAusgabe = gesamtVerfuegbar > 0 ? gesamtVerfuegbar : 0;

  // Ergebnis-Objekt zusammenstellen
  const result = {
    belegt_minuten: belegt,
    belegt_minuten_mit_service: belegtMitService,
    servicezeit_minuten: 0, // Servicezeit ist in mitarbeiter_auslastung enthalten
    verfuegbar_minuten: verfuegbar,
    gesamt_minuten: gesamtMinutenAusgabe,
    auslastung_prozent: Math.round(prozent),
    geplant_minuten: geplant,
    in_arbeit_minuten: inArbeit,
    abgeschlossen_minuten: abgeschlossen,
    mitarbeiter_auslastung: mitarbeiterAuslastung,
    lehrlinge_auslastung: lehrlingeAuslastung,
    lehrlinge: (lehrlinge || []).map(l => ({
      id: l.id,
      name: l.name,
      nebenzeit_prozent: l.nebenzeit_prozent,
      aufgabenbewaeltigung_prozent: l.aufgabenbewaeltigung_prozent
    })),
    einstellungen: {
      pufferzeit_minuten: pufferzeit,
      servicezeit_minuten: servicezeitWert
    },
    abwesenheit: {
      urlaub,
      krank
    },
    _debug: {
      abwesendeMitarbeiterIds: Array.from(abwesendeMitarbeiter || []),
      abwesendeLehrlingeIds: Array.from(abwesendeLehrlinge || []),
      gefundeneAbwesenheiten: debugAbwesenheiten || []
    }
  };

  // Zusätzliche Felder bei Puffer-Modus
  if (mitPuffer) {
    result.belegt_minuten_mit_puffer = belegtMitPufferWert;
    result.puffer_minuten = pufferMinuten;
  }

  return result;
}

class TermineController {
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const termin = await TermineModel.getById(id);
      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }
      res.json(termin);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getAll(req, res) {
    try {
      const { datum } = req.query;

      if (datum) {
        const rows = await TermineModel.getByDatum(datum);
        res.json(rows);
      } else {
        const rows = await TermineModel.getAll();
        res.json(rows);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    try {
      const kilometerstand = req.body.kilometerstand !== undefined && req.body.kilometerstand !== null
        ? parseInt(req.body.kilometerstand, 10)
        : null;
      const kilometerstandWert = Number.isFinite(kilometerstand) ? kilometerstand : null;

      const mitarbeiter_id = req.body.mitarbeiter_id !== undefined && req.body.mitarbeiter_id !== null && req.body.mitarbeiter_id !== ''
        ? parseInt(req.body.mitarbeiter_id, 10)
        : null;
      const mitarbeiter_id_wert = Number.isFinite(mitarbeiter_id) ? mitarbeiter_id : null;

      // Ersatzauto-Tage parsen
      const ersatzauto_tage = req.body.ersatzauto_tage 
        ? parseInt(req.body.ersatzauto_tage, 10) 
        : null;
      const ersatzauto_tage_wert = Number.isFinite(ersatzauto_tage) && ersatzauto_tage > 0 
        ? ersatzauto_tage 
        : null;

      // VALIDIERUNG: Wenn Ersatzauto gewünscht, muss Dauer oder Abholdatum angegeben sein
      const ersatzautoGewuenscht = req.body.ersatzauto === true || req.body.ersatzauto === 1 || req.body.ersatzauto === '1';
      const hatErsatzautoDauer = ersatzauto_tage_wert !== null && ersatzauto_tage_wert > 0;
      const hatErsatzautoBisDatum = req.body.ersatzauto_bis_datum && req.body.ersatzauto_bis_datum.trim() !== '';
      const hatAbholungDatum = req.body.abholung_datum && req.body.abholung_datum.trim() !== '';
      const hatAbholungZeit = req.body.abholung_zeit && req.body.abholung_zeit.trim() !== '';
      const istTelRuecksprache = req.body.abholung_typ === 'ruecksprache';
      
      if (ersatzautoGewuenscht) {
        // Bei tel. Rücksprache: Tage sind Pflicht
        if (istTelRuecksprache && !hatErsatzautoDauer) {
          return res.status(400).json({ 
            error: 'Bei Ersatzauto mit tel. Rücksprache muss die Anzahl Tage angegeben werden.' 
          });
        }
        // Bei anderen Typen: Entweder Tage, Bis-Datum oder Abholdatum
        if (!istTelRuecksprache && !hatErsatzautoDauer && !hatErsatzautoBisDatum && !hatAbholungDatum && !hatAbholungZeit) {
          return res.status(400).json({ 
            error: 'Bei Ersatzauto-Buchung muss entweder die Anzahl Tage oder ein Abholdatum angegeben werden.' 
          });
        }
      }

      const payload = {
        ...req.body,
        kilometerstand: kilometerstandWert,
        ersatzauto: req.body.ersatzauto ? 1 : 0,
        ersatzauto_tage: ersatzauto_tage_wert,
        ersatzauto_bis_datum: req.body.ersatzauto_bis_datum || null,
        ersatzauto_bis_zeit: req.body.ersatzauto_bis_zeit || null,
        abholung_datum: req.body.abholung_datum || null,
        abholung_zeit: req.body.abholung_zeit || null,
        bring_zeit: req.body.bring_zeit || null,
        kontakt_option: req.body.kontakt_option || null,
        mitarbeiter_id: mitarbeiter_id_wert
      };

      const result = await TermineModel.create(payload);
      // Cache invalidierten
      invalidateAuslastungCache(payload.datum);
      res.json({
        id: result.id,
        termin_nr: result.terminNr,
        message: 'Termin erfolgreich erstellt'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async update(req, res) {
    try {
      const { tatsaechliche_zeit, mitarbeiter_id, status } = req.body;
      const sollteLernen = tatsaechliche_zeit && tatsaechliche_zeit > 0;

      // Parse mitarbeiter_id
      const mitarbeiter_id_wert = mitarbeiter_id !== undefined && mitarbeiter_id !== null && mitarbeiter_id !== ''
        ? (Number.isFinite(parseInt(mitarbeiter_id, 10)) ? parseInt(mitarbeiter_id, 10) : null)
        : undefined;

      const updateData = { ...req.body };
      if (mitarbeiter_id_wert !== undefined) {
        updateData.mitarbeiter_id = mitarbeiter_id_wert;
      }

      // Hole erst das Datum des Termins, um Cache zu invalidierten
      const termin = await TermineModel.getById(req.params.id);
      
      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      // Feature 10: Automatische Zeitberechnung bei Abschluss
      // Wenn Status auf "abgeschlossen" gesetzt wird und keine tatsächliche Zeit angegeben,
      // berechne automatisch aus aktueller Uhrzeit - Startzeit
      // ABER nur wenn: Termin heute ist UND aktuelle Zeit nach Startzeit liegt
      const neuerStatus = status || updateData.status;
      if (neuerStatus === 'abgeschlossen' && 
          termin.status !== 'abgeschlossen' && // War vorher nicht abgeschlossen
          !tatsaechliche_zeit && // Keine tatsächliche Zeit übergeben
          termin.bring_zeit) {
        
        const jetzt = new Date();
        const heute = jetzt.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Nur automatisch berechnen wenn der Termin HEUTE ist
        if (termin.datum === heute) {
          const [startH, startM] = termin.bring_zeit.split(':').map(Number);
          const startMinuten = startH * 60 + startM;
          const jetztMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();
          
          // Nur berechnen wenn aktuelle Zeit NACH der Startzeit liegt
          if (jetztMinuten > startMinuten) {
            // Berechne tatsächliche Arbeitszeit in Minuten
            let berechneteZeit = jetztMinuten - startMinuten;
            
            // Sicherheit: maximal geschätzte Zeit * 2 (sonst unrealistisch)
            if (termin.geschaetzte_zeit && berechneteZeit > termin.geschaetzte_zeit * 2) {
              console.log(`[Auto-Zeit] Termin ${termin.id}: Berechnete Zeit (${berechneteZeit} Min) zu hoch, keine automatische Berechnung`);
            } else {
              updateData.tatsaechliche_zeit = berechneteZeit;
              console.log(`[Auto-Zeit] Termin ${termin.id}: Automatisch berechnete Zeit = ${berechneteZeit} Min (Start: ${termin.bring_zeit}, Jetzt: ${jetzt.getHours()}:${String(jetzt.getMinutes()).padStart(2, '0')})`);
            }
          } else {
            console.log(`[Auto-Zeit] Termin ${termin.id}: Keine automatische Berechnung - aktuelle Zeit (${jetztMinuten} Min) liegt vor Startzeit (${startMinuten} Min)`);
          }
        } else {
          console.log(`[Auto-Zeit] Termin ${termin.id}: Keine automatische Berechnung - Termin ist nicht heute (${termin.datum} != ${heute})`);
        }
      }

      // Wenn arbeitszeiten_details geändert wird, berechne Endzeit neu
      if (updateData.arbeitszeiten_details !== undefined) {
        const terminMitUpdate = { ...termin, ...updateData };
        const { startzeit, endzeit } = await berechneEndzeitFuerTermin(terminMitUpdate, updateData.arbeitszeiten_details);
        if (startzeit) updateData.startzeit = startzeit;
        if (endzeit) updateData.endzeit_berechnet = endzeit;
      }

      const result = await TermineModel.update(req.params.id, updateData);
      const changes = (result && result.changes) || 0;
      
      // Cache invalidierten
      if (termin && termin.datum) {
        invalidateAuslastungCache(termin.datum);
      }

      // Lernfunktion deaktiviert - überschreibt sonst manuelle Einstellungen
      // TODO: Später optional als Opt-In Feature mit Zeitstempel-Check implementieren
      // if (sollteLernen && termin && termin.arbeit) {
      //   TermineController.lerneAusTatsaechlicherZeit(termin.arbeit, tatsaechliche_zeit, (lernErr) => {
      //     if (lernErr) {
      //       console.error('Fehler bei Lernfunktion:', lernErr);
      //     }
      //   });
      // }

      if (changes === 0) {
        return res.status(200).json({ 
          changes: 0, 
          message: 'Keine Änderungen vorgenommen (Daten identisch)' 
        });
      }

      // Antwort mit automatisch berechneter Zeit
      const response = { 
        changes, 
        message: 'Termin aktualisiert'
      };
      
      if (updateData.tatsaechliche_zeit && !tatsaechliche_zeit) {
        response.berechneteZeit = updateData.tatsaechliche_zeit;
        response.message = `Termin abgeschlossen. Arbeitszeit: ${updateData.tatsaechliche_zeit} Minuten.`;
      }

      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async lerneAusTatsaechlicherZeit(arbeitText, tatsaechlicheZeit) {
    // Teile die Arbeiten auf (kann durch Komma oder Zeilenumbruch getrennt sein)
    const arbeiten = arbeitText
      .split(/[\r\n,]+/)
      .map(a => a.trim())
      .filter(Boolean);

    if (arbeiten.length === 0) {
      return null;
    }

    // Berechne durchschnittliche Zeit pro Arbeit
    const zeitProArbeit = Math.round(tatsaechlicheZeit / arbeiten.length);

    // Aktualisiere Standardzeiten für jede Arbeit
    let aktualisiert = 0;
    let fehler = 0;

    for (let i = 0; i < arbeiten.length; i++) {
      const arbeit = arbeiten[i];
      try {
        const result = await ArbeitszeitenModel.updateByBezeichnung(arbeit, zeitProArbeit);
        if (result && result.changes > 0) {
          aktualisiert++;
          console.log(`Standardzeit für "${arbeit}" aktualisiert: ${result.alte_zeit} -> ${result.neue_zeit} Min (basierend auf ${result.tatsaechliche_zeit} Min)`);
        }
      } catch (err) {
        console.error(`Fehler beim Aktualisieren von ${arbeit}:`, err);
        fehler++;
      }
    }

    return { aktualisiert, fehler };
  }

  static async delete(req, res) {
    try {
      // Hole erst das Datum des Termins, um Cache zu invalidierten
      const termin = await TermineModel.getById(req.params.id);
      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      const result = await TermineModel.delete(req.params.id);

      // Cache invalidierten
      if (termin && termin.datum) {
        invalidateAuslastungCache(termin.datum);
      }
      res.json({ changes: (result && result.changes) || 0, message: 'Termin gelöscht' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getAuslastung(req, res) {
    try {
      const { datum } = req.params;
      const { mitPuffer } = req.query; // Optional: ?mitPuffer=true
      const fallbackSettings = { pufferzeit_minuten: 15 };

      console.log('========================================');
      console.log(`getAuslastung aufgerufen für Datum: ${datum}, mitPuffer: ${mitPuffer}`);
      console.log('========================================');

      // Cache für dieses Datum invalidieren, um sicherzustellen, dass Abwesenheiten berücksichtigt werden
      console.log('🗑️ Invalidiere Cache für Datum:', datum);
      invalidateAuslastungCache(datum);
      
      const einstellungen = await EinstellungenModel.getWerkstatt();

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;
      const globaleNebenzeit = einstellungen?.nebenzeit_prozent || 0; // Globale Nebenzeit

      // Lade alle aktiven Mitarbeiter
      console.log('👥 Lade aktive Mitarbeiter (Cached)...');
      const mitarbeiter = await getCachedAktiveMitarbeiter();
      console.log(`✅ ${(mitarbeiter || []).length} Mitarbeiter geladen:`, (mitarbeiter || []).map(m => `${m.name} (ID: ${m.id})`).join(', '));

      // Lade alle aktiven Lehrlinge
      console.log('👥 Lade aktive Lehrlinge (Cached)...');
      const lehrlinge = await getCachedAktiveLehrlinge();
      console.log(`✅ ${(lehrlinge || []).length} Lehrlinge geladen`);

      const abwesenheit = await AbwesenheitenModel.getByDatum(datum);

      const urlaub = abwesenheit?.urlaub || 0;
      const krank = abwesenheit?.krank || 0;

      // Lade individuelle Mitarbeiter/Lehrlinge-Abwesenheiten für dieses Datum
      console.log(`Lade Abwesenheiten für Datum: ${datum}`);
      const individuelleAbwesenheiten = await AbwesenheitenModel.getForDate(datum);

      console.log(`✅ Abwesenheiten geladen: ${(individuelleAbwesenheiten || []).length} Einträge`);
      console.log(`   Details: ${JSON.stringify(individuelleAbwesenheiten || [])}`);

      // DEBUG: Speichere Abwesenheiten für Response
      const debugAbwesenheiten = [];

      // Erstelle Maps für schnelle Abwesenheits-Abfrage
      const abwesendeMitarbeiter = new Set();
      const abwesendeLehrlinge = new Set();
      (individuelleAbwesenheiten || []).forEach(abw => {
        console.log(`   Verarbeite: mitarbeiter_id=${abw.mitarbeiter_id}, lehrling_id=${abw.lehrling_id}`);
        if (abw.mitarbeiter_id !== null && abw.mitarbeiter_id !== undefined) {
          // Stelle sicher, dass die ID als Zahl gespeichert wird
          const mitarbeiterId = parseInt(abw.mitarbeiter_id, 10);
          if (!isNaN(mitarbeiterId)) {
            abwesendeMitarbeiter.add(mitarbeiterId);
            console.log(`   ✓ Mitarbeiter ${mitarbeiterId} (${abw.mitarbeiter_name}) zu Set hinzugefügt`);
            debugAbwesenheiten.push({
              typ: 'mitarbeiter',
              id: mitarbeiterId,
              name: abw.mitarbeiter_name,
              von: abw.von_datum,
              bis: abw.bis_datum
            });
          } else {
            console.error(`   ✗ Fehler: Mitarbeiter-ID konnte nicht geparst werden: ${abw.mitarbeiter_id}`);
          }
        }
        if (abw.lehrling_id !== null && abw.lehrling_id !== undefined) {
          // Stelle sicher, dass die ID als Zahl gespeichert wird
          const lehrlingId = parseInt(abw.lehrling_id, 10);
          if (!isNaN(lehrlingId)) {
            abwesendeLehrlinge.add(lehrlingId);
            console.log(`   ✓ Lehrling ${lehrlingId} (${abw.lehrling_name}) zu Set hinzugefügt`);
            debugAbwesenheiten.push({
              typ: 'lehrling',
              id: lehrlingId,
              name: abw.lehrling_name,
              von: abw.von_datum,
              bis: abw.bis_datum
            });
          } else {
            console.error(`   ✗ Fehler: Lehrling-ID konnte nicht geparst werden: ${abw.lehrling_id}`);
          }
        }
      });
      
      // Prüfe zusätzlich Lehrlinge in Berufsschul-Wochen
      console.log(`📚 Prüfe Berufsschul-Wochen für Datum: ${datum}`);
      const aktuelleKW = getKalenderwoche(datum);
      console.log(`   Aktuelle KW: ${aktuelleKW}`);
      (lehrlinge || []).forEach(lehrling => {
        if (isLehrlingInBerufsschule(lehrling, datum)) {
          // Nur hinzufügen wenn nicht schon abwesend (Urlaub/Krank)
          if (!abwesendeLehrlinge.has(lehrling.id)) {
            abwesendeLehrlinge.add(lehrling.id);
            console.log(`   ✓ Lehrling ${lehrling.id} (${lehrling.name}) in Berufsschule (KW ${aktuelleKW})`);
            debugAbwesenheiten.push({
              typ: 'lehrling',
              id: lehrling.id,
              name: lehrling.name,
              grund: `Berufsschule (KW ${aktuelleKW})`,
              berufsschul_wochen: lehrling.berufsschul_wochen
            });
          }
        }
      });
      
      console.log(`✅ Abwesende Mitarbeiter IDs im Set: [${Array.from(abwesendeMitarbeiter).join(', ')}]`);
      console.log(`✅ Abwesende Lehrlinge IDs im Set: [${Array.from(abwesendeLehrlinge).join(', ')}]`);

      // Berechne Auslastung pro Mitarbeiter
      // servicezeit muss hier verfügbar sein für die Callback-Funktionen
      const servicezeitWert = servicezeit;
      
      // Lade alle Termine für das Datum, um arbeitszeiten_details zu prüfen (für Lehrlinge Aufgabenbewältigung)
      const alleTermine = await TermineModel.getTermineByDatum(datum);

      // Berechne zusätzliche Zeit durch Lehrlinge (Aufgabenbewältigung)
      let lehrlingeZusaetzlicheZeit = 0;
      (alleTermine || []).forEach(termin => {
        if (termin.arbeitszeiten_details) {
          try {
            const details = JSON.parse(termin.arbeitszeiten_details);
            Object.keys(details).forEach(arbeit => {
              if (arbeit === '_gesamt_mitarbeiter_id') return; // Überspringe Metadaten
              
              const arbeitDetail = details[arbeit];
              let zeitMinuten = 0;
              let zugeordnetId = null;
              let zugeordnetTyp = null;
              
              if (typeof arbeitDetail === 'object') {
                zeitMinuten = arbeitDetail.zeit || 0;
                if (arbeitDetail.type === 'lehrling' && arbeitDetail.lehrling_id) {
                  zugeordnetId = arbeitDetail.lehrling_id;
                  zugeordnetTyp = 'lehrling';
                } else if (arbeitDetail.mitarbeiter_id) {
                  zugeordnetId = arbeitDetail.mitarbeiter_id;
                  zugeordnetTyp = arbeitDetail.type || 'mitarbeiter';
                }
              } else {
                zeitMinuten = arbeitDetail || 0;
              }
              
              // Prüfe Gesamt-Zuordnung, wenn keine individuelle Zuordnung
              if (!zugeordnetId && details._gesamt_mitarbeiter_id) {
                const gesamt = details._gesamt_mitarbeiter_id;
                if (typeof gesamt === 'object' && gesamt.type === 'lehrling') {
                  zugeordnetId = gesamt.id;
                  zugeordnetTyp = 'lehrling';
                }
              }
              
              // Wenn Lehrling zugeordnet, berechne zusätzliche Zeit durch Aufgabenbewältigung
              if (zugeordnetTyp === 'lehrling' && zugeordnetId && zeitMinuten > 0) {
                const lehrling = (lehrlinge || []).find(l => l.id === zugeordnetId);
                if (lehrling) {
                  const aufgabenbewaeltigung = lehrling.aufgabenbewaeltigung_prozent || 100;
                  const zusaetzlicheZeit = zeitMinuten * ((aufgabenbewaeltigung / 100) - 1);
                  lehrlingeZusaetzlicheZeit += zusaetzlicheZeit;
                }
              }
            });
          } catch (e) {
            // Ignoriere Parsing-Fehler
          }
        }
      });

      const auslastungProMitarbeiter = await TermineModel.getAuslastungProMitarbeiter(datum);

      // Berechne Auslastung pro Lehrling
      const auslastungProLehrling = await TermineModel.getAuslastungProLehrling(datum);

      // REFACTORED: Einheitlicher Callback für beide Code-Pfade (mit/ohne Puffer)
      // Rufe die passende DB-Methode auf (mit oder ohne Puffer)
      let row;
      if (mitPuffer === 'true') {
        row = await TermineModel.getAuslastungMitPuffer(datum, pufferzeit);
      } else {
        row = await TermineModel.getAuslastung(datum);
      }

      // Lade schwebende Termine für das Ergebnis
      const schwebendRow = await TermineModel.getAlleSchwebendenTermine();

      const schwebendAnzahl = (schwebendRow && schwebendRow.schwebend_anzahl) ? schwebendRow.schwebend_anzahl : 0;
      const schwebendMinuten = (schwebendRow && schwebendRow.schwebend_minuten) ? schwebendRow.schwebend_minuten : 0;

      // Verwende die gemeinsame Berechnungsfunktion
      const result = berechneAuslastungErgebnis({
        row,
        mitPuffer: mitPuffer === 'true',
        mitarbeiter,
        lehrlinge,
        auslastungProMitarbeiter,
        auslastungProLehrling,
        abwesendeMitarbeiter,
        abwesendeLehrlinge,
        alleTermine,
        globaleNebenzeit,
        servicezeitWert,
        pufferzeit,
        urlaub,
        krank,
        debugAbwesenheiten,
        datum
      });

      // Füge schwebende Termine hinzu
      result.schwebend_minuten = schwebendMinuten;
      result.schwebend_anzahl = schwebendAnzahl;

      setCachedAuslastung(datum, mitPuffer, result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async checkAvailability(req, res) {
    try {
      const { datum, dauer } = req.query;
      const geschaetzteZeit = dauer ? parseInt(dauer, 10) : null;

      if (!datum) {
        return res.status(400).json({ error: 'Datum ist erforderlich' });
      }

      if (!geschaetzteZeit || geschaetzteZeit <= 0) {
        return res.status(400).json({ error: 'Gültige Dauer ist erforderlich' });
      }

      const fallbackSettings = { pufferzeit_minuten: 15 };

      const einstellungen = await EinstellungenModel.getWerkstatt();

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;

      // Lade aktive Mitarbeiter und berechne verfügbare Zeit
      const mitarbeiter = await MitarbeiterModel.getAktive();

      const abwesenheit = await AbwesenheitenModel.getByDatum(datum);

      const urlaub = abwesenheit?.urlaub || 0;
      const krank = abwesenheit?.krank || 0;
      const mitarbeiterAnzahl = (mitarbeiter || []).length;
      const verfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - urlaub - krank, 0);
      
      // Berechne verfügbare Zeit aus allen Mitarbeitern
      // NEU: Volle Arbeitszeit als Kapazität (Nebenzeit wird bei belegter Zeit aufgeschlagen)
      let arbeitszeit_pro_tag = 0;
      (mitarbeiter || []).forEach(ma => {
        const arbeitszeitMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
        arbeitszeit_pro_tag += arbeitszeitMinuten; // Volle Kapazität
      });
      arbeitszeit_pro_tag = Math.max(arbeitszeit_pro_tag, 1);

      // Hole aktuelle Auslastung mit Pufferzeiten
      const row = await TermineModel.getAuslastungMitPuffer(datum, pufferzeit);

      const aktuellBelegt = (row && row.gesamt_minuten_mit_puffer) ? row.gesamt_minuten_mit_puffer : (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
      const aktiveTermine = (row && row.aktive_termine) ? row.aktive_termine : 0;
      // Neuer Termin würde zusätzliche Pufferzeit benötigen (wenn es bereits aktive Termine gibt)
      const zusaetzlichePufferzeit = aktiveTermine > 0 ? pufferzeit : 0;
      // Servicezeit wird NICHT berücksichtigt, da sie nur den nur_service Mitarbeitern zugerechnet wird
      const neueBelegung = aktuellBelegt + geschaetzteZeit + zusaetzlichePufferzeit;
      const verfuegbarNachService = arbeitszeit_pro_tag;
      
      const aktuelleAuslastung = (aktuellBelegt / arbeitszeit_pro_tag) * 100;
      const neueAuslastung = (neueBelegung / verfuegbarNachService) * 100;

      let warnung = null;
      let blockiert = false;

      if (neueAuslastung > 100) {
        blockiert = true;
        warnung = 'Überlastung: Dieser Termin würde die verfügbare Kapazität überschreiten.';
      } else if (neueAuslastung > 80) {
        warnung = 'Warnung: Hohe Auslastung erwartet (>80%).';
      }

      res.json({
        verfuegbar: !blockiert,
        blockiert: blockiert,
        warnung: warnung,
        aktuelle_auslastung_prozent: Math.round(aktuelleAuslastung),
        neue_auslastung_prozent: Math.round(neueAuslastung),
        aktuell_belegt_minuten: aktuellBelegt,
        neue_belegung_minuten: neueBelegung,
        verfuegbar_minuten: verfuegbarNachService,
        geschaetzte_zeit: geschaetzteZeit,
        einstellungen: {
          mitarbeiter_anzahl: mitarbeiterAnzahl,
          pufferzeit_minuten: pufferzeit,
          servicezeit_minuten: servicezeit,
          verfuegbare_mitarbeiter: verfuegbareMitarbeiter
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async validate(req, res) {
    try {
      const { datum, geschaetzte_zeit } = req.body;

      if (!datum) {
        return res.status(400).json({ error: 'Datum ist erforderlich' });
      }

      if (!geschaetzte_zeit || geschaetzte_zeit <= 0) {
        return res.status(400).json({ error: 'Gültige geschätzte Zeit ist erforderlich' });
      }

      // Verwende die gleiche Logik wie checkAvailability
      const fallbackSettings = { pufferzeit_minuten: 15 };

      const einstellungen = await EinstellungenModel.getWerkstatt();

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;

      // Lade aktive Mitarbeiter und berechne verfügbare Zeit
      const mitarbeiter = await MitarbeiterModel.getAktive();

      const abwesenheit = await AbwesenheitenModel.getByDatum(datum);

      const urlaub = abwesenheit?.urlaub || 0;
      const krank = abwesenheit?.krank || 0;
      const mitarbeiterAnzahl = (mitarbeiter || []).length;
      const verfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - urlaub - krank, 0);
      
      // Berechne verfügbare Zeit aus allen Mitarbeitern
      // NEU: Volle Arbeitszeit als Kapazität (Nebenzeit wird bei belegter Zeit aufgeschlagen)
      let arbeitszeit_pro_tag = 0;
      (mitarbeiter || []).forEach(ma => {
        const arbeitszeitMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
        arbeitszeit_pro_tag += arbeitszeitMinuten; // Volle Kapazität
      });
      arbeitszeit_pro_tag = Math.max(arbeitszeit_pro_tag, 1);

      // Hole aktuelle Auslastung mit Pufferzeiten
      const row = await TermineModel.getAuslastungMitPuffer(datum, pufferzeit);

      const aktuellBelegt = (row && row.gesamt_minuten_mit_puffer) ? row.gesamt_minuten_mit_puffer : (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
      const aktiveTermine = (row && row.aktive_termine) ? row.aktive_termine : 0;
      // Neuer Termin würde zusätzliche Pufferzeit benötigen
      const zusaetzlichePufferzeit = aktiveTermine > 0 ? pufferzeit : 0;
      // Servicezeit wird NICHT berücksichtigt, da sie nur den nur_service Mitarbeitern zugerechnet wird
      const neueBelegung = aktuellBelegt + geschaetzte_zeit + zusaetzlichePufferzeit;
      const verfuegbarNachService = arbeitszeit_pro_tag;
      const neueAuslastung = (neueBelegung / verfuegbarNachService) * 100;

      let warnung = null;
      let blockiert = false;

      if (neueAuslastung > 100) {
        blockiert = true;
        warnung = 'Überlastung: Dieser Termin würde die verfügbare Kapazität überschreiten.';
      } else if (neueAuslastung > 80) {
        warnung = 'Warnung: Hohe Auslastung erwartet (>80%).';
      }

      res.json({
        gueltig: !blockiert,
        blockiert: blockiert,
        warnung: warnung,
        neue_auslastung_prozent: Math.round(neueAuslastung),
        verfuegbar_minuten: verfuegbarNachService,
        belegt_minuten: neueBelegung
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getVorschlaege(req, res) {
    try {
      const { datum, dauer } = req.query;
      const geschaetzteZeit = dauer ? parseInt(dauer, 10) : null;

      if (!datum) {
        return res.status(400).json({ error: 'Datum ist erforderlich' });
      }

      if (!geschaetzteZeit || geschaetzteZeit <= 0) {
        return res.status(400).json({ error: 'Gültige Dauer ist erforderlich' });
      }

      const fallbackSettings = { pufferzeit_minuten: 15 };

      const einstellungen = await EinstellungenModel.getWerkstatt();

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;

      // Lade aktive Mitarbeiter und berechne verfügbare Zeit
      const mitarbeiter = await MitarbeiterModel.getAktive();

      const mitarbeiterAnzahl = (mitarbeiter || []).length;
      
      // Berechne verfügbare Zeit aus allen Mitarbeitern
      // NEU: Volle Arbeitszeit als Kapazität (Nebenzeit wird bei belegter Zeit aufgeschlagen)
      let arbeitszeit_pro_tag = 0;
      (mitarbeiter || []).forEach(ma => {
        const arbeitszeitMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
        arbeitszeit_pro_tag += arbeitszeitMinuten; // Volle Kapazität
      });
      arbeitszeit_pro_tag = Math.max(arbeitszeit_pro_tag, 1);

      const abwesenheit = await AbwesenheitenModel.getByDatum(datum);

      const urlaub = abwesenheit?.urlaub || 0;
      const krank = abwesenheit?.krank || 0;
      const verfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - urlaub - krank, 0);

      // Hole aktuelle Termine für das Datum
      const termine = await TermineModel.getTermineByDatum(datum);

      // Berechne aktuelle Belegung mit Pufferzeiten
      let aktuelleBelegung = 0;
      let aktiveTermine = 0;
      (termine || []).forEach(termin => {
        const zeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
        aktuelleBelegung += zeit;
        if (termin.status !== 'abgeschlossen') {
          aktiveTermine++;
        }
      });

      // Füge Pufferzeiten hinzu (Servicezeit wird NICHT berücksichtigt, da sie nur den nur_service Mitarbeitern zugerechnet wird)
      const pufferZeitGesamt = Math.max((aktiveTermine - 1) * pufferzeit, 0);
      aktuelleBelegung += pufferZeitGesamt;

      // Berechne verfügbare Kapazität
      const verfuegbarNachService = arbeitszeit_pro_tag;
      const verfuegbar = verfuegbarNachService - aktuelleBelegung;
      const benoetigteZeit = geschaetzteZeit + (aktiveTermine > 0 ? pufferzeit : 0);

      // Prüfe ob am gewünschten Datum Platz ist
      const vorschlaege = [];
      if (verfuegbar >= benoetigteZeit) {
        vorschlaege.push({
          datum: datum,
          verfuegbar_minuten: verfuegbar,
          auslastung_nach_termin: Math.round(((aktuelleBelegung + benoetigteZeit) / verfuegbarNachService) * 100),
          empfohlen: true,
          grund: 'Verfügbar am gewünschten Datum'
        });
      }

      // Suche alternative Daten (nächste 7 Tage)
      const startDatum = new Date(datum);
      const alternativeDaten = [];
      for (let i = 1; i <= 7; i++) {
        const checkDatum = new Date(startDatum);
        checkDatum.setDate(startDatum.getDate() + i);
        // Überspringe Sonntag (Tag 0)
        if (checkDatum.getDay() !== 0) {
          alternativeDaten.push(checkDatum.toISOString().split('T')[0]);
        }
      }

      // Prüfe alternative Daten (rekursiv async)
      const maxAlternativen = 3;
      const pruefeAlternativesDatum = async (index) => {
        if (index >= alternativeDaten.length || vorschlaege.length >= maxAlternativen + 1) {
          return res.json({
            vorschlaege: vorschlaege,
            gewuenschtes_datum: datum,
            benoetigte_zeit_minuten: geschaetzteZeit
          });
        }

        const altDatum = alternativeDaten[index];
        const altAbwesenheit = await AbwesenheitenModel.getByDatum(altDatum);
        const altUrlaub = altAbwesenheit?.urlaub || 0;
        const altKrank = altAbwesenheit?.krank || 0;
        const altVerfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - altUrlaub - altKrank, 0);
        // Verwende die gleiche arbeitszeit_pro_tag wie für das Hauptdatum
        const altArbeitszeit_pro_tag = arbeitszeit_pro_tag;

        try {
          const altTermine = await TermineModel.getTermineByDatum(altDatum);

          let altBelegung = 0;
          let altAktiveTermine = 0;
          (altTermine || []).forEach(termin => {
            const zeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
            altBelegung += zeit;
            if (termin.status !== 'abgeschlossen') {
              altAktiveTermine++;
            }
          });

          const altPufferZeitGesamt = Math.max((altAktiveTermine - 1) * pufferzeit, 0);
          // Servicezeit wird NICHT berücksichtigt, da sie nur den nur_service Mitarbeitern zugerechnet wird
          altBelegung += altPufferZeitGesamt;

          const altVerfuegbarNachService = altArbeitszeit_pro_tag;
          const altVerfuegbar = altVerfuegbarNachService - altBelegung;
          const altBenoetigteZeit = geschaetzteZeit + (altAktiveTermine > 0 ? pufferzeit : 0);

          if (altVerfuegbar >= altBenoetigteZeit && vorschlaege.length < maxAlternativen + 1) {
            vorschlaege.push({
              datum: altDatum,
              verfuegbar_minuten: altVerfuegbar,
              auslastung_nach_termin: Math.round(((altBelegung + altBenoetigteZeit) / altVerfuegbarNachService) * 100),
              empfohlen: false,
              grund: `Alternative: ${altVerfuegbar} Minuten verfügbar`
            });
          }

          await pruefeAlternativesDatum(index + 1);
        } catch (err) {
          await pruefeAlternativesDatum(index + 1);
        }
      };

      if (vorschlaege.length === 0 || vorschlaege.length < maxAlternativen + 1) {
        await pruefeAlternativesDatum(0);
      } else {
        res.json({
          vorschlaege: vorschlaege,
          gewuenschtes_datum: datum,
          benoetigte_zeit_minuten: geschaetzteZeit
        });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Findet Termine mit ähnlicher Bringzeit (±15 Minuten) für ein bestimmtes Datum
   * Wird verwendet um dem Benutzer anzuzeigen, wie viele Kunden zur gleichen Zeit kommen
   * Gibt auch Vorschläge für freie Zeitslots im Halbstunden-Takt zurück
   */
  static async getBringzeitUeberschneidungen(req, res) {
    try {
      const { datum, bringzeit, exclude } = req.query;

      if (!datum || !bringzeit) {
        return res.status(400).json({ error: 'Datum und Bringzeit sind erforderlich' });
      }

      // Bringzeit in Minuten umrechnen
      const [stunden, minuten] = bringzeit.split(':').map(Number);
      if (isNaN(stunden) || isNaN(minuten)) {
        return res.status(400).json({ error: 'Ungültiges Zeitformat' });
      }
      const bringzeitMinuten = stunden * 60 + minuten;
      
      // ±15 Minuten Fenster
      const vonMinuten = bringzeitMinuten - 15;
      const bisMinuten = bringzeitMinuten + 15;
      
      // Zeitstrings für SQL-Vergleich erstellen
      const vonZeit = `${String(Math.floor(Math.max(0, vonMinuten) / 60)).padStart(2, '0')}:${String(Math.max(0, vonMinuten) % 60).padStart(2, '0')}`;
      const bisZeit = `${String(Math.floor(Math.min(1439, bisMinuten) / 60)).padStart(2, '0')}:${String(Math.min(1439, bisMinuten) % 60).padStart(2, '0')}`;

      // Termine mit Bringzeit im Zeitfenster laden
      const termine = await TermineModel.getBringzeitUeberschneidungen(datum, vonZeit, bisZeit, exclude);

      // Alle Bringzeiten des Tages laden für Vorschläge
      const alleBringzeiten = await TermineModel.getAlleBringzeitenDesTages(datum, exclude);
      
      // Vorschläge für freie Zeitslots berechnen (08:00 - 18:00, Halbstunden-Takt)
      const vorschlaege = [];
      const werkstattStart = 8 * 60;  // 08:00
      const werkstattEnde = 18 * 60;  // 18:00
      
      // Bringzeiten in Minuten umrechnen für schnellen Vergleich
      const belegteZeiten = (alleBringzeiten || []).map(t => {
        const [h, m] = t.bring_zeit.split(':').map(Number);
        return h * 60 + m;
      });
      
      // Prüfe jeden Halbstunden-Slot
      for (let slotMinuten = werkstattStart; slotMinuten <= werkstattEnde; slotMinuten += 30) {
        // Zähle wie viele Termine ±15 Minuten um diesen Slot liegen
        let anzahlImSlot = 0;
        belegteZeiten.forEach(bz => {
          if (Math.abs(bz - slotMinuten) <= 15) {
            anzahlImSlot++;
          }
        });
        
        // Zeitstring formatieren
        const slotZeit = `${String(Math.floor(slotMinuten / 60)).padStart(2, '0')}:${String(slotMinuten % 60).padStart(2, '0')}`;
        
        // Nur Slots mit max. 1 Überschneidung vorschlagen (und nicht die aktuelle Zeit)
        if (anzahlImSlot <= 1 && Math.abs(slotMinuten - bringzeitMinuten) > 15) {
          vorschlaege.push({
            zeit: slotZeit,
            anzahl: anzahlImSlot,
            frei: anzahlImSlot === 0
          });
        }
      }
      
      // Sortiere Vorschläge: Komplett frei zuerst, dann nach Nähe zur gewünschten Zeit
      vorschlaege.sort((a, b) => {
        // Zuerst nach Anzahl (weniger ist besser)
        if (a.anzahl !== b.anzahl) return a.anzahl - b.anzahl;
        // Dann nach Nähe zur gewünschten Zeit
        const [aH, aM] = a.zeit.split(':').map(Number);
        const [bH, bM] = b.zeit.split(':').map(Number);
        const aMinuten = aH * 60 + aM;
        const bMinuten = bH * 60 + bM;
        return Math.abs(aMinuten - bringzeitMinuten) - Math.abs(bMinuten - bringzeitMinuten);
      });

      res.json({
        anzahl: termine.length,
        termine: termine.map(t => ({
          id: t.id,
          termin_nr: t.termin_nr,
          kunde_name: t.kunde_name,
          kennzeichen: t.kennzeichen,
          bring_zeit: t.bring_zeit
        })),
        zeitfenster: {
          von: vonZeit,
          bis: bisZeit,
          mitte: bringzeit
        },
        vorschlaege: vorschlaege.slice(0, 6) // Max. 6 Vorschläge
      });
    } catch (err) {
      console.error('Fehler bei getBringzeitUeberschneidungen:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Papierkorb-Funktionen
  static async getDeleted(req, res) {
    try {
      const rows = await TermineModel.getDeleted();
      res.json(rows || []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async restore(req, res) {
    try {
      const { id } = req.params;

      // Hole den Termin zuerst, um das Datum für Cache-Invalidierung zu bekommen
      const termin = await TermineModel.getById(id);

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      const result = await TermineModel.restore(id);
      // Cache invalidierten
      invalidateAuslastungCache(termin.datum);
      res.json({ message: 'Termin wiederhergestellt', changes: result.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async permanentDelete(req, res) {
    try {
      const { id } = req.params;

      // Hole den Termin zuerst, um das Datum für Cache-Invalidierung zu bekommen
      const termin = await TermineModel.getById(id);

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      const result = await TermineModel.permanentDelete(id);
      // Cache invalidierten
      invalidateAuslastungCache(termin.datum);
      res.json({ message: 'Termin permanent gelöscht', changes: result.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // Termin als schwebend markieren/aufheben
  static async setSchwebend(req, res) {
    try {
      const { id } = req.params;
      const { ist_schwebend } = req.body;

      // Hole den Termin zuerst, um das Datum für Cache-Invalidierung zu bekommen
      const termin = await TermineModel.getById(id);

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      const result = await TermineModel.setSchwebend(id, ist_schwebend);
      // Cache invalidierten
      invalidateAuslastungCache(termin.datum);
      res.json({
        message: ist_schwebend ? 'Termin als schwebend markiert' : 'Termin fest eingeplant',
        changes: result.changes
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // Termin aufteilen (Split)
  static async splitTermin(req, res) {
    try {
      const { id } = req.params;
      const { teil1_zeit, teil2_datum, teil2_zeit } = req.body;

      // Validierung
      if (!teil1_zeit || teil1_zeit <= 0) {
        return res.status(400).json({ error: 'Zeit für Teil 1 muss angegeben werden' });
      }
      if (!teil2_datum) {
        return res.status(400).json({ error: 'Datum für Teil 2 muss angegeben werden' });
      }
      if (!teil2_zeit || teil2_zeit <= 0) {
        return res.status(400).json({ error: 'Zeit für Teil 2 muss angegeben werden' });
      }

      // Hole den Termin zuerst, um das Datum für Cache-Invalidierung zu bekommen
      const termin = await TermineModel.getById(id);

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      const result = await TermineModel.splitTermin(id, { teil1_zeit, teil2_datum, teil2_zeit });
      // Cache für beide Tage invalidierten
      invalidateAuslastungCache(termin.datum);
      invalidateAuslastungCache(teil2_datum);
      res.json({
        message: 'Termin erfolgreich aufgeteilt',
        ...result
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // Alle Teile eines gesplitteten Termins laden
  static async getSplitTermine(req, res) {
    try {
      const { id } = req.params;
      const termine = await TermineModel.getSplitTermine(id);
      res.json(termine);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // =====================================================
  // AUFTRAGSERWEITERUNG ENDPOINTS
  // =====================================================

  /**
   * Prüft Konflikte für eine geplante Erweiterung
   * GET /termine/:id/erweiterung/konflikte?minuten=30
   */
  static async pruefeErweiterungsKonflikte(req, res) {
    try {
      const { id } = req.params;
      const { minuten } = req.query;

      if (!minuten || isNaN(parseInt(minuten))) {
        return res.status(400).json({ error: 'Minuten müssen angegeben werden' });
      }

      const konflikte = await TermineModel.pruefeErweiterungsKonflikte(id, parseInt(minuten));
      res.json(konflikte);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Findet verfügbare Mitarbeiter für einen Zeitraum
   * GET /termine/erweiterung/verfuegbare-mitarbeiter?datum=2026-01-05&startzeit=10:00&dauer=60
   */
  static async findeVerfuegbareMitarbeiter(req, res) {
    try {
      const { datum, startzeit, dauer } = req.query;

      if (!datum || !startzeit || !dauer) {
        return res.status(400).json({ error: 'Datum, Startzeit und Dauer müssen angegeben werden' });
      }

      const verfuegbare = await TermineModel.findeVerfuegbareMitarbeiter(
        datum, 
        startzeit, 
        parseInt(dauer)
      );
      res.json(verfuegbare);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Erstellt eine Auftragserweiterung
   * POST /termine/:id/erweiterung
   */
  static async erweiterungErstellen(req, res) {
    try {
      const { id } = req.params;
      const {
        neue_arbeit,
        arbeitszeit_minuten,
        teile_status,
        erweiterung_typ,
        datum,
        uhrzeit,
        mitarbeiter_id,
        ist_gleicher_mitarbeiter,
        folgetermine_verschieben
      } = req.body;

      // Validierung
      if (!neue_arbeit || !neue_arbeit.trim()) {
        return res.status(400).json({ error: 'Neue Arbeit muss angegeben werden' });
      }
      if (!arbeitszeit_minuten || arbeitszeit_minuten <= 0) {
        return res.status(400).json({ error: 'Arbeitszeit muss größer als 0 sein' });
      }
      if (!erweiterung_typ || !['anschluss', 'morgen', 'datum'].includes(erweiterung_typ)) {
        return res.status(400).json({ error: 'Ungültiger Erweiterungstyp' });
      }

      // Original-Termin laden für Datum und Cache-Invalidierung
      const originalTermin = await TermineModel.getById(id);
      if (!originalTermin) {
        return res.status(404).json({ error: 'Original-Termin nicht gefunden' });
      }

      // Bestimme Zieldatum
      let zielDatum = datum;
      if (erweiterung_typ === 'anschluss') {
        zielDatum = originalTermin.datum;
      } else if (erweiterung_typ === 'morgen') {
        zielDatum = TermineModel.naechsterArbeitstag(originalTermin.datum);
      }

      // Bei "Im Anschluss" und gleicher Mitarbeiter: Folgetermine verschieben falls gewünscht
      let verschobeneTermine = [];
      if (erweiterung_typ === 'anschluss' && ist_gleicher_mitarbeiter && folgetermine_verschieben) {
        const endzeit = TermineModel.berechneEndzeit(originalTermin.bring_zeit, originalTermin.geschaetzte_zeit);
        verschobeneTermine = await TermineModel.verschiebeFollgetermine(
          originalTermin.datum,
          originalTermin.mitarbeiter_id,
          endzeit,
          arbeitszeit_minuten
        );
      }

      // Erweiterung erstellen
      const result = await TermineModel.erweiterungErstellen(id, {
        neue_arbeit: neue_arbeit.trim(),
        arbeitszeit_minuten: parseInt(arbeitszeit_minuten),
        teile_status,
        erweiterung_typ,
        datum: zielDatum,
        uhrzeit,
        mitarbeiter_id,
        ist_gleicher_mitarbeiter
      });

      // Cache invalidieren
      invalidateAuslastungCache(originalTermin.datum);
      if (zielDatum && zielDatum !== originalTermin.datum) {
        invalidateAuslastungCache(zielDatum);
      }

      res.json({
        message: 'Auftragserweiterung erfolgreich erstellt',
        ...result,
        verschobene_termine: verschobeneTermine
      });
    } catch (err) {
      console.error('Fehler bei Erweiterungserstellung:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Lädt alle Erweiterungen eines Termins
   * GET /termine/:id/erweiterungen
   */
  static async getErweiterungen(req, res) {
    try {
      const { id } = req.params;
      const erweiterungen = await TermineModel.getErweiterungen(id);
      res.json(erweiterungen);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Zählt Erweiterungen eines Termins
   * GET /termine/:id/erweiterungen/count
   */
  static async countErweiterungen(req, res) {
    try {
      const { id } = req.params;
      const count = await TermineModel.countErweiterungen(id);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

// Exportiere auch die Cache-Invalidierungsfunktion für andere Controller
TermineController.invalidateAuslastungCache = invalidateAuslastungCache;

module.exports = TermineController;
