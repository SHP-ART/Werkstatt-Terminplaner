/**
 * Auslastungs-Logik (Tages-Minuten-Topf).
 *
 * Gegenstück zu `belegung.js`: waehrend dort zeitslot-genau gerechnet wird,
 * summiert dieses Modul belegte Minuten gegen die Tageskapazitaet und ermittelt
 * daraus Auslastung und Restzeit.
 *
 * Alle Funktionen sind rein (kein DB-Zugriff) und damit unabhaengig testbar.
 *
 * Regeln (bewusst festgelegt, siehe CLAUDE.md Abschnitt 4):
 * - Stornierte, schwebende und geloeschte Termine belegen keine Kapazitaet.
 * - Abgeschlossene Termine zaehlen weiter mit: die Zeit wurde verbraucht.
 * - Die Aufgabenbewaeltigung eines Lehrlings verlaengert die belegte ZEIT,
 *   sie kuerzt nicht die Kapazitaet. 150 % heisst: er braucht das 1,5-fache.
 * - Nebenzeit ist ein Aufschlag auf belegte Zeit, nie ein Abzug von der Kapazitaet.
 */

const META_PREFIX = '_';

/** Normalisiert den Terminstatus ('offen' wird wie 'geplant' behandelt). */
function normalisiereStatus(termin) {
  const roh = (termin && termin.status) || 'geplant';
  return roh === 'offen' ? 'geplant' : roh;
}

/**
 * Zaehlt ein Termin in die Auslastung?
 * Storniert, schwebend und geloescht bleiben aussen vor.
 */
function istAuslastungsRelevant(termin) {
  if (!termin) return false;
  if (termin.geloescht_am) return false;
  if (termin.ist_schwebend === 1 || termin.ist_schwebend === true) return false;
  return normalisiereStatus(termin) !== 'storniert';
}

/** Zeit eines Termins in Minuten (tatsaechlich vor geschaetzt). */
function terminZeit(termin) {
  return termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
}

/** Parst arbeitszeiten_details robust (String oder Objekt) zu einem Objekt. */
function parseDetails(details) {
  if (!details) return null;
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details);
  } catch (e) {
    return null;
  }
}

/** Legt einen leeren Aggregat-Eintrag an. */
function leeresAggregat(extra = {}) {
  return {
    belegt_minuten: 0,
    geplant_minuten: 0,
    in_arbeit_minuten: 0,
    abgeschlossen_minuten: 0,
    termin_anzahl: 0,
    ...extra
  };
}

/** Bucht Zeit auf das passende Status-Feld eines Aggregats. */
function bucheStatusZeit(eintrag, status, zeit) {
  eintrag.belegt_minuten += zeit;
  if (status === 'geplant') {
    eintrag.geplant_minuten += zeit;
  } else if (status === 'in_arbeit') {
    eintrag.in_arbeit_minuten += zeit;
  } else if (status === 'abgeschlossen') {
    eintrag.abgeschlossen_minuten += zeit;
  }
}

/**
 * Verteilt die Zeiten aller Termine auf die Mitarbeiter.
 *
 * Reihenfolge: erst die einzelnen Arbeiten aus arbeitszeiten_details, danach –
 * nur falls dabei nichts zugeordnet wurde – die Gesamtzeit auf den Fallback-
 * Mitarbeiter. Dadurch wird eine Zeit nie doppelt gezaehlt.
 *
 * @param {Array} termine
 * @param {Array} mitarbeiter - alle aktiven Mitarbeiter
 * @returns {Object} Map mitarbeiter_id -> Aggregat
 */
