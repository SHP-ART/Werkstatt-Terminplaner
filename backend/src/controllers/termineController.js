const TermineModel = require('../models/termineModel');
const EinstellungenModel = require('../models/einstellungenModel');
const AbwesenheitenModel = require('../models/abwesenheitenModel');
const ArbeitszeitenModel = require('../models/arbeitszeitenModel');
const MitarbeiterModel = require('../models/mitarbeiterModel');
const LehrlingeModel = require('../models/lehrlingeModel');

// Einfacher In-Memory-Cache für Auslastungsdaten
const auslastungCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 Minuten

function getCacheKey(datum, mitPuffer) {
  return `${datum}_${mitPuffer || 'false'}`;
}

function getCachedAuslastung(datum, mitPuffer) {
  const key = getCacheKey(datum, mitPuffer);
  const cached = auslastungCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
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

class TermineController {
  static getAll(req, res) {
    const { datum } = req.query;

    if (datum) {
      TermineModel.getByDatum(datum, (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json(rows);
        }
      });
    } else {
      TermineModel.getAll((err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json(rows);
        }
      });
    }
  }

  static create(req, res) {
    const kilometerstand = req.body.kilometerstand !== undefined && req.body.kilometerstand !== null
      ? parseInt(req.body.kilometerstand, 10)
      : null;
    const kilometerstandWert = Number.isFinite(kilometerstand) ? kilometerstand : null;

    const mitarbeiter_id = req.body.mitarbeiter_id !== undefined && req.body.mitarbeiter_id !== null && req.body.mitarbeiter_id !== ''
      ? parseInt(req.body.mitarbeiter_id, 10)
      : null;
    const mitarbeiter_id_wert = Number.isFinite(mitarbeiter_id) ? mitarbeiter_id : null;

    const payload = {
      ...req.body,
      kilometerstand: kilometerstandWert,
      ersatzauto: req.body.ersatzauto ? 1 : 0,
      abholung_zeit: req.body.abholung_zeit || null,
      bring_zeit: req.body.bring_zeit || null,
      kontakt_option: req.body.kontakt_option || null,
      mitarbeiter_id: mitarbeiter_id_wert
    };

    TermineModel.create(payload, function(err, result) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Cache invalidierten
        invalidateAuslastungCache(payload.datum);
        res.json({
          id: result.id,
          termin_nr: result.terminNr,
          message: 'Termin erfolgreich erstellt'
        });
      }
    });
  }

  static update(req, res) {
    const { tatsaechliche_zeit, mitarbeiter_id } = req.body;
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
    TermineModel.getById(req.params.id, (err, termin) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      TermineModel.update(req.params.id, updateData, (updateErr, result) => {
        if (updateErr) {
          res.status(500).json({ error: updateErr.message });
          return;
        }

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

        res.json({ changes: (result && result.changes) || 0, message: 'Termin aktualisiert' });
      });
    });
  }

  static lerneAusTatsaechlicherZeit(arbeitText, tatsaechlicheZeit, callback) {
    // Teile die Arbeiten auf (kann durch Komma oder Zeilenumbruch getrennt sein)
    const arbeiten = arbeitText
      .split(/[\r\n,]+/)
      .map(a => a.trim())
      .filter(Boolean);

    if (arbeiten.length === 0) {
      return callback(null);
    }

    // Berechne durchschnittliche Zeit pro Arbeit
    const zeitProArbeit = Math.round(tatsaechlicheZeit / arbeiten.length);

    // Aktualisiere Standardzeiten für jede Arbeit
    let aktualisiert = 0;
    let fehler = 0;

    const aktualisiereArbeit = (index) => {
      if (index >= arbeiten.length) {
        return callback(null, { aktualisiert, fehler });
      }

      const arbeit = arbeiten[index];
      ArbeitszeitenModel.updateByBezeichnung(arbeit, zeitProArbeit, (err, result) => {
        if (err) {
          console.error(`Fehler beim Aktualisieren von ${arbeit}:`, err);
          fehler++;
        } else if (result && result.changes > 0) {
          aktualisiert++;
          console.log(`Standardzeit für "${arbeit}" aktualisiert: ${result.alte_zeit} -> ${result.neue_zeit} Min (basierend auf ${result.tatsaechliche_zeit} Min)`);
        }
        aktualisiereArbeit(index + 1);
      });
    };

    aktualisiereArbeit(0);
  }

  static delete(req, res) {
    // Hole erst das Datum des Termins, um Cache zu invalidierten
    TermineModel.getById(req.params.id, (err, termin) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      TermineModel.delete(req.params.id, (deleteErr, result) => {
        if (deleteErr) {
          res.status(500).json({ error: deleteErr.message });
          return;
        }

        // Cache invalidierten
        if (termin && termin.datum) {
          invalidateAuslastungCache(termin.datum);
        }
        res.json({ changes: (result && result.changes) || 0, message: 'Termin gelöscht' });
      });
    });
  }

  static getAuslastung(req, res) {
    const { datum } = req.params;
    const { mitPuffer } = req.query; // Optional: ?mitPuffer=true
    const fallbackSettings = { pufferzeit_minuten: 15 };

    console.log('========================================');
    console.log(`getAuslastung aufgerufen für Datum: ${datum}, mitPuffer: ${mitPuffer}`);
    console.log('========================================');

    // Cache für dieses Datum invalidieren, um sicherzustellen, dass Abwesenheiten berücksichtigt werden
    console.log('🗑️ Invalidiere Cache für Datum:', datum);
    invalidateAuslastungCache(datum);
    
    // Prüfe Cache - aber nur wenn lehrlinge_auslastung vorhanden ist
    // (für Kompatibilität mit alten Cache-Einträgen)
    // TEMPORÄR: Cache komplett deaktiviert für Debugging
    // const cached = getCachedAuslastung(datum, mitPuffer);
    // if (cached && cached.lehrlinge_auslastung !== undefined) {
    //   console.log('⚠️ Cache-Hit! Verwende gecachte Daten');
    //   return res.json(cached);
    // }

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;

      // Lade alle aktiven Mitarbeiter
      console.log('👥 Lade aktive Mitarbeiter...');
      MitarbeiterModel.getAktive((mitErr, mitarbeiter) => {
        if (mitErr) {
          console.error('❌ Fehler beim Laden der Mitarbeiter:', mitErr);
          res.status(500).json({ error: mitErr.message });
          return;
        }

        console.log(`✅ ${(mitarbeiter || []).length} Mitarbeiter geladen:`, (mitarbeiter || []).map(m => `${m.name} (ID: ${m.id})`).join(', '));

        // Lade alle aktiven Lehrlinge
        console.log('👥 Lade aktive Lehrlinge...');
        LehrlingeModel.getAktive((lehrErr, lehrlinge) => {
          if (lehrErr) {
            console.error('❌ Fehler beim Laden der Lehrlinge:', lehrErr);
            res.status(500).json({ error: lehrErr.message });
            return;
          }

          console.log(`✅ ${(lehrlinge || []).length} Lehrlinge geladen`);

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;

        // Lade individuelle Mitarbeiter/Lehrlinge-Abwesenheiten für dieses Datum
        console.log(`Lade Abwesenheiten für Datum: ${datum}`);
        AbwesenheitenModel.getForDate(datum, (indAbsErr, individuelleAbwesenheiten) => {
          if (indAbsErr) {
            console.error('❌ Fehler beim Laden der Abwesenheiten:', indAbsErr);
            res.status(500).json({ error: indAbsErr.message });
            return;
          }

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
          console.log(`✅ Abwesende Mitarbeiter IDs im Set: [${Array.from(abwesendeMitarbeiter).join(', ')}]`);
          console.log(`✅ Abwesende Lehrlinge IDs im Set: [${Array.from(abwesendeLehrlinge).join(', ')}]`);

            // Berechne Auslastung pro Mitarbeiter
            // servicezeit muss hier verfügbar sein für die Callback-Funktionen
            const servicezeitWert = servicezeit;
            
            // Lade alle Termine für das Datum, um arbeitszeiten_details zu prüfen (für Lehrlinge Aufgabenbewältigung)
            TermineModel.getTermineByDatum(datum, (termineErr, alleTermine) => {
              if (termineErr) {
                res.status(500).json({ error: termineErr.message });
                return;
              }

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

              TermineModel.getAuslastungProMitarbeiter(datum, (ausErr, auslastungProMitarbeiter) => {
                if (ausErr) {
                  res.status(500).json({ error: ausErr.message });
                  return;
                }

                // Berechne Auslastung pro Lehrling
                TermineModel.getAuslastungProLehrling(datum, (lehrErr, auslastungProLehrling) => {
                  if (lehrErr) {
                    res.status(500).json({ error: lehrErr.message });
                    return;
                  }

                  // Konvertiere Lehrlings-Auslastung in das gleiche Format wie Mitarbeiter-Auslastung
                  // WICHTIG: Stelle sicher, dass immer ein Array zurückgegeben wird
                  const lehrlingeAuslastung = Array.isArray(auslastungProLehrling)
                    ? auslastungProLehrling.map(la => {
                        // Prüfe ob Lehrling abwesend ist
                        // Stelle sicher, dass die Lehrling-ID als Zahl verglichen wird
                        const lehrlingId = typeof la.lehrling_id === 'number' ? la.lehrling_id : parseInt(la.lehrling_id, 10);
                        const istAbwesend = abwesendeLehrlinge.has(lehrlingId);
                        const verfuegbar = istAbwesend ? 0 : la.verfuegbar_minuten;
                        const auslastung = verfuegbar > 0
                          ? Math.round((la.belegt_minuten / verfuegbar) * 100)
                          : (istAbwesend ? 0 : 100);

                        return {
                          lehrling_id: la.lehrling_id,
                          lehrling_name: la.lehrling_name,
                          arbeitsstunden_pro_tag: la.arbeitsstunden_pro_tag,
                          nebenzeit_prozent: la.nebenzeit_prozent,
                          aufgabenbewaeltigung_prozent: la.aufgabenbewaeltigung_prozent,
                          ist_abwesend: istAbwesend,
                          verfuegbar_minuten: verfuegbar,
                          belegt_minuten: la.belegt_minuten,
                          servicezeit_minuten: la.servicezeit_minuten,
                          auslastung_prozent: auslastung,
                          geplant_minuten: la.geplant_minuten,
                          in_arbeit_minuten: la.in_arbeit_minuten,
                          abgeschlossen_minuten: la.abgeschlossen_minuten,
                          termin_anzahl: la.termin_anzahl
                        };
                      })
                    : [];

                  // Berechne Gesamtauslastung (auch für Termine ohne Mitarbeiterzuordnung)
                  const auslastungCallback = mitPuffer === 'true' 
                    ? (err, row) => {
              if (err) {
                res.status(500).json({ error: err.message });
                return;
              }

              const belegt = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
              const belegtMitPuffer = (row && row.gesamt_minuten_mit_puffer) ? row.gesamt_minuten_mit_puffer : belegt;
              const geplant = (row && row.geplant_minuten) ? row.geplant_minuten : 0;
              const inArbeit = (row && row.in_arbeit_minuten) ? row.in_arbeit_minuten : 0;
              const abgeschlossen = (row && row.abgeschlossen_minuten) ? row.abgeschlossen_minuten : 0;
              const pufferMinuten = (row && row.puffer_minuten) ? row.puffer_minuten : 0;
              
                      // Berechne verfügbare Zeit: Summe aller Mitarbeiter (mit Nebenzeit) - NUR Werkstatt-Mitarbeiter
                      // WICHTIG: Verwende die vollständige Liste aller aktiven Mitarbeiter, nicht nur die mit Terminen
                      let gesamtVerfuegbar = 0;
                      let gesamtTerminAnzahl = 0;
                      
                      // Berechne Zeit, die "Nur Service" Mitarbeitern zugeordnet ist (wird von Gesamtauslastung abgezogen)
                      let nurServiceZugeordneteZeit = 0;
                      
                      // Gesamtanzahl aller Termine für Servicezeit-Berechnung (nur_service Mitarbeiter bekommen Servicezeit für ALLE Termine)
                      const gesamtTerminAnzahlFuerService = (row && row.termin_anzahl) ? row.termin_anzahl : 0;
                      
                      // Erstelle eine Map für schnellen Zugriff auf Termin-Daten pro Mitarbeiter
                      const terminDatenMap = {};
                      (auslastungProMitarbeiter || []).forEach(ma => {
                        // Stelle sicher, dass die Mitarbeiter-ID als Zahl verwendet wird
                        const mitarbeiterId = typeof ma.mitarbeiter_id === 'number' ? ma.mitarbeiter_id : parseInt(ma.mitarbeiter_id, 10);
                        terminDatenMap[mitarbeiterId] = ma;
                        gesamtTerminAnzahl += ma.termin_anzahl || 0;
                        
                        // Prüfe ob dieser Mitarbeiter "Nur Service" ist
                        const mitarbeiterInfo = (mitarbeiter || []).find(m => m.id === mitarbeiterId);
                        if (mitarbeiterInfo) {
                          const istNurService = mitarbeiterInfo.nur_service === 1 || mitarbeiterInfo.nur_service === true || mitarbeiterInfo.nur_service === '1' || mitarbeiterInfo.nur_service === 'true';
                          if (istNurService) {
                            // Zeit, die diesem "Nur Service" Mitarbeiter zugeordnet ist
                            nurServiceZugeordneteZeit += ma.belegt_minuten || 0;
                            console.log(`  "Nur Service" Mitarbeiter ${mitarbeiterInfo.name} hat ${ma.belegt_minuten || 0} Min zugeordnet - wird von Gesamtauslastung abgezogen`);
                          }
                        }
                      });
                      
                      // Berechne für ALLE aktiven Mitarbeiter (nicht nur die mit Terminen)
                      console.log('Berechne Mitarbeiter-Auslastung, abwesendeMitarbeiter Set:', Array.from(abwesendeMitarbeiter));
                      console.log('Set-Größe:', abwesendeMitarbeiter.size);
                      const mitarbeiterAuslastung = (mitarbeiter || []).map(m => {
                        // Stelle sicher, dass die Mitarbeiter-ID als Zahl verwendet wird
                        const mitarbeiterId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
                        // Hole Termin-Daten für diesen Mitarbeiter (falls vorhanden)
                        const ma = terminDatenMap[mitarbeiterId] || {
                          mitarbeiter_id: mitarbeiterId,
                          belegt_minuten: 0,
                          geplant_minuten: 0,
                          in_arbeit_minuten: 0,
                          abgeschlossen_minuten: 0,
                          termin_anzahl: 0
                        };
                        const arbeitszeitMinuten = (m.arbeitsstunden_pro_tag || 8) * 60;
                        const nebenzeitMinuten = arbeitszeitMinuten * ((m.nebenzeit_prozent || 0) / 100);
                        let verfuegbar = arbeitszeitMinuten - nebenzeitMinuten;

                        // Prüfe ob Mitarbeiter abwesend ist (Urlaub/Krank)
                        const istAbwesend = abwesendeMitarbeiter.has(mitarbeiterId);
                        console.log(`  Mitarbeiter ${m.name} (ID ${mitarbeiterId}): istAbwesend=${istAbwesend}, verfuegbar vorher=${verfuegbar}`);
                        if (istAbwesend) {
                          console.log(`  ✓ Setze verfügbare Zeit für ${m.name} auf 0`);
                          verfuegbar = 0; // Keine verfügbare Zeit bei Abwesenheit
                        }

                        const terminAnzahl = ma.termin_anzahl || 0;
                        // Prüfe nur_service: kann 1, true, "1" oder "true" sein
                        const nurService = m.nur_service === 1 || m.nur_service === true || m.nur_service === '1' || m.nur_service === 'true';

                        let servicezeitFuerMitarbeiter = 0;
                        let belegt = ma.belegt_minuten || 0;
                        let belegtMitService = belegt;
                        let verfuegbarNachService = verfuegbar;

                        if (nurService) {
                          // Mitarbeiter macht nur Service - seine Zeit zählt NICHT zur Werkstattkapazität
                          // Servicezeit wird basierend auf ALLEN Terminen des Tages berechnet (NUR für nur_service Mitarbeiter)
                          servicezeitFuerMitarbeiter = gesamtTerminAnzahlFuerService * servicezeitWert;
                          belegtMitService = servicezeitFuerMitarbeiter;
                          // Für nur_service Mitarbeiter: verfuegbar_minuten zeigt seine eigene Kapazität für Auslastungsanzeige
                          verfuegbarNachService = verfuegbar;
                          // NICHT zu gesamtVerfuegbar hinzufügen (für Werkstatt-Gesamtkapazität)!
                        } else {
                          // Mitarbeiter macht Werkstattaufgaben - zählt zur Werkstattkapazität
                          // Servicezeit wird NICHT zu normalen Mitarbeitern hinzugefügt
                          servicezeitFuerMitarbeiter = 0;
                          belegtMitService = belegt;
                          verfuegbarNachService = verfuegbar;
                          // Nur nicht-abwesende Mitarbeiter zur Gesamtverfügbarkeit hinzufügen
                          if (!istAbwesend) {
                            gesamtVerfuegbar += verfuegbar; // Nur Werkstatt-Mitarbeiter zählen
                          }
                        }

                        // Berechne Auslastungsprozent: Bei Abwesenheit 0%, sonst normal berechnen
                        const prozent = verfuegbarNachService > 0 
                          ? (belegtMitService / verfuegbarNachService) * 100 
                          : (istAbwesend ? 0 : 100);

                        return {
                          mitarbeiter_id: m.id,
                          mitarbeiter_name: m.name,
                          arbeitsstunden_pro_tag: m.arbeitsstunden_pro_tag,
                          nebenzeit_prozent: m.nebenzeit_prozent,
                          nur_service: nurService,
                          ist_abwesend: istAbwesend,
                          verfuegbar_minuten: verfuegbarNachService,
                          belegt_minuten: belegtMitService,
                          servicezeit_minuten: servicezeitFuerMitarbeiter,
                          auslastung_prozent: Math.round(prozent),
                          geplant_minuten: ma.geplant_minuten || 0,
                          in_arbeit_minuten: ma.in_arbeit_minuten || 0,
                          abgeschlossen_minuten: ma.abgeschlossen_minuten || 0,
                          termin_anzahl: terminAnzahl
                        };
                      });

                      // Lehrlinge erhöhen verfügbare Zeit (ihre Arbeitszeit minus Nebenzeit, reduziert durch Aufgabenbewältigung)
                      const lehrlingeVerfuegbar = (lehrlinge || []).reduce((sum, l) => {
                        // Prüfe ob Lehrling abwesend ist
                        // Stelle sicher, dass die Lehrling-ID als Zahl verglichen wird
                        const lehrlingId = typeof l.id === 'number' ? l.id : parseInt(l.id, 10);
                        const istAbwesend = abwesendeLehrlinge.has(lehrlingId);
                        if (istAbwesend) {
                          return sum; // Überspringe abwesende Lehrlinge
                        }
                        const arbeitszeitMinuten = (l.arbeitsstunden_pro_tag || 8) * 60;
                        const nebenzeitMinuten = arbeitszeitMinuten * ((l.nebenzeit_prozent || 0) / 100);
                        const nettoArbeitszeitMinuten = arbeitszeitMinuten - nebenzeitMinuten;
                        // Aufgabenbewältigung reduziert die effektive verfügbare Zeit
                        // 150% = braucht 1.5× länger → effektive Zeit = Arbeitszeit / 1.5
                        const aufgabenbewaeltigung = (l.aufgabenbewaeltigung_prozent || 100) / 100;
                        const effektiveVerfuegbar = nettoArbeitszeitMinuten / aufgabenbewaeltigung;
                        return sum + effektiveVerfuegbar;
                      }, 0);
                      gesamtVerfuegbar = Math.max(gesamtVerfuegbar + lehrlingeVerfuegbar, 1);

                    // Servicezeit wird NUR den nur_service Mitarbeitern zugerechnet
                    // Für die Gesamtauslastung wird keine Servicezeit mehr hinzugefügt,
                    // da sie bereits in der individuellen Auslastung der nur_service Mitarbeiter enthalten ist
                    const verbleibendeServicezeit = 0; // Nicht mehr verwendet, da Servicezeit nur bei nur_service Mitarbeitern

                    // Belegte Zeit = Termine + Puffer + zusätzliche Zeit durch Lehrlinge (Aufgabenbewältigung)
                    // Servicezeit wird NICHT hinzugefügt, da sie nur den nur_service Mitarbeitern zugerechnet wird
                    // WICHTIG: Ziehe die Zeit ab, die "Nur Service" Mitarbeitern zugeordnet ist, 
                    // da diese nicht zur Werkstatt-Kapazität beitragen
                    const belegtOhneNurService = Math.max(belegtMitPuffer - nurServiceZugeordneteZeit, 0);
                    console.log(`Gesamtauslastung: belegtMitPuffer=${belegtMitPuffer}, nurServiceZugeordneteZeit=${nurServiceZugeordneteZeit}, belegtOhneNurService=${belegtOhneNurService}`);
                    const belegtMitService = belegtOhneNurService + lehrlingeZusaetzlicheZeit;
                    // Verfügbar = Gesamt verfügbar - Belegt (zeigt RESTLICHE verfügbare Zeit)
                    const verfuegbar = Math.max(gesamtVerfuegbar - belegtMitService, 0);
                    // Auslastung = (Belegt + Servicezeit + Lehrlinge-Zusatzzeit) / Gesamt verfügbar * 100
                    const prozent = (belegtMitService / gesamtVerfuegbar) * 100;

              const result = {
                belegt_minuten: belegt,
                belegt_minuten_mit_puffer: belegtMitPuffer,
                      belegt_minuten_mit_service: belegtMitService,
                      servicezeit_minuten: verbleibendeServicezeit,
                puffer_minuten: pufferMinuten,
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
                  abwesendeMitarbeiterIds: Array.from(abwesendeMitarbeiter || []),
                  abwesendeLehrlingeIds: Array.from(abwesendeLehrlinge || []),
                  gefundeneAbwesenheiten: (typeof debugAbwesenheiten !== 'undefined') ? debugAbwesenheiten : [],
                  setGroesse: (abwesendeMitarbeiter || new Set()).size,
                  mitarbeiterIds: (mitarbeiter || []).map(m => ({ id: m.id, name: m.name }))
                }
              };
                      setCachedAuslastung(datum, mitPuffer, result);
                      res.json(result);
                    }
                    : (err, row) => {
                      if (err) {
                        res.status(500).json({ error: err.message });
                        return;
                      }

                      // Berechne Auslastung pro Lehrling auch für diesen Callback
                      TermineModel.getAuslastungProLehrling(datum, (lehrErr2, auslastungProLehrling2) => {
                        if (lehrErr2) {
                          res.status(500).json({ error: lehrErr2.message });
                          return;
                        }

                        // Konvertiere Lehrlings-Auslastung in das gleiche Format wie Mitarbeiter-Auslastung
                        // WICHTIG: Stelle sicher, dass immer ein Array zurückgegeben wird
                        const lehrlingeAuslastung2 = Array.isArray(auslastungProLehrling2)
                          ? auslastungProLehrling2.map(la => {
                              // Prüfe ob Lehrling abwesend ist
                              // Stelle sicher, dass die Lehrling-ID als Zahl verglichen wird
                              const lehrlingId = typeof la.lehrling_id === 'number' ? la.lehrling_id : parseInt(la.lehrling_id, 10);
                              const istAbwesend = abwesendeLehrlinge.has(lehrlingId);
                              const verfuegbar = istAbwesend ? 0 : la.verfuegbar_minuten;
                              const auslastung = verfuegbar > 0
                                ? Math.round((la.belegt_minuten / verfuegbar) * 100)
                                : (istAbwesend ? 0 : 100);

                              return {
                              lehrling_id: la.lehrling_id,
                              lehrling_name: la.lehrling_name,
                              arbeitsstunden_pro_tag: la.arbeitsstunden_pro_tag,
                              nebenzeit_prozent: la.nebenzeit_prozent,
                              aufgabenbewaeltigung_prozent: la.aufgabenbewaeltigung_prozent,
                              ist_abwesend: istAbwesend,
                              verfuegbar_minuten: verfuegbar,
                              belegt_minuten: la.belegt_minuten,
                              servicezeit_minuten: la.servicezeit_minuten,
                              auslastung_prozent: auslastung,
                              geplant_minuten: la.geplant_minuten,
                              in_arbeit_minuten: la.in_arbeit_minuten,
                              abgeschlossen_minuten: la.abgeschlossen_minuten,
                              termin_anzahl: la.termin_anzahl
                              };
                            })
                          : [];

                        const belegt = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
                        const geplant = (row && row.geplant_minuten) ? row.geplant_minuten : 0;
                        const inArbeit = (row && row.in_arbeit_minuten) ? row.in_arbeit_minuten : 0;
                        const abgeschlossen = (row && row.abgeschlossen_minuten) ? row.abgeschlossen_minuten : 0;

                    // Berechne zusätzliche Zeit durch Lehrlinge (Aufgabenbewältigung) - verwende bereits geladene Termine
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

                    // Berechne verfügbare Zeit: Summe aller Mitarbeiter (mit Nebenzeit) - NUR Werkstatt-Mitarbeiter
                    // WICHTIG: Verwende die vollständige Liste aller aktiven Mitarbeiter, nicht nur die mit Terminen
                    let gesamtVerfuegbar = 0;
                    let gesamtTerminAnzahl = 0;
                    
                    // Berechne Zeit, die "Nur Service" Mitarbeitern zugeordnet ist (wird von Gesamtauslastung abgezogen)
                    let nurServiceZugeordneteZeit = 0;
                    
                    // Gesamtanzahl aller Termine für Servicezeit-Berechnung (nur_service Mitarbeiter bekommen Servicezeit für ALLE Termine)
                    const gesamtTerminAnzahlFuerService = (row && row.termin_anzahl) ? row.termin_anzahl : 0;
                    
                    // Erstelle eine Map für schnellen Zugriff auf Termin-Daten pro Mitarbeiter
                    const terminDatenMap2 = {};
                    (auslastungProMitarbeiter || []).forEach(ma => {
                      // Stelle sicher, dass die Mitarbeiter-ID als Zahl verwendet wird
                      const mitarbeiterId = typeof ma.mitarbeiter_id === 'number' ? ma.mitarbeiter_id : parseInt(ma.mitarbeiter_id, 10);
                      terminDatenMap2[mitarbeiterId] = ma;
                      gesamtTerminAnzahl += ma.termin_anzahl || 0;
                      
                      // Prüfe ob dieser Mitarbeiter "Nur Service" ist
                      const mitarbeiterInfo = (mitarbeiter || []).find(m => m.id === mitarbeiterId);
                      if (mitarbeiterInfo) {
                        const istNurService = mitarbeiterInfo.nur_service === 1 || mitarbeiterInfo.nur_service === true || mitarbeiterInfo.nur_service === '1' || mitarbeiterInfo.nur_service === 'true';
                        if (istNurService) {
                          // Zeit, die diesem "Nur Service" Mitarbeiter zugeordnet ist
                          nurServiceZugeordneteZeit += ma.belegt_minuten || 0;
                        }
                      }
                    });
                    
                    // Berechne für ALLE aktiven Mitarbeiter (nicht nur die mit Terminen)
                    const mitarbeiterAuslastung = (mitarbeiter || []).map(m => {
                      // Stelle sicher, dass die Mitarbeiter-ID als Zahl verwendet wird
                      const mitarbeiterId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
                      // Hole Termin-Daten für diesen Mitarbeiter (falls vorhanden)
                      const ma = terminDatenMap2[mitarbeiterId] || {
                        mitarbeiter_id: mitarbeiterId,
                        belegt_minuten: 0,
                        geplant_minuten: 0,
                        in_arbeit_minuten: 0,
                        abgeschlossen_minuten: 0,
                        termin_anzahl: 0
                      };
                      
                      const arbeitszeitMinuten = (m.arbeitsstunden_pro_tag || 8) * 60;
                      const nebenzeitMinuten = arbeitszeitMinuten * ((m.nebenzeit_prozent || 0) / 100);
                      let verfuegbar = arbeitszeitMinuten - nebenzeitMinuten;

                      // Prüfe ob Mitarbeiter abwesend ist (Urlaub/Krank)
                      const istAbwesend = abwesendeMitarbeiter.has(mitarbeiterId);
                      if (istAbwesend) {
                        verfuegbar = 0; // Keine verfügbare Zeit bei Abwesenheit
                      }

                      const terminAnzahl = ma.termin_anzahl || 0;
                      // Prüfe nur_service: kann 1, true, "1" oder "true" sein
                      const nurService = m.nur_service === 1 || m.nur_service === true || m.nur_service === '1' || m.nur_service === 'true';
                      
                      let servicezeitFuerMitarbeiter = 0;
                      let belegt = ma.belegt_minuten || 0;
                      let belegtMitService = belegt;
                      let verfuegbarNachService = verfuegbar;
                      
                      if (nurService) {
                        // Mitarbeiter macht nur Service - seine Zeit zählt NICHT zur Werkstattkapazität
                        // Servicezeit wird basierend auf ALLEN Terminen des Tages berechnet (NUR für nur_service Mitarbeiter)
                        servicezeitFuerMitarbeiter = gesamtTerminAnzahlFuerService * servicezeitWert;
                        belegtMitService = servicezeitFuerMitarbeiter;
                        // Für nur_service Mitarbeiter: verfuegbar_minuten zeigt seine eigene Kapazität für Auslastungsanzeige
                        verfuegbarNachService = verfuegbar;
                        // NICHT zu gesamtVerfuegbar hinzufügen (für Werkstatt-Gesamtkapazität)!
                      } else {
                        // Mitarbeiter macht Werkstattaufgaben - zählt zur Werkstattkapazität
                        // Servicezeit wird NICHT zu normalen Mitarbeitern hinzugefügt
                        servicezeitFuerMitarbeiter = 0;
                        belegtMitService = belegt;
                        verfuegbarNachService = verfuegbar;
                        // Nur nicht-abwesende Mitarbeiter zur Gesamtverfügbarkeit hinzufügen
                        if (!istAbwesend) {
                          gesamtVerfuegbar += verfuegbar; // Nur Werkstatt-Mitarbeiter zählen
                        }
                      }

                      // Berechne Auslastungsprozent: Bei Abwesenheit 0%, sonst normal berechnen
                      const prozent = verfuegbarNachService > 0 
                        ? (belegtMitService / verfuegbarNachService) * 100 
                        : (istAbwesend ? 0 : 100);

                      return {
                        mitarbeiter_id: m.id,
                        mitarbeiter_name: m.name,
                        arbeitsstunden_pro_tag: m.arbeitsstunden_pro_tag,
                        nebenzeit_prozent: m.nebenzeit_prozent,
                        nur_service: nurService,
                        ist_abwesend: istAbwesend,
                        verfuegbar_minuten: verfuegbarNachService,
                        belegt_minuten: belegtMitService,
                        servicezeit_minuten: servicezeitFuerMitarbeiter,
                        auslastung_prozent: Math.round(prozent),
                        geplant_minuten: ma.geplant_minuten || 0,
                        in_arbeit_minuten: ma.in_arbeit_minuten || 0,
                        abgeschlossen_minuten: ma.abgeschlossen_minuten || 0,
                        termin_anzahl: terminAnzahl
                      };
                    });

                    // Lehrlinge erhöhen verfügbare Zeit (ihre Arbeitszeit minus Nebenzeit, reduziert durch Aufgabenbewältigung)
                    const lehrlingeVerfuegbar = (lehrlinge || []).reduce((sum, l) => {
                      // Prüfe ob Lehrling abwesend ist
                      // Stelle sicher, dass die Lehrling-ID als Zahl verglichen wird
                      const lehrlingId = typeof l.id === 'number' ? l.id : parseInt(l.id, 10);
                      const istAbwesend = abwesendeLehrlinge.has(lehrlingId);
                      if (istAbwesend) {
                        return sum; // Überspringe abwesende Lehrlinge
                      }
                      const arbeitszeitMinuten = (l.arbeitsstunden_pro_tag || 8) * 60;
                      const nebenzeitMinuten = arbeitszeitMinuten * ((l.nebenzeit_prozent || 0) / 100);
                      const nettoArbeitszeitMinuten = arbeitszeitMinuten - nebenzeitMinuten;
                      // Aufgabenbewältigung reduziert die effektive verfügbare Zeit
                      // 150% = braucht 1.5× länger → effektive Zeit = Arbeitszeit / 1.5
                      const aufgabenbewaeltigung = (l.aufgabenbewaeltigung_prozent || 100) / 100;
                      const effektiveVerfuegbar = nettoArbeitszeitMinuten / aufgabenbewaeltigung;
                      return sum + effektiveVerfuegbar;
                    }, 0);
                    gesamtVerfuegbar = Math.max(gesamtVerfuegbar + lehrlingeVerfuegbar, 1);

                    // Servicezeit wird NUR den nur_service Mitarbeitern zugerechnet
                    // Für die Gesamtauslastung wird keine Servicezeit mehr hinzugefügt,
                    // da sie bereits in der individuellen Auslastung der nur_service Mitarbeiter enthalten ist
                    const verbleibendeServicezeit = 0; // Nicht mehr verwendet, da Servicezeit nur bei nur_service Mitarbeitern

                    // Belegte Zeit = Termine + zusätzliche Zeit durch Lehrlinge (Aufgabenbewältigung)
                    // Servicezeit wird NICHT hinzugefügt, da sie nur den nur_service Mitarbeitern zugerechnet wird
                    // WICHTIG: Ziehe die Zeit ab, die "Nur Service" Mitarbeitern zugeordnet ist,
                    // da diese nicht zur Werkstatt-Kapazität beitragen
                    const belegtOhneNurService = Math.max(belegt - nurServiceZugeordneteZeit, 0);
                    const belegtMitService = belegtOhneNurService + lehrlingeZusaetzlicheZeit;
                    const verfuegbar = Math.max(gesamtVerfuegbar - belegtMitService, 0);
                    const prozent = (belegtMitService / gesamtVerfuegbar) * 100;

                        const result = {
                          belegt_minuten: belegt,
                          belegt_minuten_mit_service: belegtMitService,
                          servicezeit_minuten: verbleibendeServicezeit,
                          verfuegbar_minuten: verfuegbar,
                          gesamt_minuten: gesamtVerfuegbar,
                          auslastung_prozent: Math.round(prozent),
                          geplant_minuten: geplant,
                          in_arbeit_minuten: inArbeit,
                          abgeschlossen_minuten: abgeschlossen,
                          mitarbeiter_auslastung: mitarbeiterAuslastung,
                          lehrlinge_auslastung: lehrlingeAuslastung2,
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
                            abwesendeMitarbeiterIds: (typeof abwesendeMitarbeiter !== 'undefined' && abwesendeMitarbeiter) ? Array.from(abwesendeMitarbeiter) : [],
                            abwesendeLehrlingeIds: (typeof abwesendeLehrlinge !== 'undefined' && abwesendeLehrlinge) ? Array.from(abwesendeLehrlinge) : [],
                            gefundeneAbwesenheiten: (typeof debugAbwesenheiten !== 'undefined') ? debugAbwesenheiten : [],
                            abwesendeMitarbeiterDefiniert: typeof abwesendeMitarbeiter !== 'undefined',
                            abwesendeLehrlingeDefiniert: typeof abwesendeLehrlinge !== 'undefined'
                          }
                        };
                        setCachedAuslastung(datum, mitPuffer, result);
                        res.json(result);
                      });
                    };

                  if (mitPuffer === 'true') {
                    TermineModel.getAuslastungMitPuffer(datum, pufferzeit, auslastungCallback);
                  } else {
                    TermineModel.getAuslastung(datum, auslastungCallback);
                  }
                });
              });
            });
          });  // Ende getTermineByDatum callback
        });  // Ende getForDate callback
      });  // Ende getByDatum callback
    });  // Ende getLehrlinge callback
  });  // Ende getMitarbeiter callback
  }

  static checkAvailability(req, res) {
    const { datum, dauer } = req.query;
    const geschaetzteZeit = dauer ? parseInt(dauer, 10) : null;

    if (!datum) {
      return res.status(400).json({ error: 'Datum ist erforderlich' });
    }

    if (!geschaetzteZeit || geschaetzteZeit <= 0) {
      return res.status(400).json({ error: 'Gültige Dauer ist erforderlich' });
    }

    const fallbackSettings = { pufferzeit_minuten: 15 };

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;

      // Lade aktive Mitarbeiter und berechne verfügbare Zeit
      MitarbeiterModel.getAktive((mitErr, mitarbeiter) => {
        if (mitErr) {
          res.status(500).json({ error: mitErr.message });
          return;
        }

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
          const mitarbeiterAnzahl = (mitarbeiter || []).length;
          const verfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - urlaub - krank, 0);
          
          // Berechne verfügbare Zeit aus allen Mitarbeitern
          let arbeitszeit_pro_tag = 0;
          (mitarbeiter || []).forEach(ma => {
            const arbeitszeitMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
            const nebenzeitMinuten = arbeitszeitMinuten * ((ma.nebenzeit_prozent || 0) / 100);
            arbeitszeit_pro_tag += arbeitszeitMinuten - nebenzeitMinuten;
          });
          arbeitszeit_pro_tag = Math.max(arbeitszeit_pro_tag, 1);

        // Hole aktuelle Auslastung mit Pufferzeiten
        TermineModel.getAuslastungMitPuffer(datum, pufferzeit, (err, row) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }

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
          });
        });
      });
    });
  }

  static validate(req, res) {
    const { datum, geschaetzte_zeit } = req.body;

    if (!datum) {
      return res.status(400).json({ error: 'Datum ist erforderlich' });
    }

    if (!geschaetzte_zeit || geschaetzte_zeit <= 0) {
      return res.status(400).json({ error: 'Gültige geschätzte Zeit ist erforderlich' });
    }

    // Verwende die gleiche Logik wie checkAvailability
    const fallbackSettings = { pufferzeit_minuten: 15 };

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;

      // Lade aktive Mitarbeiter und berechne verfügbare Zeit
      MitarbeiterModel.getAktive((mitErr, mitarbeiter) => {
        if (mitErr) {
          res.status(500).json({ error: mitErr.message });
          return;
        }

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
          const mitarbeiterAnzahl = (mitarbeiter || []).length;
          const verfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - urlaub - krank, 0);
          
          // Berechne verfügbare Zeit aus allen Mitarbeitern
          let arbeitszeit_pro_tag = 0;
          (mitarbeiter || []).forEach(ma => {
            const arbeitszeitMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
            const nebenzeitMinuten = arbeitszeitMinuten * ((ma.nebenzeit_prozent || 0) / 100);
            arbeitszeit_pro_tag += arbeitszeitMinuten - nebenzeitMinuten;
          });
          arbeitszeit_pro_tag = Math.max(arbeitszeit_pro_tag, 1);

        // Hole aktuelle Auslastung mit Pufferzeiten
        TermineModel.getAuslastungMitPuffer(datum, pufferzeit, (err, row) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }

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
          });
        });
      });
    });
  }

  static getVorschlaege(req, res) {
    const { datum, dauer } = req.query;
    const geschaetzteZeit = dauer ? parseInt(dauer, 10) : null;

    if (!datum) {
      return res.status(400).json({ error: 'Datum ist erforderlich' });
    }

    if (!geschaetzteZeit || geschaetzteZeit <= 0) {
      return res.status(400).json({ error: 'Gültige Dauer ist erforderlich' });
    }

    const fallbackSettings = { pufferzeit_minuten: 15 };

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const servicezeit = einstellungen?.servicezeit_minuten || 10;

      // Lade aktive Mitarbeiter und berechne verfügbare Zeit
      MitarbeiterModel.getAktive((mitErr, mitarbeiter) => {
        if (mitErr) {
          res.status(500).json({ error: mitErr.message });
          return;
        }

        const mitarbeiterAnzahl = (mitarbeiter || []).length;
        
        // Berechne verfügbare Zeit aus allen Mitarbeitern
        let arbeitszeit_pro_tag = 0;
        (mitarbeiter || []).forEach(ma => {
          const arbeitszeitMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
          const nebenzeitMinuten = arbeitszeitMinuten * ((ma.nebenzeit_prozent || 0) / 100);
          arbeitszeit_pro_tag += arbeitszeitMinuten - nebenzeitMinuten;
        });
        arbeitszeit_pro_tag = Math.max(arbeitszeit_pro_tag, 1);

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
          const verfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - urlaub - krank, 0);

        // Hole aktuelle Termine für das Datum
        TermineModel.getTermineByDatum(datum, (err, termine) => {
          if (err) {
            res.status(500).json({ error: err.message });
            return;
          }

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

          // Prüfe alternative Daten
          let gepruefteDaten = 0;
          const maxAlternativen = 3;
          const pruefeAlternativesDatum = (index) => {
            if (index >= alternativeDaten.length || vorschlaege.length >= maxAlternativen + 1) {
              return res.json({
                vorschlaege: vorschlaege,
                gewuenschtes_datum: datum,
                benoetigte_zeit_minuten: geschaetzteZeit
              });
            }

            const altDatum = alternativeDaten[index];
            AbwesenheitenModel.getByDatum(altDatum, (altAbsErr, altAbwesenheit) => {
              const altUrlaub = altAbwesenheit?.urlaub || 0;
              const altKrank = altAbwesenheit?.krank || 0;
              const altVerfuegbareMitarbeiter = Math.max(mitarbeiterAnzahl - altUrlaub - altKrank, 0);
              // Verwende die gleiche arbeitszeit_pro_tag wie für das Hauptdatum
              const altArbeitszeit_pro_tag = arbeitszeit_pro_tag;

              TermineModel.getTermineByDatum(altDatum, (altErr, altTermine) => {
                if (altErr) {
                  return pruefeAlternativesDatum(index + 1);
                }

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

                pruefeAlternativesDatum(index + 1);
              });
            });
          };

          if (vorschlaege.length === 0 || vorschlaege.length < maxAlternativen + 1) {
            pruefeAlternativesDatum(0);
          } else {
            res.json({
              vorschlaege: vorschlaege,
              gewuenschtes_datum: datum,
              benoetigte_zeit_minuten: geschaetzteZeit
            });
          }
          });
        });
      });
    });
  }

  // Papierkorb-Funktionen
  static getDeleted(req, res) {
    TermineModel.getDeleted((err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(rows || []);
      }
    });
  }

  static restore(req, res) {
    const { id } = req.params;

    // Hole den Termin zuerst, um das Datum für Cache-Invalidierung zu bekommen
    TermineModel.getById(id, (err, termin) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      TermineModel.restore(id, (restoreErr, result) => {
        if (restoreErr) {
          res.status(500).json({ error: restoreErr.message });
        } else {
          // Cache invalidierten
          invalidateAuslastungCache(termin.datum);
          res.json({ message: 'Termin wiederhergestellt', changes: result.changes });
        }
      });
    });
  }

  static permanentDelete(req, res) {
    const { id } = req.params;

    // Hole den Termin zuerst, um das Datum für Cache-Invalidierung zu bekommen
    TermineModel.getById(id, (err, termin) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!termin) {
        return res.status(404).json({ error: 'Termin nicht gefunden' });
      }

      TermineModel.permanentDelete(id, (deleteErr, result) => {
        if (deleteErr) {
          res.status(500).json({ error: deleteErr.message });
        } else {
          // Cache invalidierten
          invalidateAuslastungCache(termin.datum);
          res.json({ message: 'Termin permanent gelöscht', changes: result.changes });
        }
      });
    });
  }
}

// Exportiere auch die Cache-Invalidierungsfunktion für andere Controller
TermineController.invalidateAuslastungCache = invalidateAuslastungCache;

module.exports = TermineController;
