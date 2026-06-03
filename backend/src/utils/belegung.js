/**
 * Belegungs-/Slot-Logik für zeitgenaue Auslastung und Doppelbuchungs-Erkennung.
 *
 * Das bestehende Auslastungssystem rechnet rein über Tages-Minuten-Summen
 * (siehe termineController.berechneAuslastungErgebnis). Dieses Modul ergänzt
 * eine zeitslot-genaue Sicht: pro Ressource (Mitarbeiter/Lehrling) werden aus
 * Startzeit + Dauer belegte Intervalle gebildet, um Überschneidungen
 * (Doppelbuchungen) und gleichzeitige Warte-Kunden zu erkennen sowie freie
 * Slots zu finden.
 *
 * Alle Funktionen sind rein (kein DB-Zugriff) und damit unabhängig testbar.
 */

/** Wandelt "HH:MM" in Minuten seit Mitternacht um, sonst null. */
function zeitTextZuMinuten(text) {
  if (text === null || text === undefined) return null;
  const str = String(text).trim();
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const stunden = parseInt(match[1], 10);
  const minuten = parseInt(match[2], 10);
  if (isNaN(stunden) || isNaN(minuten) || stunden > 23 || minuten > 59) return null;
  return stunden * 60 + minuten;
}

/** Wandelt Minuten seit Mitternacht in "HH:MM" um. */
function minutenZuZeitText(minuten) {
  const m = Math.max(0, Math.round(minuten));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Parst arbeitszeiten_details robust (String oder Objekt) zu einem Objekt. */
function parseDetails(details) {
  if (!details) return {};
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details);
  } catch (e) {
    return {};
  }
}

/**
 * Bestimmt die zugeordnete Ressource eines Termins.
 * Reihenfolge: _gesamt_mitarbeiter_id → mitarbeiter_id (Top-Level) →
 * erste individuelle Zuordnung in arbeitszeiten_details.
 * @returns {{typ: 'mitarbeiter'|'lehrling', id: number}|null}
 */
function ermittleRessource(termin) {
  const details = parseDetails(termin.arbeitszeiten_details);

  const gesamt = details._gesamt_mitarbeiter_id;
  if (gesamt && typeof gesamt === 'object' && gesamt.id) {
    return { typ: gesamt.type === 'lehrling' ? 'lehrling' : 'mitarbeiter', id: Number(gesamt.id) };
  }

  if (termin.mitarbeiter_id) {
    return { typ: 'mitarbeiter', id: Number(termin.mitarbeiter_id) };
  }
  if (termin.lehrling_id) {
    return { typ: 'lehrling', id: Number(termin.lehrling_id) };
  }

  for (const key of Object.keys(details)) {
    if (key.startsWith('_')) continue;
    const wert = details[key];
    if (wert && typeof wert === 'object') {
      if (wert.type === 'lehrling' && (wert.lehrling_id || wert.mitarbeiter_id)) {
        return { typ: 'lehrling', id: Number(wert.lehrling_id || wert.mitarbeiter_id) };
      }
      if (wert.mitarbeiter_id) {
        return { typ: 'mitarbeiter', id: Number(wert.mitarbeiter_id) };
      }
    }
  }
  return null;
}

/**
 * Bestimmt die Startzeit eines Termins (Minuten seit Mitternacht) oder null.
 * Reihenfolge: termin.startzeit → details._startzeit → früheste Arbeit-Startzeit → bring_zeit.
 */
function ermittleStartMinuten(termin) {
  const direkt = zeitTextZuMinuten(termin.startzeit);
  if (direkt !== null) return direkt;

  const details = parseDetails(termin.arbeitszeiten_details);
  const meta = zeitTextZuMinuten(details._startzeit);
  if (meta !== null) return meta;

  let frueheste = null;
  for (const key of Object.keys(details)) {
    if (key.startsWith('_')) continue;
    const wert = details[key];
    if (wert && typeof wert === 'object' && wert.startzeit) {
      const m = zeitTextZuMinuten(wert.startzeit);
      if (m !== null && (frueheste === null || m < frueheste)) frueheste = m;
    }
  }
  if (frueheste !== null) return frueheste;

  return zeitTextZuMinuten(termin.bring_zeit);
}

/** Bestimmt die Dauer eines Termins in Minuten (tatsaechlich vor geschaetzt). */
function ermittleDauer(termin) {
  const tat = Number(termin.tatsaechliche_zeit);
  if (Number.isFinite(tat) && tat > 0) return tat;
  const ges = Number(termin.geschaetzte_zeit);
  if (Number.isFinite(ges) && ges > 0) return ges;
  return 60;
}

/**
 * Baut aus einer Termin-Liste die belegten Intervalle.
 * Nur Termine mit aufgelöster Ressource UND Startzeit ergeben ein hartes
 * Intervall; alle anderen gelten als "flexibel" (kein Slot-Konflikt) und
 * werden in `flexibel` zurückgegeben.
 *
 * @param {Array} termine
 * @param {object} opt
 * @param {number} [opt.puffer=0] - Pufferminuten, die hinten an jedes Intervall gehängt werden
 * @returns {{intervalle: Array, flexibel: Array}}
 */
