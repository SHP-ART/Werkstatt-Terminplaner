const TermineModel = require('../models/termineModel');
const EinstellungenModel = require('../models/einstellungenModel');
const MitarbeiterModel = require('../models/mitarbeiterModel');
const LehrlingeModel = require('../models/lehrlingeModel');
const { allAsync, runAsync } = require('../utils/dbHelper');

function addMinutes(time, minutes) {
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function compareTime(time1, time2) {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  return (h1 * 60 + m1) - (h2 * 60 + m2);
}

async function berechneEndzeitFuerTermin(termin, arbeitszeitenDetails, kontext = {}) {
  try {
    const einstellungen = await EinstellungenModel.getWerkstatt();
    const nebenzeitProzent = einstellungen.nebenzeit_prozent || 0;
    const mitarbeiter = await MitarbeiterModel.getAll();
    const lehrlinge = await LehrlingeModel.getAll();
    const mitarbeiterMap = {};
    const lehrlingeMap = {};
    mitarbeiter.forEach(m => mitarbeiterMap[m.id] = m);
    lehrlinge.forEach(l => lehrlingeMap[l.id] = l);

    let gesamtMinuten = 0;
    let fruehesteStartzeit = null;
    let aufgabenFaktorAngewendet = false;
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
        if (key.startsWith('_')) {
          if (key === '_startzeit' && value) fruehesteStartzeit = value;
          continue;
        }

        let zeitMinuten = typeof value === 'object' ? (value.zeit || 0) : value;
        if (nebenzeitProzent > 0 && zeitMinuten > 0) {
          zeitMinuten = zeitMinuten * (1 + nebenzeitProzent / 100);
        }

        if (typeof value === 'object' && zeitMinuten > 0 && value.type === 'lehrling') {
          const lehrlingId = value.lehrling_id || value.mitarbeiter_id;
          const lehr = lehrlingeMap[lehrlingId];
          if (lehr && lehr.aufgabenbewaeltigung_prozent && lehr.aufgabenbewaeltigung_prozent !== 100) {
            zeitMinuten = zeitMinuten * (lehr.aufgabenbewaeltigung_prozent / 100);
            aufgabenFaktorAngewendet = true;
          }
        }

        gesamtMinuten += zeitMinuten;
        if (typeof value === 'object' && value.startzeit && value.startzeit !== '') {
          if (!fruehesteStartzeit || value.startzeit < fruehesteStartzeit) {
            fruehesteStartzeit = value.startzeit;
          }
        }
      }
    }

    if (gesamtMinuten === 0 && termin.geschaetzte_zeit) {
      gesamtMinuten = termin.geschaetzte_zeit;
      if (nebenzeitProzent > 0) {
        gesamtMinuten = gesamtMinuten * (1 + nebenzeitProzent / 100);
      }
    }

    const hatDauerOverride = details && details._dauer_override && parseInt(details._dauer_override) > 0;
    if (hatDauerOverride) {
      gesamtMinuten = parseInt(details._dauer_override);
    } else if (kontext.personTyp === 'lehrling' && !aufgabenFaktorAngewendet) {
      const lehr = lehrlingeMap[kontext.personId];
      if (lehr?.aufgabenbewaeltigung_prozent && lehr.aufgabenbewaeltigung_prozent !== 100) {
        gesamtMinuten = gesamtMinuten * (lehr.aufgabenbewaeltigung_prozent / 100);
      }
    }

    const startzeit = fruehesteStartzeit || termin.startzeit || termin.bring_zeit;
    if (!startzeit || gesamtMinuten <= 0) {
      return { startzeit: startzeit || null, endzeit: null };
    }

    const mittagspauseDauer = einstellungen.mittagspause_minuten || 30;
    const [startH, startM] = startzeit.split(':').map(Number);
    const startInMinuten = startH * 60 + startM;
    let pausenStart = null;
    let pausenEnde = null;

    if (details && mittagspauseDauer > 0) {
      for (const [key, value] of Object.entries(details)) {
        if (key.startsWith('_')) continue;
        if (typeof value === 'object') {
          let pauseStartZeit = null;
          if (value.type === 'lehrling' && (value.lehrling_id || value.mitarbeiter_id)) {
            const lehr = lehrlingeMap[value.lehrling_id || value.mitarbeiter_id];
            pauseStartZeit = lehr?.mittagspause_start || '12:00';
          } else if (value.mitarbeiter_id) {
            const ma = mitarbeiterMap[value.mitarbeiter_id];
            pauseStartZeit = ma?.mittagspause_start || '12:00';
          }

          if (pauseStartZeit) {
            const [pauseH, pauseM] = pauseStartZeit.split(':').map(Number);
            pausenStart = pauseH * 60 + pauseM;
            pausenEnde = pausenStart + mittagspauseDauer;
            break;
          }
        }
      }
    }

    let endInMinuten = startInMinuten + Math.round(gesamtMinuten);
    if (pausenStart !== null && pausenEnde !== null) {
      if (startInMinuten < pausenStart && endInMinuten > pausenStart) {
        endInMinuten += mittagspauseDauer;
      } else if (startInMinuten >= pausenStart && startInMinuten < pausenEnde) {
        endInMinuten += pausenEnde - startInMinuten;
      }
    }

    const endH = Math.floor(endInMinuten / 60);
    const endM = endInMinuten % 60;
    const endzeit = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    return { startzeit, endzeit };
  } catch (e) {
    console.error('Fehler bei Endzeit-Berechnung:', e);
    return { startzeit: null, endzeit: null };
  }
}