function verteileMitarbeiterZeiten(termine, mitarbeiter) {
  const map = {};
  (mitarbeiter || []).forEach(m => {
    map[m.id] = leeresAggregat({
      mitarbeiter_id: m.id,
      mitarbeiter_name: m.name,
      arbeitsstunden_pro_tag: m.arbeitsstunden_pro_tag || 8,
      nebenzeit_prozent: m.nebenzeit_prozent || 0,
      nur_service: m.nur_service,
      nacharbeit_anzahl: 0,
      nacharbeit_minuten: 0,
      nacharbeit_start_zeiten: []
    });
  });

  (termine || []).forEach(termin => {
    if (!istAuslastungsRelevant(termin)) return;

    const status = normalisiereStatus(termin);
    const gesamtZeit = terminZeit(termin);
    const beteiligte = new Set();
    let zugeordneteZeit = 0;

    const details = parseDetails(termin.arbeitszeiten_details);

    if (details) {
      let fallbackId = null;
      const gesamt = details._gesamt_mitarbeiter_id;
      if (gesamt && typeof gesamt === 'object' && gesamt.type === 'mitarbeiter' && gesamt.id) {
        fallbackId = gesamt.id;
      }
      if (!fallbackId && termin.mitarbeiter_id) {
        fallbackId = termin.mitarbeiter_id;
      }

      for (const [arbeitName, arbeitDetails] of Object.entries(details)) {
        if (arbeitName.startsWith(META_PREFIX)) continue;

        let arbeitZeit = 0;
        let mitarbeiterId = null;

        if (arbeitDetails && typeof arbeitDetails === 'object') {
          arbeitZeit = arbeitDetails.zeit || 0;
          if (arbeitDetails.type === 'lehrling') {
            continue; // Lehrlingszeiten laufen ueber verteileLehrlingZeiten
          }
          mitarbeiterId = arbeitDetails.mitarbeiter_id || fallbackId;
        } else if (typeof arbeitDetails === 'number') {
          arbeitZeit = arbeitDetails;
          mitarbeiterId = fallbackId;
        }

        if (mitarbeiterId && arbeitZeit > 0 && map[mitarbeiterId]) {
          bucheStatusZeit(map[mitarbeiterId], status, arbeitZeit);
          beteiligte.add(mitarbeiterId);
          zugeordneteZeit += arbeitZeit;
        }
      }

      if (zugeordneteZeit === 0 && fallbackId && map[fallbackId]) {
        bucheStatusZeit(map[fallbackId], status, gesamtZeit);
        beteiligte.add(fallbackId);
      }
    }

    // Ohne verwertbare Details: Zeit auf das Hauptfeld des Termins buchen
    if (beteiligte.size === 0 && termin.mitarbeiter_id && map[termin.mitarbeiter_id]) {
      bucheStatusZeit(map[termin.mitarbeiter_id], status, gesamtZeit);
      beteiligte.add(termin.mitarbeiter_id);
    }

    beteiligte.forEach(id => {
      map[id].termin_anzahl += 1;

      if (termin.muss_bearbeitet_werden === 1) {
        map[id].nacharbeit_anzahl += 1;
        map[id].nacharbeit_minuten += gesamtZeit;
        if (termin.nacharbeit_start_zeit) {
          map[id].nacharbeit_start_zeiten.push({
            termin_id: termin.id,
            start_zeit: termin.nacharbeit_start_zeit,
            status
          });
        }
      }
    });
  });

  return map;
}

/**
 * Verteilt die Zeiten aller Termine auf die Lehrlinge.
 *
 * Wie bei den Mitarbeitern greift die Gesamt-Zuordnung nur, wenn keine einzelne
 * Arbeit Zeit auf denselben Lehrling gebucht hat. Zusaetzlich wird die
 * Aufgabenbewaeltigung als Faktor auf die Zeit angewandt:
 * `belegt_minuten_effektiv = belegt_minuten_roh * (prozent / 100)`.
 *
 * @param {Array} termine
 * @param {Array} lehrlinge - alle aktiven Lehrlinge
 * @returns {Object} Map lehrling_id -> Aggregat
 */