function baueIntervalle(termine, opt = {}) {
  const puffer = Number(opt.puffer) || 0;
  const intervalle = [];
  const flexibel = [];

  for (const termin of termine || []) {
    if (termin.status === 'abgeschlossen' || termin.status === 'storniert') continue;
    if (termin.ist_schwebend === 1 || termin.ist_schwebend === true) {
      flexibel.push({ terminId: termin.id, grund: 'schwebend' });
      continue;
    }

    const ressource = ermittleRessource(termin);
    const start = ermittleStartMinuten(termin);

    if (!ressource || start === null) {
      flexibel.push({ terminId: termin.id, grund: !ressource ? 'keine_ressource' : 'keine_startzeit' });
      continue;
    }

    const dauer = ermittleDauer(termin);
    intervalle.push({
      terminId: termin.id,
      terminNr: termin.termin_nr || null,
      ressourceTyp: ressource.typ,
      ressourceId: ressource.id,
      start,
      ende: start + dauer + puffer,
      dauer,
      istWarten: termin.abholung_typ === 'warten',
      kundeName: termin.kunde_name || termin.kunde || 'Unbekannt',
      kennzeichen: termin.kennzeichen || ''
    });
  }

  return { intervalle, flexibel };
}

/** Zwei Intervalle überschneiden sich, wenn aStart < bEnde && bStart < aEnde. */
function ueberschneidetSich(aStart, aEnde, bStart, bEnde) {
  return aStart < bEnde && bStart < aEnde;
}

/**
 * Findet Überschneidungen eines neuen Intervalls mit bestehenden Intervallen
 * derselben Ressource.
 * @param {Array} intervalle - bestehende Intervalle (aus baueIntervalle)
 * @param {object} neu - {ressourceTyp, ressourceId, start, ende, excludeTerminId?}
 * @returns {Array} überschneidende bestehende Intervalle
 */
function findeUeberschneidungen(intervalle, neu) {
  return (intervalle || []).filter(iv => {
    if (neu.excludeTerminId && iv.terminId === neu.excludeTerminId) return false;
    if (iv.ressourceTyp !== neu.ressourceTyp || iv.ressourceId !== neu.ressourceId) return false;
    return ueberschneidetSich(neu.start, neu.ende, iv.start, iv.ende);
  });
}

/**
 * Ermittelt, wie viele Warte-Kunden zu einem neuen Warte-Intervall zeitgleich
 * anwesend wären, und ob die Anzahl die verfügbaren Mitarbeiter übersteigt.
 * @param {Array} intervalle
 * @param {object} neu - {start, ende, excludeTerminId?}
 * @param {number} verfuegbareMitarbeiter
 */
function pruefeWarteKonflikt(intervalle, neu, verfuegbareMitarbeiter) {
  const ueberlappendeWarte = (intervalle || []).filter(iv => {
    if (neu.excludeTerminId && iv.terminId === neu.excludeTerminId) return false;
    if (!iv.istWarten) return false;
    return ueberschneidetSich(neu.start, neu.ende, iv.start, iv.ende);
  });
  // +1 für den neuen Warte-Kunden selbst
  const gleichzeitig = ueberlappendeWarte.length + 1;
  return {
    gleichzeitig,
    verfuegbareMitarbeiter,
    konflikt: gleichzeitig > Math.max(verfuegbareMitarbeiter, 0),
    ueberlappende: ueberlappendeWarte
  };
}

/**
 * Findet freie Slots einer Ressource innerhalb eines Arbeitsfensters.
 * @param {Array} intervalle - alle Intervalle (werden nach Ressource gefiltert)
 * @param {object} fenster - {ressourceTyp, ressourceId, tagStart, tagEnde, pause?: {start, ende}}
 * @param {number} mindestDauer - Mindestlänge eines freien Slots in Minuten
 * @returns {Array<{start:number, ende:number, dauer:number}>}
 */
function findeFreieSlots(intervalle, fenster, mindestDauer = 1) {
  const belegt = (intervalle || [])
    .filter(iv => iv.ressourceTyp === fenster.ressourceTyp && iv.ressourceId === fenster.ressourceId)
    .map(iv => ({ start: iv.start, ende: iv.ende }));

  // Mittagspause als Belegung behandeln
  if (fenster.pause && Number.isFinite(fenster.pause.start) && Number.isFinite(fenster.pause.ende)) {
    belegt.push({ start: fenster.pause.start, ende: fenster.pause.ende });
  }

  belegt.sort((a, b) => a.start - b.start);

  const slots = [];
  let cursor = fenster.tagStart;
  for (const b of belegt) {
    if (b.start > cursor) {
      const ende = Math.min(b.start, fenster.tagEnde);
      if (ende - cursor >= mindestDauer) slots.push({ start: cursor, ende, dauer: ende - cursor });
    }
    cursor = Math.max(cursor, b.ende);
    if (cursor >= fenster.tagEnde) break;
  }
  if (cursor < fenster.tagEnde && fenster.tagEnde - cursor >= mindestDauer) {
    slots.push({ start: cursor, ende: fenster.tagEnde, dauer: fenster.tagEnde - cursor });
  }
  return slots;
}

module.exports = {
  zeitTextZuMinuten,
  minutenZuZeitText,
  ermittleRessource,
  ermittleStartMinuten,
  ermittleDauer,
  baueIntervalle,
  ueberschneidetSich,
  findeUeberschneidungen,
  pruefeWarteKonflikt,
  findeFreieSlots
};
