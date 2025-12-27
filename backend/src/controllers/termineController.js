const TermineModel = require('../models/termineModel');
const EinstellungenModel = require('../models/einstellungenModel');
const AbwesenheitenModel = require('../models/abwesenheitenModel');
const ArbeitszeitenModel = require('../models/arbeitszeitenModel');

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

    const payload = {
      ...req.body,
      kilometerstand: kilometerstandWert,
      ersatzauto: req.body.ersatzauto ? 1 : 0,
      abholung_zeit: req.body.abholung_zeit || null,
      bring_zeit: req.body.bring_zeit || null,
      kontakt_option: req.body.kontakt_option || null
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
    const { tatsaechliche_zeit } = req.body;
    const sollteLernen = tatsaechliche_zeit && tatsaechliche_zeit > 0;

    // Hole erst das Datum des Termins, um Cache zu invalidierten
    TermineModel.getById(req.params.id, (err, termin) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      TermineModel.update(req.params.id, req.body, (updateErr, result) => {
        if (updateErr) {
          res.status(500).json({ error: updateErr.message });
          return;
        }

        // Cache invalidierten
        if (termin && termin.datum) {
          invalidateAuslastungCache(termin.datum);
        }

        // Lernfunktion: Passe Standardzeiten an, wenn tatsächliche Zeit gesetzt wurde
        if (sollteLernen && termin && termin.arbeit) {
          this.lerneAusTatsaechlicherZeit(termin.arbeit, tatsaechliche_zeit, (lernErr) => {
            if (lernErr) {
              console.error('Fehler bei Lernfunktion:', lernErr);
              // Fehler nicht an Client weitergeben, da Termin bereits aktualisiert wurde
            }
          });
        }

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
    const fallbackSettings = { mitarbeiter_anzahl: 1, arbeitsstunden_pro_tag: 8, pufferzeit_minuten: 15 };

    // Prüfe Cache
    const cached = getCachedAuslastung(datum, mitPuffer);
    if (cached) {
      return res.json(cached);
    }

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const mitarbeiter = einstellungen?.mitarbeiter_anzahl || fallbackSettings.mitarbeiter_anzahl;
      const arbeitsstunden = einstellungen?.arbeitsstunden_pro_tag || fallbackSettings.arbeitsstunden_pro_tag;
      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const arbeitszeit_pro_mitarbeiter = arbeitsstunden * 60;

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
        const verfuegbareMitarbeiter = Math.max(mitarbeiter - urlaub - krank, 0);
        const arbeitszeit_pro_tag = Math.max(verfuegbareMitarbeiter * arbeitszeit_pro_mitarbeiter, 1);

        // Verwende verbesserte Berechnung mit Pufferzeiten wenn gewünscht
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
              
              // Verwende belegtMitPuffer für Auslastungsberechnung
              const verfuegbar = Math.max(arbeitszeit_pro_tag - belegtMitPuffer, 0);
              const prozent = (belegtMitPuffer / arbeitszeit_pro_tag) * 100;

              const result = {
                belegt_minuten: belegt,
                belegt_minuten_mit_puffer: belegtMitPuffer,
                puffer_minuten: pufferMinuten,
                verfuegbar_minuten: verfuegbar,
                gesamt_minuten: arbeitszeit_pro_tag,
                auslastung_prozent: Math.round(prozent),
                geplant_minuten: geplant,
                in_arbeit_minuten: inArbeit,
                abgeschlossen_minuten: abgeschlossen,
                einstellungen: {
                  mitarbeiter_anzahl: mitarbeiter,
                  arbeitsstunden_pro_tag: arbeitsstunden,
                  pufferzeit_minuten: pufferzeit
                },
                abwesenheit: {
                  urlaub,
                  krank,
                  verfuegbare_mitarbeiter: verfuegbareMitarbeiter
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

              const belegt = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
              const geplant = (row && row.geplant_minuten) ? row.geplant_minuten : 0;
              const inArbeit = (row && row.in_arbeit_minuten) ? row.in_arbeit_minuten : 0;
              const abgeschlossen = (row && row.abgeschlossen_minuten) ? row.abgeschlossen_minuten : 0;
              const verfuegbar = Math.max(arbeitszeit_pro_tag - belegt, 0);
              const prozent = (belegt / arbeitszeit_pro_tag) * 100;

              const result = {
                belegt_minuten: belegt,
                verfuegbar_minuten: verfuegbar,
                gesamt_minuten: arbeitszeit_pro_tag,
                auslastung_prozent: Math.round(prozent),
                geplant_minuten: geplant,
                in_arbeit_minuten: inArbeit,
                abgeschlossen_minuten: abgeschlossen,
                einstellungen: {
                  mitarbeiter_anzahl: mitarbeiter,
                  arbeitsstunden_pro_tag: arbeitsstunden,
                  pufferzeit_minuten: pufferzeit
                },
                abwesenheit: {
                  urlaub,
                  krank,
                  verfuegbare_mitarbeiter: verfuegbareMitarbeiter
                }
              };
              setCachedAuslastung(datum, mitPuffer, result);
              res.json(result);
            };

        if (mitPuffer === 'true') {
          TermineModel.getAuslastungMitPuffer(datum, pufferzeit, auslastungCallback);
        } else {
          TermineModel.getAuslastung(datum, auslastungCallback);
        }
      });
    });
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

    const fallbackSettings = { mitarbeiter_anzahl: 1, arbeitsstunden_pro_tag: 8, pufferzeit_minuten: 15 };

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const mitarbeiter = einstellungen?.mitarbeiter_anzahl || fallbackSettings.mitarbeiter_anzahl;
      const arbeitsstunden = einstellungen?.arbeitsstunden_pro_tag || fallbackSettings.arbeitsstunden_pro_tag;
      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const arbeitszeit_pro_mitarbeiter = arbeitsstunden * 60;

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
        const verfuegbareMitarbeiter = Math.max(mitarbeiter - urlaub - krank, 0);
        const arbeitszeit_pro_tag = Math.max(verfuegbareMitarbeiter * arbeitszeit_pro_mitarbeiter, 1);

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
          const neueBelegung = aktuellBelegt + geschaetzteZeit + zusaetzlichePufferzeit;
          
          const aktuelleAuslastung = (aktuellBelegt / arbeitszeit_pro_tag) * 100;
          const neueAuslastung = (neueBelegung / arbeitszeit_pro_tag) * 100;

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
            verfuegbar_minuten: arbeitszeit_pro_tag,
            geschaetzte_zeit: geschaetzteZeit,
            einstellungen: {
              mitarbeiter_anzahl: mitarbeiter,
              arbeitsstunden_pro_tag: arbeitsstunden,
              pufferzeit_minuten: pufferzeit,
              verfuegbare_mitarbeiter: verfuegbareMitarbeiter
            }
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
    const fallbackSettings = { mitarbeiter_anzahl: 1, arbeitsstunden_pro_tag: 8, pufferzeit_minuten: 15 };

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const mitarbeiter = einstellungen?.mitarbeiter_anzahl || fallbackSettings.mitarbeiter_anzahl;
      const arbeitsstunden = einstellungen?.arbeitsstunden_pro_tag || fallbackSettings.arbeitsstunden_pro_tag;
      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const arbeitszeit_pro_mitarbeiter = arbeitsstunden * 60;

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
        const verfuegbareMitarbeiter = Math.max(mitarbeiter - urlaub - krank, 0);
        const arbeitszeit_pro_tag = Math.max(verfuegbareMitarbeiter * arbeitszeit_pro_mitarbeiter, 1);

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
          const neueBelegung = aktuellBelegt + geschaetzte_zeit + zusaetzlichePufferzeit;
          const neueAuslastung = (neueBelegung / arbeitszeit_pro_tag) * 100;

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
            verfuegbar_minuten: arbeitszeit_pro_tag,
            belegt_minuten: neueBelegung
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

    const fallbackSettings = { mitarbeiter_anzahl: 1, arbeitsstunden_pro_tag: 8, pufferzeit_minuten: 15 };

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const mitarbeiter = einstellungen?.mitarbeiter_anzahl || fallbackSettings.mitarbeiter_anzahl;
      const arbeitsstunden = einstellungen?.arbeitsstunden_pro_tag || fallbackSettings.arbeitsstunden_pro_tag;
      const pufferzeit = einstellungen?.pufferzeit_minuten || fallbackSettings.pufferzeit_minuten;
      const arbeitszeit_pro_mitarbeiter = arbeitsstunden * 60;

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
        const verfuegbareMitarbeiter = Math.max(mitarbeiter - urlaub - krank, 0);
        const arbeitszeit_pro_tag = Math.max(verfuegbareMitarbeiter * arbeitszeit_pro_mitarbeiter, 1);

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

          // Füge Pufferzeiten hinzu
          const pufferZeitGesamt = Math.max((aktiveTermine - 1) * pufferzeit, 0);
          aktuelleBelegung += pufferZeitGesamt;

          // Berechne verfügbare Kapazität
          const verfuegbar = arbeitszeit_pro_tag - aktuelleBelegung;
          const benoetigteZeit = geschaetzteZeit + (aktiveTermine > 0 ? pufferzeit : 0);

          // Prüfe ob am gewünschten Datum Platz ist
          const vorschlaege = [];
          if (verfuegbar >= benoetigteZeit) {
            vorschlaege.push({
              datum: datum,
              verfuegbar_minuten: verfuegbar,
              auslastung_nach_termin: Math.round(((aktuelleBelegung + benoetigteZeit) / arbeitszeit_pro_tag) * 100),
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
              const altVerfuegbareMitarbeiter = Math.max(mitarbeiter - altUrlaub - altKrank, 0);
              const altArbeitszeit_pro_tag = Math.max(altVerfuegbareMitarbeiter * arbeitszeit_pro_mitarbeiter, 1);

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
                altBelegung += altPufferZeitGesamt;

                const altVerfuegbar = altArbeitszeit_pro_tag - altBelegung;
                const altBenoetigteZeit = geschaetzteZeit + (altAktiveTermine > 0 ? pufferzeit : 0);

                if (altVerfuegbar >= altBenoetigteZeit && vorschlaege.length < maxAlternativen + 1) {
                  vorschlaege.push({
                    datum: altDatum,
                    verfuegbar_minuten: altVerfuegbar,
                    auslastung_nach_termin: Math.round(((altBelegung + altBenoetigteZeit) / altArbeitszeit_pro_tag) * 100),
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
  }
}

module.exports = TermineController;