function verteileLehrlingZeiten(termine, lehrlinge) {
  const map = {};
  (lehrlinge || []).forEach(l => {
    map[l.id] = leeresAggregat({
      lehrling_id: l.id,
      lehrling_name: l.name,
      arbeitsstunden_pro_tag: l.arbeitsstunden_pro_tag || 8,
      nebenzeit_prozent: l.nebenzeit_prozent || 0,
      aufgabenbewaeltigung_prozent: l.aufgabenbewaeltigung_prozent || 100
    });
  });

  (termine || []).forEach(termin => {
    if (!istAuslastungsRelevant(termin)) return;

    const details = parseDetails(termin.arbeitszeiten_details);
    if (!details) return;

    const status = normalisiereStatus(termin);
    const gesamtZeit = terminZeit(termin);
    const beteiligte = new Set();
    let zugeordneteZeit = 0;

    // Schritt 1: einzelne Arbeiten mit Lehrlings-Zuordnung
    for (const [arbeitName, arbeitDetails] of Object.entries(details)) {
      if (arbeitName.startsWith(META_PREFIX)) continue;
      if (!arbeitDetails || typeof arbeitDetails !== 'object') continue;
      if (arbeitDetails.type !== 'lehrling') continue;

      const lehrlingId = arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id;
      const zeit = arbeitDetails.zeit || 0;

      if (lehrlingId && zeit > 0 && map[lehrlingId]) {
        bucheStatusZeit(map[lehrlingId], status, zeit);
        beteiligte.add(lehrlingId);
        zugeordneteZeit += zeit;
      }
    }

    // Schritt 2: Gesamt-Zuordnung nur, wenn keine Einzelarbeit gegriffen hat
    if (zugeordneteZeit === 0) {
      const gesamt = details._gesamt_mitarbeiter_id;
      if (gesamt && typeof gesamt === 'object' && gesamt.type === 'lehrling' && gesamt.id) {
        if (map[gesamt.id]) {
          bucheStatusZeit(map[gesamt.id], status, gesamtZeit);
          beteiligte.add(gesamt.id);
        }
      }
    }

    beteiligte.forEach(id => {
      map[id].termin_anzahl += 1;
    });
  });

  // Aufgabenbewaeltigung auf die Zeiten anwenden
  Object.values(map).forEach(eintrag => {
    const faktor = (eintrag.aufgabenbewaeltigung_prozent || 100) / 100;
    eintrag.belegt_minuten_roh = eintrag.belegt_minuten;
    eintrag.belegt_minuten_effektiv = Math.round(eintrag.belegt_minuten * faktor);
    eintrag.geplant_minuten = Math.round(eintrag.geplant_minuten * faktor);
    eintrag.in_arbeit_minuten = Math.round(eintrag.in_arbeit_minuten * faktor);
    eintrag.abgeschlossen_minuten = Math.round(eintrag.abgeschlossen_minuten * faktor);
  });

  return map;
}

/**
 * Tageskapazitaet in Minuten: alle anwesenden Werkstatt-Mitarbeiter und
 * Lehrlinge mit ihrer vollen Arbeitszeit.
 *
 * `nur_service`-Mitarbeiter bleiben aussen vor – ihre Zeit wird an anderer
 * Stelle gegen die Servicezeit gerechnet, nicht gegen die Werkstattkapazitaet.
 */
function berechneKapazitaet({ mitarbeiter, lehrlinge, abwesendeMitarbeiter, abwesendeLehrlinge }) {
  const abwesendMA = abwesendeMitarbeiter || new Set();
  const abwesendL = abwesendeLehrlinge || new Set();

  const summeMitarbeiter = (mitarbeiter || []).reduce((summe, m) => {
    const id = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
    if (abwesendMA.has(id)) return summe;
    if (istNurService(m)) return summe;
    return summe + (m.arbeitsstunden_pro_tag || 8) * 60;
  }, 0);

  const summeLehrlinge = (lehrlinge || []).reduce((summe, l) => {
    const id = typeof l.id === 'number' ? l.id : parseInt(l.id, 10);
    if (abwesendL.has(id)) return summe;
    return summe + (l.arbeitsstunden_pro_tag || 8) * 60;
  }, 0);

  return summeMitarbeiter + summeLehrlinge;
}

/** Prueft das nur_service-Flag in allen Schreibweisen, die in der DB vorkommen. */
function istNurService(mitarbeiter) {
  const wert = mitarbeiter && mitarbeiter.nur_service;
  return wert === 1 || wert === true || wert === '1' || wert === 'true';
}

/**
 * Baut das vollstaendige Auslastungs-Ergebnis fuer einen Tag.
 *
 * @param {object} params - siehe termineController.getAuslastung
 * @returns {object} Response-Objekt der Auslastungs-Endpoints
 */
