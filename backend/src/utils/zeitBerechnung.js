/**
 * Zentrale Zeitberechnungs-Logik für Termine und Arbeiten
 * 
 * Berechnet:
 * - Nebenzeit-Faktoren (Mitarbeiter)
 * - Aufgabenbewältigungs-Faktoren (Lehrlinge)
 * - Pausenzeiten (Mittagspause)
 * - Endzeiten
 * 
 * Diese Werte werden in der Datenbank gespeichert für:
 * - Konsistente Anzeige über alle Clients
 * - Historische Nachvollziehbarkeit
 * - Performance-Optimierung
 */

const { getAsync } = require('./dbHelper');

/**
 * Berechnet die effektive Dauer einer Arbeit inkl. aller Faktoren
 * 
 * @param {number} basisZeit - Basis-Arbeitszeit in Minuten
 * @param {object} person - Mitarbeiter oder Lehrling Objekt
 * @param {string} typ - 'mitarbeiter' oder 'lehrling'
 * @returns {object} { dauerMinuten, faktoren }
 */
function berechneEffektiveDauer(basisZeit, person, typ) {
  if (!basisZeit || !person) {
    return {
      dauerMinuten: basisZeit || 0,
      faktoren: {
        nebenzeit: 0,
        aufgabenbewaeltigung: 100
      }
    };
  }

  let dauer = basisZeit;
  const faktoren = {
    nebenzeit: 0,
    aufgabenbewaeltigung: 100
  };

  // 1. Nebenzeit addieren (nur bei Mitarbeitern)
  if (typ === 'mitarbeiter' && person.nebenzeit_prozent) {
    faktoren.nebenzeit = person.nebenzeit_prozent;
    dauer = Math.round(dauer * (1 + person.nebenzeit_prozent / 100));
  }

  // 2. Aufgabenbewältigung für Lehrlinge
  if (typ === 'lehrling' && person.aufgabenbewaeltigung_prozent) {
    faktoren.aufgabenbewaeltigung = person.aufgabenbewaeltigung_prozent;
    dauer = Math.round(dauer * (person.aufgabenbewaeltigung_prozent / 100));
  }

  return {
    dauerMinuten: dauer,
    faktoren
  };
}

/**
 * Prüft ob eine Arbeitszeit über die Mittagspause geht
 * Berücksichtigt die 6h-Regel: Pause nur bei >= 6h Arbeitszeit pro Tag
 * 
 * @param {string} startzeit - Startzeit im Format HH:MM
 * @param {number} dauerMinuten - Dauer in Minuten
 * @param {object} person - Mitarbeiter oder Lehrling Objekt
 * @returns {object} { enthalten: boolean, minuten: number }
 */
function berechnePausenzeit(startzeit, dauerMinuten, person) {
  if (!startzeit || !dauerMinuten || !person) {
    return { enthalten: false, minuten: 0 };
  }

  // Berechne tägliche Arbeitszeit für 6h-Regel
  const wochenStunden = person.wochenarbeitszeit_stunden || person.arbeitsstunden_pro_tag * (person.arbeitstage_pro_woche || 5);
  const arbeitstage = person.arbeitstage_pro_woche || 5;
  const taeglicheStunden = wochenStunden / arbeitstage;

  // 6h-Regel: Keine Pause bei unter 6h Arbeitszeit pro Tag
  if (taeglicheStunden < 6) {
    return { enthalten: false, minuten: 0 };
  }

  const pauseStart = person.mittagspause_start || '12:00';
  const pauseDauer = person.pausenzeit_minuten || 30;

  if (!pauseStart || pauseDauer <= 0) {
    return { enthalten: false, minuten: 0 };
  }

  // Parse Startzeit
  const [startH, startM] = startzeit.split(':').map(Number);
  const startMinuten = startH * 60 + startM;
  
  // Parse Pausenzeit
  const [pauseH, pauseM] = pauseStart.split(':').map(Number);
  const pauseStartMinuten = pauseH * 60 + pauseM;
  const pauseEndeMinuten = pauseStartMinuten + pauseDauer;

  // Berechne Endzeit ohne Pause
  const endeOhnePause = startMinuten + dauerMinuten;

  // Prüfe ob Arbeit über Pause geht
  // Fall 1: Startet vor Pause und endet nach Pausenstart
  if (startMinuten < pauseStartMinuten && endeOhnePause > pauseStartMinuten) {
    return { enthalten: true, minuten: pauseDauer };
  }

  // Fall 2: Startet während der Pause
  if (startMinuten >= pauseStartMinuten && startMinuten < pauseEndeMinuten) {
    return { enthalten: true, minuten: pauseDauer };
  }

  return { enthalten: false, minuten: 0 };
}