async function berechneZeitenFuerPerson({ personId, personTyp, datum, startTerminId }) {
  if (!personId || !personTyp || !datum) {
    throw new Error('personId, personTyp und datum sind erforderlich');
  }

  const einstellungen = await EinstellungenModel.getWerkstatt();
  const arbeitsstundenProTag = personTyp === 'lehrling'
    ? (await LehrlingeModel.getById(personId))?.arbeitsstunden_pro_tag || 8
    : (await MitarbeiterModel.getById(personId))?.arbeitsstunden_pro_tag || 8;

  const alleTermine = await allAsync(`
    SELECT id, startzeit, bring_zeit, geschaetzte_zeit, tatsaechliche_zeit,
           arbeitszeiten_details, status, verschoben_von_datum,
           mitarbeiter_id, lehrling_id, warteschlange_pos
      FROM termine
     WHERE datum = ?
       AND status IN ('geplant', 'in_arbeit')
       AND geloescht_am IS NULL
  `, [datum]);

  function terminGehoertZuPerson(t) {
    if (personTyp === 'mitarbeiter' && t.mitarbeiter_id === parseInt(personId)) return true;
    if (personTyp === 'lehrling' && t.lehrling_id === parseInt(personId)) return true;
    if (!t.arbeitszeiten_details) return false;
    try {
      const details = JSON.parse(t.arbeitszeiten_details);
      const gesamt = details._gesamt_mitarbeiter_id;
      return gesamt && typeof gesamt === 'object' && gesamt.type === personTyp && gesamt.id == personId;
    } catch (e) {
      return false;
    }
  }

  const eigeneTermine = alleTermine.filter(terminGehoertZuPerson).sort((a, b) => {
    if (a.warteschlange_pos !== null && b.warteschlange_pos !== null) {
      return a.warteschlange_pos - b.warteschlange_pos || a.id - b.id;
    }
    if (a.warteschlange_pos !== null) return -1;
    if (b.warteschlange_pos !== null) return 1;
    return compareTime(
      a.startzeit || a.bring_zeit || '23:59',
      b.startzeit || b.bring_zeit || '23:59'
    ) || a.id - b.id;
  });

  if (eigeneTermine.length === 0) {
    return {
      success: true,
      aktualisiert: 0,
      verschoben: [],
      aktualisierteTermine: [],
      verschobeneTermine: [],
      message: 'Keine Termine zum Neuberechnen gefunden'
    };
  }

  const letzterAbgeschlossener = await allAsync(`
    SELECT id, startzeit, bring_zeit, tatsaechliche_zeit, geschaetzte_zeit,
           mitarbeiter_id, lehrling_id, arbeitszeiten_details
      FROM termine
     WHERE datum = ?
       AND status = 'abgeschlossen'
       AND geloescht_am IS NULL
     ORDER BY COALESCE(startzeit, bring_zeit, '00:00') DESC
     LIMIT 10
  `, [datum]);

  let startpunktNachruecken = null;
  for (const t of letzterAbgeschlossener) {
    if (!terminGehoertZuPerson(t)) continue;
    const startMin = t.startzeit || t.bring_zeit;
    const dauerMin = t.tatsaechliche_zeit || t.geschaetzte_zeit || 30;
    if (startMin) {
      const endzeit = addMinutes(startMin, dauerMin);
      if (!startpunktNachruecken || compareTime(endzeit, startpunktNachruecken) > 0) {
        startpunktNachruecken = endzeit;
      }
    }
    break;
  }

  const arbeitsbeginn = '08:00';
  const arbeitsende = addMinutes(arbeitsbeginn, arbeitsstundenProTag * 60);
  const aktualisierteTermine = [];
  const verschobeneTermine = [];
  let laufendeZeit = startpunktNachruecken
    || (eigeneTermine[0].warteschlange_pos !== null
      ? eigeneTermine[0].bring_zeit
      : eigeneTermine[0].startzeit || eigeneTermine[0].bring_zeit)
    || arbeitsbeginn;

  for (const termin of eigeneTermine) {
    const istInArbeit = termin.status === 'in_arbeit';
    let verwendeteStartzeit = istInArbeit
      ? (termin.startzeit || termin.bring_zeit || laufendeZeit)
      : laufendeZeit;
    if (!istInArbeit && termin.bring_zeit && compareTime(termin.bring_zeit, verwendeteStartzeit) > 0) {
      verwendeteStartzeit = termin.bring_zeit;
    }

    const { startzeit: neueStartzeit, endzeit: neueEndzeit } = await berechneEndzeitFuerTermin(
      { ...termin, startzeit: verwendeteStartzeit },
      termin.arbeitszeiten_details,
      { personTyp, personId }
    );

    if (neueEndzeit && compareTime(neueEndzeit, arbeitsende) > 0) {
      if (!istInArbeit) {
        const naechsterTag = TermineModel.naechsterArbeitstag(datum);
        await runAsync(`
          UPDATE termine
             SET datum = ?,
                 startzeit = ?,
                 endzeit_berechnet = ?,
                 verschoben_von_datum = ?
           WHERE id = ?
        `, [naechsterTag, arbeitsbeginn, neueEndzeit, datum, termin.id]);
        verschobeneTermine.push({
          id: termin.id,
          altesDatum: datum,
          neuesDatum: naechsterTag,
          grund: 'Overflow'
        });
        laufendeZeit = arbeitsbeginn;
      } else {
        await runAsync('UPDATE termine SET endzeit_berechnet = ? WHERE id = ?', [neueEndzeit, termin.id]);
        aktualisierteTermine.push({ id: termin.id, neueStartzeit: verwendeteStartzeit, neueEndzeit });
        laufendeZeit = neueEndzeit;
      }
    } else {
      if (istInArbeit) {
        await runAsync('UPDATE termine SET endzeit_berechnet = ? WHERE id = ?', [neueEndzeit, termin.id]);
      } else {
        await runAsync(`
          UPDATE termine
             SET startzeit = ?,
                 endzeit_berechnet = ?
           WHERE id = ?
        `, [neueStartzeit, neueEndzeit, termin.id]);
      }
      aktualisierteTermine.push({ id: termin.id, neueStartzeit: verwendeteStartzeit, neueEndzeit });
      laufendeZeit = neueEndzeit;
    }
  }

  return {
    success: true,
    aktualisiert: aktualisierteTermine.length,
    verschoben: verschobeneTermine.length,
    aktualisierteTermine,
    verschobeneTermine
  };
}

module.exports = { berechneZeitenFuerPerson, berechneEndzeitFuerTermin };