function berechneAuslastungErgebnis(params) {
  const {
    row,
    mitPuffer,
    mitarbeiter,
    lehrlinge,
    auslastungProMitarbeiter,
    auslastungProLehrling,
    abwesendeMitarbeiter,
    abwesendeMitarbeiterTyp,
    abwesendeLehrlinge,
    abwesendeLehrlingeTyp,
    globaleNebenzeit,
    servicezeitWert,
    pufferzeit,
    urlaub,
    krank,
    debugAbwesenheiten
  } = params;

  const abwesendMA = abwesendeMitarbeiter || new Set();
  const abwesendL = abwesendeLehrlinge || new Set();
  const nebenzeitFaktor = 1 + ((globaleNebenzeit || 0) / 100);

  // --- Basiswerte aus dem DB-Ergebnis, jeweils mit Nebenzeit-Aufschlag ---
  const belegtRoh = (row && row.gesamt_minuten) || 0;
  const belegt = Math.round(belegtRoh * nebenzeitFaktor);
  const belegtMitPufferRoh = mitPuffer
    ? ((row && row.gesamt_minuten_mit_puffer) || belegtRoh)
    : belegtRoh;
  const belegtMitPufferWert = Math.round(belegtMitPufferRoh * nebenzeitFaktor);

  const geplant = Math.round(((row && row.geplant_minuten) || 0) * nebenzeitFaktor);
  const inArbeit = Math.round(((row && row.in_arbeit_minuten) || 0) * nebenzeitFaktor);
  const abgeschlossen = Math.round(((row && row.abgeschlossen_minuten) || 0) * nebenzeitFaktor);
  const pufferMinuten = mitPuffer ? ((row && row.puffer_minuten) || 0) : 0;

  // Basis der Servicezeit: aktive Termine, sonst alle Termine des Tages
  const terminAnzahlFuerService = (row && row.aktive_termine !== undefined && row.aktive_termine !== null)
    ? row.aktive_termine
    : ((row && row.termin_anzahl) || 0);

  // --- Auslastung je Mitarbeiter ---
  const terminDatenMap = {};
  let nurServiceZugeordneteZeitRoh = 0;

  (auslastungProMitarbeiter || []).forEach(ma => {
    const id = typeof ma.mitarbeiter_id === 'number' ? ma.mitarbeiter_id : parseInt(ma.mitarbeiter_id, 10);
    terminDatenMap[id] = ma;

    const info = (mitarbeiter || []).find(m => m.id === id);
    if (info && istNurService(info)) {
      nurServiceZugeordneteZeitRoh += ma.belegt_minuten || 0;
    }
  });

  const mitarbeiterAuslastung = (mitarbeiter || []).map(m => {
    const id = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
    const ma = terminDatenMap[id] || leeresAggregat({ mitarbeiter_id: id });

    const istAbwesend = abwesendMA.has(id);
    const abwesenheitsTyp = istAbwesend ? (abwesendeMitarbeiterTyp && abwesendeMitarbeiterTyp.get(id)) || null : null;
    const verfuegbar = istAbwesend ? 0 : (m.arbeitsstunden_pro_tag || 8) * 60;

    const nurService = istNurService(m);
    const belegtRohMa = ma.belegt_minuten || 0;
    const belegtMitNebenzeit = Math.round(belegtRohMa * nebenzeitFaktor);

    let servicezeitFuerMitarbeiter = 0;
    let belegtGesamt = belegtMitNebenzeit;
    let nebenzeitMinuten = belegtMitNebenzeit - belegtRohMa;

    if (nurService) {
      // Service-Mitarbeiter: Servicezeit je Termin plus eigene Arbeitszeit.
      // Die Nebenzeit wird hier separat ausgewiesen statt eingerechnet.
      servicezeitFuerMitarbeiter = terminAnzahlFuerService * (servicezeitWert || 0);
      belegtGesamt = belegtRohMa + servicezeitFuerMitarbeiter;
      nebenzeitMinuten = Math.round(belegtGesamt * ((globaleNebenzeit || 0) / 100));
    }

    const prozent = verfuegbar > 0
      ? (belegtGesamt / verfuegbar) * 100
      : (istAbwesend ? 0 : 100);

    return {
      mitarbeiter_id: m.id,
      mitarbeiter_name: m.name,
      arbeitsstunden_pro_tag: m.arbeitsstunden_pro_tag,
      nebenzeit_prozent: globaleNebenzeit,
      nebenzeit_minuten: nebenzeitMinuten,
      nur_service: nurService,
      ist_abwesend: istAbwesend,
      abwesenheits_typ: abwesenheitsTyp,
      verfuegbar_minuten: verfuegbar,
      belegt_minuten: belegtGesamt,
      belegt_minuten_roh: belegtRohMa,
      servicezeit_minuten: servicezeitFuerMitarbeiter,
      auslastung_prozent: Math.round(prozent),
      geplant_minuten: ma.geplant_minuten || 0,
      in_arbeit_minuten: ma.in_arbeit_minuten || 0,
      abgeschlossen_minuten: ma.abgeschlossen_minuten || 0,
      termin_anzahl: ma.termin_anzahl || 0,
      nacharbeit_anzahl: ma.nacharbeit_anzahl || 0,
      nacharbeit_minuten: ma.nacharbeit_minuten || 0,
      nacharbeit_start_zeiten: ma.nacharbeit_start_zeiten || []
    };
  });

  // --- Auslastung je Lehrling ---
  // belegt_minuten_effektiv enthaelt bereits die Aufgabenbewaeltigung.
  let lehrlingeZusatzzeitRoh = 0;

  const lehrlingeAuslastung = (auslastungProLehrling || []).map(la => {
    const id = typeof la.lehrling_id === 'number' ? la.lehrling_id : parseInt(la.lehrling_id, 10);
    const istAbwesend = abwesendL.has(id);
    const abwesenheitsTyp = istAbwesend ? (abwesendeLehrlingeTyp && abwesendeLehrlingeTyp.get(id)) || null : null;
    const verfuegbar = istAbwesend ? 0 : (la.arbeitsstunden_pro_tag || 8) * 60;

    const faktor = (la.aufgabenbewaeltigung_prozent || 100) / 100;
    const roh = la.belegt_minuten_roh !== undefined ? la.belegt_minuten_roh : (la.belegt_minuten || 0);
    const effektiv = la.belegt_minuten_effektiv !== undefined
      ? la.belegt_minuten_effektiv
      : Math.round(roh * faktor);

    lehrlingeZusatzzeitRoh += effektiv - roh;

    const belegtMitNebenzeit = Math.round(effektiv * nebenzeitFaktor);
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
      abwesenheits_typ: abwesenheitsTyp,
      verfuegbar_minuten: verfuegbar,
      belegt_minuten: belegtMitNebenzeit,
      belegt_minuten_roh: roh,
      servicezeit_minuten: la.servicezeit_minuten || 0,
      auslastung_prozent: auslastung,
      geplant_minuten: la.geplant_minuten || 0,
      in_arbeit_minuten: la.in_arbeit_minuten || 0,
      abgeschlossen_minuten: la.abgeschlossen_minuten || 0,
      termin_anzahl: la.termin_anzahl || 0
    };
  });

  // --- Gesamtrechnung ---
  const gesamtVerfuegbar = berechneKapazitaet({
    mitarbeiter,
    lehrlinge,
    abwesendeMitarbeiter: abwesendMA,
    abwesendeLehrlinge: abwesendL
  });

  // Service-Zeit gehoert nicht in den Werkstatt-Topf. Abzug mit demselben
  // Nebenzeit-Faktor, mit dem sie oben aufgeschlagen wurde.
  const nurServiceAbzug = Math.round(nurServiceZugeordneteZeitRoh * nebenzeitFaktor);
  const lehrlingeZusatzzeit = Math.round(lehrlingeZusatzzeitRoh * nebenzeitFaktor);

  const belegtOhneNurService = Math.max(belegtMitPufferWert - nurServiceAbzug, 0);
  const belegtMitService = belegtOhneNurService + lehrlingeZusatzzeit;
  const verfuegbar = Math.max(gesamtVerfuegbar - belegtMitService, 0);

  let prozent = 0;
  if (gesamtVerfuegbar > 0) {
    prozent = (belegtMitService / gesamtVerfuegbar) * 100;
  } else if (belegtMitService > 0) {
    prozent = 100; // Termine ohne Kapazitaet: voll ausgelastet
  }

  const result = {
    belegt_minuten: belegt,
    belegt_minuten_mit_service: belegtMitService,
    servicezeit_minuten: 0, // Servicezeit steckt in mitarbeiter_auslastung
    verfuegbar_minuten: verfuegbar,
    gesamt_minuten: gesamtVerfuegbar,
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
      abwesendeMitarbeiterIds: Array.from(abwesendMA),
      abwesendeLehrlingeIds: Array.from(abwesendL),
      gefundeneAbwesenheiten: debugAbwesenheiten || []
    }
  };

  if (mitPuffer) {
    result.belegt_minuten_mit_puffer = belegtMitPufferWert;
    result.puffer_minuten = pufferMinuten;
  }

  return result;
}

module.exports = {
  istAuslastungsRelevant,
  normalisiereStatus,
  istNurService,
  verteileMitarbeiterZeiten,
  verteileLehrlingZeiten,
  berechneKapazitaet,
  berechneAuslastungErgebnis
};