/**
 * Berechnet die Endzeit basierend auf Start und Dauer
 * 
 * @param {string} startzeit - Startzeit im Format HH:MM
 * @param {number} dauerMinuten - Dauer in Minuten (inkl. Pause falls vorhanden)
 * @returns {string} Endzeit im Format HH:MM
 */
function berechneEndzeit(startzeit, dauerMinuten) {
  if (!startzeit || !dauerMinuten) {
    return null;
  }

  const [startH, startM] = startzeit.split(':').map(Number);
  const startMinutenGesamt = startH * 60 + startM;
  const endeMinutenGesamt = startMinutenGesamt + dauerMinuten;

  const endeH = Math.floor(endeMinutenGesamt / 60);
  const endeM = endeMinutenGesamt % 60;

  return `${String(endeH).padStart(2, '0')}:${String(endeM).padStart(2, '0')}`;
}

/**
 * Lädt Person (Mitarbeiter oder Lehrling) aus Datenbank
 * 
 * @param {number} personId - ID der Person
 * @param {string} typ - 'mitarbeiter' oder 'lehrling'
 * @returns {Promise<object>} Person-Objekt
 */
async function ladePerson(personId, typ) {
  if (!personId || !typ) return null;

  const tabelle = typ === 'mitarbeiter' ? 'mitarbeiter' : 'lehrlinge';
  return await getAsync(`SELECT * FROM ${tabelle} WHERE id = ?`, [personId]);
}

/**
 * Berechnet alle Zeitwerte für eine Arbeit
 * Hauptfunktion die von Controllers aufgerufen wird
 * 
 * @param {object} arbeit - Arbeits-Objekt mit { zeit, mitarbeiter_id, lehrling_id, startzeit }
 * @returns {Promise<object>} Berechnete Werte für Datenbank
 */
async function berechneArbeitszeitFuerSpeicherung(arbeit) {
  const { zeit, mitarbeiter_id, lehrling_id, startzeit } = arbeit;

  // Standardwerte wenn keine Zuordnung
  if (!mitarbeiter_id && !lehrling_id) {
    return {
      berechnete_dauer_minuten: zeit || null,
      berechnete_endzeit: startzeit && zeit ? berechneEndzeit(startzeit, zeit) : null,
      faktor_nebenzeit: null,
      faktor_aufgabenbewaeltigung: null,
      pause_enthalten: 0,
      pause_minuten: 0
    };
  }

  // Person laden
  const typ = mitarbeiter_id ? 'mitarbeiter' : 'lehrling';
  const personId = mitarbeiter_id || lehrling_id;
  const person = await ladePerson(personId, typ);

  if (!person) {
    return {
      berechnete_dauer_minuten: zeit || null,
      berechnete_endzeit: startzeit && zeit ? berechneEndzeit(startzeit, zeit) : null,
      faktor_nebenzeit: null,
      faktor_aufgabenbewaeltigung: null,
      pause_enthalten: 0,
      pause_minuten: 0
    };
  }

  // 1. Effektive Dauer berechnen (mit Nebenzeit/Aufgabenbewältigung)
  const { dauerMinuten, faktoren } = berechneEffektiveDauer(zeit, person, typ);

  // 2. Pausenzeit prüfen (nur wenn Startzeit bekannt)
  let pause = { enthalten: false, minuten: 0 };
  if (startzeit) {
    pause = berechnePausenzeit(startzeit, dauerMinuten, person);
  }

  // 3. Gesamtdauer (inkl. Pause)
  const gesamtDauer = dauerMinuten + pause.minuten;

  // 4. Endzeit berechnen (nur wenn Startzeit bekannt)
  const endzeit = startzeit ? berechneEndzeit(startzeit, gesamtDauer) : null;

  return {
    berechnete_dauer_minuten: gesamtDauer,
    berechnete_endzeit: endzeit,
    faktor_nebenzeit: faktoren.nebenzeit,
    faktor_aufgabenbewaeltigung: faktoren.aufgabenbewaeltigung,
    pause_enthalten: pause.enthalten ? 1 : 0,
    pause_minuten: pause.minuten
  };
}

module.exports = {
  berechneEffektiveDauer,
  berechnePausenzeit,
  berechneEndzeit,
  berechneArbeitszeitFuerSpeicherung,
  ladePerson
};
