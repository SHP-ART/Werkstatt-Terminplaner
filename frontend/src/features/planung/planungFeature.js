export function installPlanungFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    bindPlanungEventListeners() {
      const dragDropDatum = document.getElementById('auslastungDragDropDatum');
      this.bindEventListenerOnce(dragDropDatum, 'change', () => {
        this.updatePlanungWocheInfo();
        this.loadAuslastungDragDrop();
      }, 'PlanungDatumChange');

      const zeitstempelungDatum = document.getElementById('zeitstempelungDatum');
      this.bindEventListenerOnce(zeitstempelungDatum, 'change', () => this.loadZeitstempelung(), 'ZeitstempelungDatumChange');

      const ztPrev = document.getElementById('zeitstempelungPrevTag');
      this.bindEventListenerOnce(ztPrev, 'click', () => {
        const inp = document.getElementById('zeitstempelungDatum');
        if (!inp) return;
        const d = new Date(inp.value + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        inp.value = this.formatDateLocal(d);
        this.loadZeitstempelung();
      }, 'ZeitstempelungPrevTag');

      const ztNext = document.getElementById('zeitstempelungNextTag');
      this.bindEventListenerOnce(ztNext, 'click', () => {
        const inp = document.getElementById('zeitstempelungDatum');
        if (!inp) return;
        const d = new Date(inp.value + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        inp.value = this.formatDateLocal(d);
        this.loadZeitstempelung();
      }, 'ZeitstempelungNextTag');

      const ztHeute = document.getElementById('zeitstempelungHeuteBtn');
      this.bindEventListenerOnce(ztHeute, 'click', () => {
        const inp = document.getElementById('zeitstempelungDatum');
        if (!inp) return;
        inp.value = this.formatDateLocal(this.getToday());
        this.loadZeitstempelung();
      }, 'ZeitstempelungHeute');

      // Zeitkonto: Range-Buttons + Datumsfelder
      this.bindEventListenerOnce(document.getElementById('zeitkontoRangeButtons'), 'click', (e) => {
        const btn = e.target.closest('.zeitkonto-range-btn');
        if (!btn) return;
        const range = btn.dataset.range;
        const heute = new Date();
        let von, bis;
        if (range === 'woche') {
          const tag = heute.getDay() || 7;
          von = new Date(heute); von.setDate(heute.getDate() - tag + 1);
          bis = new Date(heute); bis.setDate(heute.getDate() - tag + 7);
        } else if (range === 'monat') {
          von = new Date(heute.getFullYear(), heute.getMonth(), 1);
          bis = new Date(heute.getFullYear(), heute.getMonth() + 1, 0);
        } else {
          const q = Math.floor(heute.getMonth() / 3);
          von = new Date(heute.getFullYear(), q * 3, 1);
          bis = new Date(heute.getFullYear(), q * 3 + 3, 0);
        }
        const fmt = d => d.toISOString().substring(0, 10);
        document.getElementById('zeitkontoVon').value = fmt(von);
        document.getElementById('zeitkontoBis').value = fmt(bis);
        document.querySelectorAll('.zeitkonto-range-btn').forEach(b => {
          b.className = b.dataset.range === range
            ? 'btn btn-sm btn-primary zeitkonto-range-btn'
            : 'btn btn-sm btn-outline-primary zeitkonto-range-btn';
        });
        this.loadZeitkonto();
      }, 'ZeitkontoRangeClick');

      // Initiale Monatswerte setzen
      const heute2 = new Date();
      const vonEl = document.getElementById('zeitkontoVon');
      const bisEl = document.getElementById('zeitkontoBis');
      if (vonEl && bisEl && !vonEl.value) {
        const ersterTag = new Date(heute2.getFullYear(), heute2.getMonth(), 1);
        const letzterTag = new Date(heute2.getFullYear(), heute2.getMonth() + 1, 0);
        vonEl.value = ersterTag.toISOString().substring(0, 10);
        bisEl.value = letzterTag.toISOString().substring(0, 10);
      }

      // Sub-Tab-Umschaltung
      const subTabStempel = document.getElementById('ztSubTabStempel');
      const subTabZeitkonto = document.getElementById('ztSubTabZeitkonto');
      const subTabPausen = document.getElementById('ztSubTabPausen');
      const subTabKorrekturen = document.getElementById('ztSubTabKorrekturen');
      const switchZtSubTab = (active) => {
        const panels = {
          stempel: document.getElementById('ztPanelStempel'),
          zeitkonto: document.getElementById('ztPanelZeitkonto'),
          pausen: document.getElementById('ztPanelPausen'),
          korrekturen: document.getElementById('ztPanelKorrekturen'),
        };
        const tabs = { stempel: subTabStempel, zeitkonto: subTabZeitkonto, pausen: subTabPausen, korrekturen: subTabKorrekturen };
        Object.entries(panels).forEach(([k, el]) => { if (el) el.style.display = (k === active) ? '' : 'none'; });
        Object.entries(tabs).forEach(([k, el]) => {
          if (!el) return;
          el.style.borderBottomColor = (k === active) ? '#3b82f6' : 'transparent';
          el.style.color = (k === active) ? '#3b82f6' : '#666';
        });
        if (active === 'zeitkonto') {
          const vonEl2 = document.getElementById('zeitkontoVon');
          const bisEl2 = document.getElementById('zeitkontoBis');
          if (vonEl2 && !vonEl2.value) {
            const h = new Date();
            vonEl2.value = new Date(h.getFullYear(), h.getMonth(), 1).toISOString().substring(0, 10);
            bisEl2.value = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().substring(0, 10);
          }
          this.loadZeitkonto();
        } else if (active === 'pausen') {
          const vonEl3 = document.getElementById('pausenReportVon');
          const bisEl3 = document.getElementById('pausenReportBis');
          if (vonEl3 && !vonEl3.value) {
            const h = new Date();
            vonEl3.value = new Date(h.getFullYear(), h.getMonth(), 1).toISOString().substring(0, 10);
            bisEl3.value = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().substring(0, 10);
          }
          this.loadPausenReport();
        } else if (active === 'korrekturen') {
          const vonEl4 = document.getElementById('korrekturenVon');
          const bisEl4 = document.getElementById('korrekturenBis');
          if (vonEl4 && !vonEl4.value) {
            const h = new Date();
            vonEl4.value = new Date(h.getFullYear(), h.getMonth(), 1).toISOString().substring(0, 10);
            bisEl4.value = new Date(h.getFullYear(), h.getMonth() + 1, 0).toISOString().substring(0, 10);
          }
          this.loadKorrekturen();
        }
      };
      this.bindEventListenerOnce(subTabStempel, 'click', () => switchZtSubTab('stempel'), 'ZtSubTabStempel');
      this.bindEventListenerOnce(subTabZeitkonto, 'click', () => switchZtSubTab('zeitkonto'), 'ZtSubTabZeitkonto');
      this.bindEventListenerOnce(subTabPausen, 'click', () => switchZtSubTab('pausen'), 'ZtSubTabPausen');
      this.bindEventListenerOnce(subTabKorrekturen, 'click', () => switchZtSubTab('korrekturen'), 'ZtSubTabKorrekturen');

      const planungPrevTag = document.getElementById('planungPrevTag');
      const planungNextTag = document.getElementById('planungNextTag');
      const planungPrevWoche = document.getElementById('planungPrevWoche');
      const planungNextWoche = document.getElementById('planungNextWoche');
      const planungHeuteBtn = document.getElementById('planungHeuteBtn');

      this.bindEventListenerOnce(planungPrevTag, 'click', () => this.navigatePlanung(-1, 'day'), 'PlanungPrevTag');
      this.bindEventListenerOnce(planungNextTag, 'click', () => this.navigatePlanung(1, 'day'), 'PlanungNextTag');
      this.bindEventListenerOnce(planungPrevWoche, 'click', () => this.navigatePlanung(-7, 'week'), 'PlanungPrevWoche');
      this.bindEventListenerOnce(planungNextWoche, 'click', () => this.navigatePlanung(7, 'week'), 'PlanungNextWoche');
      this.bindEventListenerOnce(planungHeuteBtn, 'click', () => this.goToPlanungHeute(), 'PlanungHeute');
    },

    updatePlanungWocheInfo() {
      const datumInput = document.getElementById('auslastungDragDropDatum');
      const wocheInfoEl = document.getElementById('planungWocheInfo');
      const aktuellerTagEl = document.getElementById('planungAktuellerTag');
      if (!datumInput || !datumInput.value || !wocheInfoEl) return;

      const date = new Date(datumInput.value);
      // Berechne Montag der Woche
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diff);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      const formatDate = (d) => {
        const wochentag = d.toLocaleDateString('de-DE', { weekday: 'short' });
        const datum = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
        return `${wochentag} ${datum}`;
      };

      // Kalenderwoche berechnen
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

      wocheInfoEl.textContent = `KW ${weekNumber}: ${formatDate(monday)} - ${formatDate(friday)}`;

      // Aktueller Tag Badge
      if (aktuellerTagEl) {
        const wochentagLang = date.toLocaleDateString('de-DE', { weekday: 'long' });
        const datumFormatiert = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        aktuellerTagEl.innerHTML = `📅 ${wochentagLang} <span class="tag-datum">${datumFormatiert}</span>`;
      }
    },

    navigatePlanung(amount, unit) {
      const datumInput = document.getElementById('auslastungDragDropDatum');
      if (!datumInput || !datumInput.value) return;
      
      const date = new Date(datumInput.value);
      date.setDate(date.getDate() + amount);
      datumInput.value = this.formatDateLocal(date);
      
      this.updatePlanungWocheInfo();
      this.loadAuslastungDragDrop();
    },

    goToPlanungHeute() {
      const datumInput = document.getElementById('auslastungDragDropDatum');
      if (!datumInput) return;
      
      datumInput.value = this.formatDateLocal(new Date());
      this.updatePlanungWocheInfo();
      this.loadAuslastungDragDrop();
    },

    async loadZeitleiste(datum) {
      const body = document.getElementById('zeitleisteBody');
      if (!body) return;

      body.innerHTML = '<div class="zeitleiste-loading"><span>⏳</span> Lade Zeitleiste...</div>';

      try {
        // Lade alle Termine für dieses Datum (inkl. Arbeitspausen-Map)
        const terminResponse = await TermineService.getAllMitPausen(datum);
        const termine = Array.isArray(terminResponse) ? terminResponse : (terminResponse.termine || []);
        const arbeitspausenMap = terminResponse.arbeitspausenMap || {};
        // Arbeitspausen direkt in Termin-Objekte einbetten
        for (const t of termine) { t.arbeitspausen = arbeitspausenMap[t.id] || []; }
        
        // Befülle termineById-Cache für Details-Popup
        for (const termin of termine) {
          this.termineById[termin.id] = termin;
        }
        
        // Lade Mitarbeiter, Lehrlinge, Einstellungen und Auslastung (für Abwesenheits-Check)
        const [mitarbeiter, lehrlinge, einstellungen, auslastungData] = await Promise.all([
          MitarbeiterService.getAktive(),
          LehrlingeService.getAktive(),
          EinstellungenService.getWerkstatt(),
          AuslastungService.getByDatum(datum)
        ]);

        // Mittagspause-Dauer aus Einstellungen (Standard 30 Min)
        const mittagspauseDauer = einstellungen?.mittagspause_minuten || 30;
        // Nebenzeit-Prozent aus Einstellungen (Standard 0%)
        const nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;
        
        // Abwesenheits-Maps erstellen
        const abwesendeMitarbeiter = new Set();
        const abwesendeLehrlinge = new Set();
        if (auslastungData && auslastungData.mitarbeiter_auslastung) {
          auslastungData.mitarbeiter_auslastung.forEach(ma => {
            if (ma.ist_abwesend === true) abwesendeMitarbeiter.add(ma.mitarbeiter_id);
          });
        }
        if (auslastungData && auslastungData.lehrlinge_auslastung) {
          auslastungData.lehrlinge_auslastung.forEach(la => {
            if (la.ist_abwesend === true) abwesendeLehrlinge.add(la.lehrling_id);
          });
        }

        // Erstelle Arbeiten-Map nach Mitarbeiter/Lehrling
        // Gruppiere nach Termin, nicht nach einzelner Arbeit
        const arbeitenMap = new Map();
        const ohneZuordnung = [];

        // Verarbeite alle Termine
        for (const termin of termine) {
          let arbeitenListe = this.parseArbeiten(termin.arbeit || '');
          let details = {};
          
          if (termin.arbeitszeiten_details) {
            try {
              details = typeof termin.arbeitszeiten_details === 'string' 
                ? JSON.parse(termin.arbeitszeiten_details) 
                : termin.arbeitszeiten_details;
            } catch (e) {}
          }

          // Effektive tatsächliche Zeit: nur für laufende/abgeschlossene Termine, nie für geplante
          let effectiveTatsaechlicheZeit = (['in_arbeit', 'abgeschlossen'].includes(termin.status)) ? (termin.tatsaechliche_zeit || 0) : 0;
          if (!effectiveTatsaechlicheZeit && termin.status === 'abgeschlossen' && termin.fertigstellung_zeit) {
            const startStr = termin.startzeit || termin.bring_zeit;
            if (startStr) {
              const fertigLokal = new Date(termin.fertigstellung_zeit);
              const fertigMin = fertigLokal.getHours() * 60 + fertigLokal.getMinutes();
              const [sh, sm] = startStr.split(':').map(Number);
              const diffMin = fertigMin - (sh * 60 + sm);
              if (diffMin > 5 && diffMin < (termin.geschaetzte_zeit || 60) * 3) {
                effectiveTatsaechlicheZeit = diffMin;
              }
            }
          }
          if (!effectiveTatsaechlicheZeit && termin.status === 'abgeschlossen' && termin.fertigstellung_zeit) {
            const startStr = termin.startzeit || termin.bring_zeit;
            if (startStr) {
              const fertigLokal = new Date(termin.fertigstellung_zeit);
              const fertigMin = fertigLokal.getHours() * 60 + fertigLokal.getMinutes();
              const [sh, sm] = startStr.split(':').map(Number);
              const diffMin = fertigMin - (sh * 60 + sm);
              if (diffMin > 5 && diffMin < (termin.geschaetzte_zeit || 60) * 3) {
                effectiveTatsaechlicheZeit = diffMin;
              }
            }
          }

          // Schwebende Termine immer in "Nicht zugeordnet" anzeigen
          const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;

          // Wenn keine Arbeiten, aber Termin existiert, als Platzhalter hinzufügen
          if (arbeitenListe.length === 0) {
            arbeitenListe = [termin.kennzeichen || 'Ohne Beschreibung'];
          }

          // Bestimme Mitarbeiter/Lehrling Zuordnung (aus _gesamt_mitarbeiter_id) - als Fallback
          let defaultZuordnungsTyp = null;
          let defaultMitarbeiterId = termin.mitarbeiter_id;
          let defaultLehrlingId = null;
          
          if (details._gesamt_mitarbeiter_id) {
            defaultZuordnungsTyp = details._gesamt_mitarbeiter_id.type;
            if (defaultZuordnungsTyp === 'lehrling') {
              defaultLehrlingId = details._gesamt_mitarbeiter_id.id;
              defaultMitarbeiterId = null;
            } else {
              defaultMitarbeiterId = details._gesamt_mitarbeiter_id.id;
            }
          }
          
          // Bei schwebenden Terminen keine Zuordnung
          if (istSchwebend) {
            defaultZuordnungsTyp = null;
            defaultMitarbeiterId = null;
            defaultLehrlingId = null;
          }

          // Startzeit des Termins (Priorität: termin.startzeit, dann _startzeit aus details, dann erste Arbeit)
          let terminStartzeit = termin.startzeit || details._startzeit || null;
          if (!terminStartzeit) {
            for (const arbeit of arbeitenListe) {
              const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : {};
              if (arbeitDetails.startzeit && arbeitDetails.startzeit.trim() !== '') {
                terminStartzeit = arbeitDetails.startzeit;
                break;
              }
            }
          }

          // Automatisch erkennen ob dieser Termin getrennt angezeigt werden muss
          // (unterschiedliche Mitarbeiter ODER unterschiedliche Startzeiten für verschiedene Arbeiten)
          let mussGetrenntAnzeigen = false;
          
          if (arbeitenListe.length > 1) {
            // Sammle alle Mitarbeiter-IDs und Startzeiten der Arbeiten
            const mitarbeiterSet = new Set();
            const startzeitenSet = new Set();
            
            for (const arbeit of arbeitenListe) {
              const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : {};
              
              // Mitarbeiter dieser Arbeit bestimmen
              let arbeitMitarbeiterKey = 'default';
              if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
                arbeitMitarbeiterKey = `l_${arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id}`;
              } else if (arbeitDetails.mitarbeiter_id) {
                arbeitMitarbeiterKey = `m_${arbeitDetails.mitarbeiter_id}`;
              } else if (defaultZuordnungsTyp === 'lehrling' && defaultLehrlingId) {
                arbeitMitarbeiterKey = `l_${defaultLehrlingId}`;
              } else if (defaultMitarbeiterId) {
                arbeitMitarbeiterKey = `m_${defaultMitarbeiterId}`;
              }
              mitarbeiterSet.add(arbeitMitarbeiterKey);
              
              // Startzeit dieser Arbeit
              if (arbeitDetails.startzeit) {
                startzeitenSet.add(arbeitDetails.startzeit);
              }
            }
            
            // Getrennt anzeigen NUR wenn ECHTE verschiedene Mitarbeiter/Lehrlinge zugeordnet sind.
            // 'default' (= keine explizite Zuweisung) erbt den Kontext-Mitarbeiter und zählt nicht als "anders".
            // Unterschiedliche Startzeiten alleine lösen KEINE getrennte Ansicht aus – sequenzielle
            // Arbeiten desselben Mitarbeiters haben immer verschiedene Startzeiten.
            const realMitarbeiterKeys = [...mitarbeiterSet].filter(k => k !== 'default');
            mussGetrenntAnzeigen = new Set(realMitarbeiterKeys).size > 1;
          }
          
          if (mussGetrenntAnzeigen) {
            // === GETRENNTE ANSICHT: Separate Einträge für jede Arbeit ===
            let laufendeStartzeit = terminStartzeit;
            const arbeitEntries = [];

            // Berechne Gesamtzeit aus den einzelnen Arbeitseinträgen als korrekten Nenner
            // (termin.geschaetzte_zeit kann veraltet sein wenn nachträglich Arbeiten hinzugefügt wurden)
            let gesamtZeitAusDetails = 0;
            for (const _a of arbeitenListe) {
              const _ad = typeof details[_a] === 'object' ? details[_a] : { zeit: typeof details[_a] === 'number' ? details[_a] : 0 };
              gesamtZeitAusDetails += _ad.zeit || (termin.geschaetzte_zeit / arbeitenListe.length) || 0;
            }
            const gesamtZeitFuerAnteil = gesamtZeitAusDetails > 0 ? gesamtZeitAusDetails : (termin.geschaetzte_zeit || 60);
            
            for (let i = 0; i < arbeitenListe.length; i++) {
              const arbeit = arbeitenListe[i];
              const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : { zeit: details[arbeit] || 0 };
              let zeitMinuten = arbeitDetails.zeit || (termin.geschaetzte_zeit / arbeitenListe.length) || 60;
              
              // Nebenzeit-Aufschlag hinzufügen
              if (nebenzeitProzent > 0) {
                zeitMinuten = Math.round(zeitMinuten * (1 + nebenzeitProzent / 100));
              }
              
              // Aufgabenbewältigung für Lehrlinge hinzufügen (z.B. 150% = braucht 50% länger)
              // Prüfe ob diese Arbeit einem Lehrling zugeordnet ist
              let arbeitLehrlingIdFuerBerechnung = null;
              if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
                arbeitLehrlingIdFuerBerechnung = arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id;
              } else if (!arbeitDetails.mitarbeiter_id && details._gesamt_mitarbeiter_id?.type === 'lehrling') {
                arbeitLehrlingIdFuerBerechnung = details._gesamt_mitarbeiter_id.id;
              } else if (!arbeitDetails.mitarbeiter_id && defaultZuordnungsTyp === 'lehrling' && defaultLehrlingId) {
                arbeitLehrlingIdFuerBerechnung = defaultLehrlingId;
              }
              
              if (arbeitLehrlingIdFuerBerechnung) {
                const lehrling = (lehrlinge || []).find(l => l.id === arbeitLehrlingIdFuerBerechnung);
                if (lehrling && lehrling.aufgabenbewaeltigung_prozent && lehrling.aufgabenbewaeltigung_prozent !== 100) {
                  zeitMinuten = Math.round(zeitMinuten * (lehrling.aufgabenbewaeltigung_prozent / 100));
                }
              }
              
              // Feature 10: Bei abgeschlossenen Terminen die ANGEZEIGTE Zeit auf tatsächliche Zeit kürzen
              let anzeigeZeitMinuten = zeitMinuten;
              if (termin.status === 'abgeschlossen' && effectiveTatsaechlicheZeit > 0) {
                if (arbeitenListe.length > 1) {
                  // Korrekte Anteilsberechnung: Summe aus arbeitszeiten_details als Nenner verwenden,
                  // nicht das ggf. veraltete termin.geschaetzte_zeit
                  const anteil = zeitMinuten / gesamtZeitFuerAnteil;
                  anzeigeZeitMinuten = Math.round(effectiveTatsaechlicheZeit * anteil);
                } else {
                  anzeigeZeitMinuten = effectiveTatsaechlicheZeit;
                }
              }
              
              // Mitarbeiter/Lehrling für DIESE Arbeit (individuelle Zuordnung hat Vorrang)
              let arbeitZuordnungsTyp = defaultZuordnungsTyp;
              let arbeitMitarbeiterId = defaultMitarbeiterId;
              let arbeitLehrlingId = defaultLehrlingId;
              
              if (!istSchwebend && typeof arbeitDetails === 'object') {
                if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
                  arbeitZuordnungsTyp = 'lehrling';
                  arbeitLehrlingId = arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id;
                  arbeitMitarbeiterId = null;
                } else if (arbeitDetails.mitarbeiter_id) {
                  arbeitZuordnungsTyp = arbeitDetails.type || 'mitarbeiter';
                  arbeitMitarbeiterId = arbeitDetails.mitarbeiter_id;
                  arbeitLehrlingId = null;
                }
              }
              
              // Startzeit für diese Arbeit bestimmen
              let arbeitStartzeit = arbeitDetails.startzeit || laufendeStartzeit;
              
              // Falls keine Startzeit und vorherige Arbeit existiert, nach vorheriger Arbeit starten
              if (!arbeitStartzeit && i > 0 && arbeitEntries[i-1]) {
                const prev = arbeitEntries[i-1];
                if (prev.startzeit) {
                  const [h, m] = prev.startzeit.split(':').map(Number);
                  const prevEndMinuten = h * 60 + m + prev.zeitMinuten;
                  const newH = Math.floor(prevEndMinuten / 60);
                  const newM = prevEndMinuten % 60;
                  arbeitStartzeit = `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
                }
              }

              // Zähle Erweiterungen zu diesem Termin
              const erweiterungen = termine.filter(t => t.erweiterung_von_id === termin.id && !t.ist_geloescht);
              const erweiterungAnzahl = erweiterungen.length;
              
              // Bestimme die endzeit_berechnet
              let endzeitFuerAnzeige = null;
              if (erweiterungAnzahl > 0) {
                endzeitFuerAnzeige = null;
              } else if (termin.erweiterung_von_id) {
                const hauptTermin = termine.find(t => t.id === termin.erweiterung_von_id);
                if (hauptTermin && hauptTermin.endzeit_berechnet) {
                  endzeitFuerAnzeige = hauptTermin.endzeit_berechnet;
                }
              } else {
                endzeitFuerAnzeige = termin.endzeit_berechnet || null;
              }
              
              const terminEntry = {
                terminId: termin.id,
                terminNr: termin.termin_nr,
                kunde: termin.kunde_name,
                kennzeichen: termin.kennzeichen,
                arbeit: arbeit,
                arbeitenListe: arbeitenListe,
                arbeitIndex: i,
                arbeitenAnzahl: arbeitenListe.length,
                zeitMinuten: zeitMinuten,
                anzeigeZeitMinuten: anzeigeZeitMinuten,
                startzeit: arbeitStartzeit,
                endzeitBerechnet: endzeitFuerAnzeige,
                abholungZeit: termin.abholung_zeit || null,
                status: termin.status || 'geplant',
                istIntern: !termin.kennzeichen || termin.abholung_details === 'Interner Termin',
                interneAuftragsnummer: termin.interne_auftragsnummer || '',
                istSchwebend: istSchwebend,
                istErweiterung: termin.ist_erweiterung === 1 || termin.ist_erweiterung === true,
                erweiterungAnzahl: erweiterungAnzahl,
                erweiterungVonId: termin.erweiterung_von_id || null,
                zuordnungsTyp: arbeitZuordnungsTyp,
                mitarbeiterId: arbeitMitarbeiterId,
                lehrlingId: arbeitLehrlingId,
                istNacharbeit: termin.muss_bearbeitet_werden === 1 || termin.muss_bearbeitet_werden === '1',
                nacharbeitStartZeit: termin.nacharbeit_start_zeit || null,
                arbeitspausen: i === 0 ? (termin.arbeitspausen || []) : []
              };

              // Nacharbeit: bei der ersten Arbeit Startzeit + Dauer überschreiben
              if (i === 0 && terminEntry.istNacharbeit && terminEntry.nacharbeitStartZeit) {
                terminEntry.startzeit = terminEntry.nacharbeitStartZeit;
                if (termin.status === 'abgeschlossen' && effectiveTatsaechlicheZeit > 0) {
                  terminEntry.anzeigeZeitMinuten = Math.round(
                    effectiveTatsaechlicheZeit * (zeitMinuten / (termin.geschaetzte_zeit || zeitMinuten))
                  );
                } else {
                  const jetztNa2 = new Date();
                  const [naH2, naM2] = terminEntry.nacharbeitStartZeit.split(':').map(Number);
                  const elapsed2 = jetztNa2.getHours() * 60 + jetztNa2.getMinutes() - (naH2 * 60 + naM2);
                  terminEntry.anzeigeZeitMinuten = Math.max(elapsed2, zeitMinuten);
                }
              }
              
              arbeitEntries.push(terminEntry);
              
              // Update laufende Startzeit für nächste Arbeit
              if (arbeitStartzeit) {
                const [h, m] = arbeitStartzeit.split(':').map(Number);
                const endMinuten = h * 60 + m + zeitMinuten;
                const newH = Math.floor(endMinuten / 60);
                const newM = endMinuten % 60;
                laufendeStartzeit = `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
              }
            }

            // Zuordnung zu Mitarbeiter oder Lehrling - pro Arbeit individuell
            for (const entry of arbeitEntries) {
              if (entry.zuordnungsTyp === 'lehrling' && entry.lehrlingId) {
                const key = `l_${entry.lehrlingId}`;
                if (!arbeitenMap.has(key)) {
                  arbeitenMap.set(key, { typ: 'lehrling', id: entry.lehrlingId, arbeiten: [] });
                }
                arbeitenMap.get(key).arbeiten.push(entry);
              } else if (entry.mitarbeiterId) {
                const key = `m_${entry.mitarbeiterId}`;
                if (!arbeitenMap.has(key)) {
                  arbeitenMap.set(key, { typ: 'mitarbeiter', id: entry.mitarbeiterId, arbeiten: [] });
                }
                arbeitenMap.get(key).arbeiten.push(entry);
              } else if (entry.status !== 'abgeschlossen' && entry.status !== 'storniert') {
                ohneZuordnung.push(entry);
              }
            }
            
          } else {
            // === ZUSAMMENGEFASSTE ANSICHT: Ein Eintrag pro Termin ===
            // Berechne Gesamtzeit und früheste Startzeit
            let gesamtZeitMinuten = 0;
            let gesamtAnzeigeZeitMinuten = 0;
            let fruehesteStartzeit = terminStartzeit;
            let arbeitenMitZeiten = [];
            // Merke ob mindestens eine Arbeit eine explizite zeit hat
            // (false = Gesamtzeit-Modus, alle Einzelzeiten auf 0 gelassen)
            let hatExpliziteEinzelzeiten = false;
            
            // Bestimme Mitarbeiter/Lehrling Zuordnung für den gesamten Termin (wird im Loop ggf. aktualisiert)
            let terminZuordnungsTyp = defaultZuordnungsTyp;
            let terminMitarbeiterId = defaultMitarbeiterId;
            let terminLehrlingId = defaultLehrlingId;
            
            for (let i = 0; i < arbeitenListe.length; i++) {
              const arbeit = arbeitenListe[i];
              const arbeitDetails = typeof details[arbeit] === 'object' ? details[arbeit] : { zeit: details[arbeit] || 0 };
              // Explizite zeit: Zahl in details ODER .zeit > 0 im Objekt
              const expliziteZeit = (typeof details[arbeit] === 'number' && details[arbeit] > 0)
                ? details[arbeit]
                : (arbeitDetails.zeit > 0 ? arbeitDetails.zeit : 0);
              if (expliziteZeit > 0) hatExpliziteEinzelzeiten = true;
              let zeitMinuten = expliziteZeit || (termin.geschaetzte_zeit / arbeitenListe.length) || 60;
              
              // Nebenzeit-Aufschlag hinzufügen (z.B. 20% = zeitMinuten * 1.2)
              if (nebenzeitProzent > 0) {
                zeitMinuten = Math.round(zeitMinuten * (1 + nebenzeitProzent / 100));
              }
              
              // Aufgabenbewältigung für Lehrlinge hinzufügen (z.B. 150% = braucht 50% länger)
              // Prüfe Zuordnung für diese Arbeit
              let arbeitLehrlingIdFuerBerechnung = null;
              if (typeof arbeitDetails === 'object') {
                if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
                  arbeitLehrlingIdFuerBerechnung = arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id;
                } else if (!arbeitDetails.mitarbeiter_id && details._gesamt_mitarbeiter_id?.type === 'lehrling') {
                  arbeitLehrlingIdFuerBerechnung = details._gesamt_mitarbeiter_id.id;
                } else if (!arbeitDetails.mitarbeiter_id && terminZuordnungsTyp === 'lehrling' && terminLehrlingId) {
                  arbeitLehrlingIdFuerBerechnung = terminLehrlingId;
                }
              }
              
              if (arbeitLehrlingIdFuerBerechnung) {
                const lehrling = (lehrlinge || []).find(l => l.id === arbeitLehrlingIdFuerBerechnung);
                if (lehrling && lehrling.aufgabenbewaeltigung_prozent && lehrling.aufgabenbewaeltigung_prozent !== 100) {
                  zeitMinuten = Math.round(zeitMinuten * (lehrling.aufgabenbewaeltigung_prozent / 100));
                }
              }
              
              gesamtZeitMinuten += zeitMinuten;
              // Anzeigezeit (wird nach dem Loop für abgeschlossene Termine korrigiert)
              gesamtAnzeigeZeitMinuten += zeitMinuten;
              
              // Startzeit für diese Arbeit bestimmen (für Anzeige im Tooltip)
              let arbeitStartzeit = arbeitDetails.startzeit || null;
              if (arbeitStartzeit && (!fruehesteStartzeit || arbeitStartzeit < fruehesteStartzeit)) {
                fruehesteStartzeit = arbeitStartzeit;
              }
              
              arbeitenMitZeiten.push({
                name: arbeit,
                zeit: zeitMinuten,
                startzeit: arbeitStartzeit
              });
              
              // Prüfe ob diese Arbeit eine Mitarbeiter-Zuordnung hat (erste gefundene gewinnt)
              if (!istSchwebend && typeof arbeitDetails === 'object') {
                if (arbeitDetails.type === 'lehrling' && (arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id)) {
                  if (!terminZuordnungsTyp || terminZuordnungsTyp === defaultZuordnungsTyp) {
                    terminZuordnungsTyp = 'lehrling';
                    terminLehrlingId = arbeitDetails.lehrling_id || arbeitDetails.mitarbeiter_id;
                    terminMitarbeiterId = null;
                  }
                } else if (arbeitDetails.mitarbeiter_id) {
                  if (!terminMitarbeiterId || terminMitarbeiterId === defaultMitarbeiterId) {
                    terminZuordnungsTyp = arbeitDetails.type || 'mitarbeiter';
                    terminMitarbeiterId = arbeitDetails.mitarbeiter_id;
                  }
                }
              }
            }
            
            // Zähle Erweiterungen zu diesem Termin
            const erweiterungen = termine.filter(t => t.erweiterung_von_id === termin.id && !t.ist_geloescht);
            const erweiterungAnzahl = erweiterungen.length;

            // Gesamtzeit-Modus: Keine Einzelzeiten gespeichert → _dauer_override oder tatsaechliche_zeit nutzen.
            // Passiert wenn der Nutzer im Arbeitszeiten-Modal alle Einzelzeiten auf 0 lässt
            // und nur die Gesamtzeit eingibt. In diesem Fall ist gesamtZeitMinuten = geschaetzte_zeit/n × n
            // was komplett falsch sein kann.
            if (!hatExpliziteEinzelzeiten) {
              const duerOverride = parseInt(details._dauer_override) || 0;
              const verwendeteGesamt = duerOverride > 0
                ? duerOverride
                : (effectiveTatsaechlicheZeit > 0 ? effectiveTatsaechlicheZeit : (termin.geschaetzte_zeit || gesamtZeitMinuten));
              gesamtZeitMinuten = verwendeteGesamt;
              gesamtAnzeigeZeitMinuten = verwendeteGesamt;
            }

            // Abgeschlossene Termine: tatsächliche Zeit hat höchste Priorität
            if (termin.status === 'abgeschlossen' && effectiveTatsaechlicheZeit > 0) {
              gesamtAnzeigeZeitMinuten = effectiveTatsaechlicheZeit;
            }
            
            // Bestimme die endzeit_berechnet
            let endzeitFuerAnzeige = null;
            if (erweiterungAnzahl > 0) {
              endzeitFuerAnzeige = null;
            } else if (termin.erweiterung_von_id) {
              const hauptTermin = termine.find(t => t.id === termin.erweiterung_von_id);
              if (hauptTermin && hauptTermin.endzeit_berechnet) {
                endzeitFuerAnzeige = hauptTermin.endzeit_berechnet;
              }
            } else {
              endzeitFuerAnzeige = termin.endzeit_berechnet || null;
            }
            
            // Erstelle einen zusammengefassten Termin-Entry
            const terminEntry = {
              terminId: termin.id,
              terminNr: termin.termin_nr,
              kunde: termin.kunde_name,
              kennzeichen: termin.kennzeichen,
              arbeit: arbeitenListe.join(' || '), // Alle Arbeiten mit || getrennt
              arbeitenListe: arbeitenListe,
              arbeitenMitZeiten: arbeitenMitZeiten, // Detaillierte Liste für Tooltip
              arbeitIndex: 0,
              arbeitenAnzahl: arbeitenListe.length,
              zeitMinuten: gesamtZeitMinuten,
              anzeigeZeitMinuten: gesamtAnzeigeZeitMinuten,
              startzeit: fruehesteStartzeit,
              endzeitBerechnet: endzeitFuerAnzeige,
              bringZeit: termin.bring_zeit || null,
              abholungZeit: termin.abholung_zeit || null,
              status: termin.status || 'geplant',
              istIntern: !termin.kennzeichen || termin.abholung_details === 'Interner Termin',
              interneAuftragsnummer: termin.interne_auftragsnummer || '',
              istSchwebend: istSchwebend,
              istErweiterung: termin.ist_erweiterung === 1 || termin.ist_erweiterung === true,
              erweiterungAnzahl: erweiterungAnzahl,
              erweiterungVonId: termin.erweiterung_von_id || null,
              zuordnungsTyp: terminZuordnungsTyp,
              mitarbeiterId: terminMitarbeiterId,
              lehrlingId: terminLehrlingId,
              istNacharbeit: termin.muss_bearbeitet_werden === 1 || termin.muss_bearbeitet_werden === '1',
              nacharbeitStartZeit: termin.nacharbeit_start_zeit || null,
              arbeitspausen: termin.arbeitspausen || []
            };

            // Nacharbeit: Startzeit und angezeigte Dauer überschreiben
            if (terminEntry.istNacharbeit && terminEntry.nacharbeitStartZeit) {
              terminEntry.startzeit = terminEntry.nacharbeitStartZeit;
              if (termin.status === 'abgeschlossen' && effectiveTatsaechlicheZeit > 0) {
                terminEntry.anzeigeZeitMinuten = effectiveTatsaechlicheZeit;
              } else {
                // Noch laufend: Balken bis "jetzt" (nur für heute sinnvoll)
                const jetztNa = new Date();
                const [naH, naM] = terminEntry.nacharbeitStartZeit.split(':').map(Number);
                const elapsed = jetztNa.getHours() * 60 + jetztNa.getMinutes() - (naH * 60 + naM);
                terminEntry.anzeigeZeitMinuten = Math.max(elapsed, termin.geschaetzte_zeit || 60);
              }
            }

            // Zuordnung zu Mitarbeiter oder Lehrling
            if (terminEntry.zuordnungsTyp === 'lehrling' && terminEntry.lehrlingId) {
              const key = `l_${terminEntry.lehrlingId}`;
              if (!arbeitenMap.has(key)) {
                arbeitenMap.set(key, { typ: 'lehrling', id: terminEntry.lehrlingId, arbeiten: [] });
              }
              arbeitenMap.get(key).arbeiten.push(terminEntry);
            } else if (terminEntry.mitarbeiterId) {
              const key = `m_${terminEntry.mitarbeiterId}`;
              if (!arbeitenMap.has(key)) {
                arbeitenMap.set(key, { typ: 'mitarbeiter', id: terminEntry.mitarbeiterId, arbeiten: [] });
              }
              arbeitenMap.get(key).arbeiten.push(terminEntry);
            } else if (terminEntry.status !== 'abgeschlossen' && terminEntry.status !== 'storniert') {
              ohneZuordnung.push(terminEntry);
            }
          }
        }

        // Rendere die Zeitleiste mit Abwesenheitsinformation
        // Vortags-Überträge: nicht-abgeschlossene, nicht-zugeordnete Termine vom Vortag
        const [vy, vm, vd] = datum.split('-').map(Number);
        const vortagDate = new Date(vy, vm - 1, vd - 1);
        const vortagDatum = `${vortagDate.getFullYear()}-${String(vortagDate.getMonth()+1).padStart(2,'0')}-${String(vortagDate.getDate()).padStart(2,'0')}`;
        const termineVortag = await TermineService.getAll(vortagDatum);
        for (const termin of termineVortag) {
          this.termineById[termin.id] = termin;
        }
        const istNichtZugeordnet = (t) => {
          if (t.status === 'abgeschlossen') return false;
          const schwebend = t.ist_schwebend === 1 || t.ist_schwebend === true;
          if (schwebend) return true;
          if (t.mitarbeiter_id) return false;
          if (t.arbeitszeiten_details) {
            try {
              const d = typeof t.arbeitszeiten_details === 'string' ? JSON.parse(t.arbeitszeiten_details) : t.arbeitszeiten_details;
              if (d._gesamt_mitarbeiter_id) return false;
              for (const k in d) { if (!k.startsWith('_') && typeof d[k] === 'object' && d[k].mitarbeiter_id) return false; }
            } catch(e) {}
          }
          return true;
        };
        const uebertraege = termineVortag.filter(istNichtZugeordnet);
        for (const termin of uebertraege) {
          // Als einfachen "Übertrag"-Block in ohneZuordnung eintragen
          const arbeitenListe = this.parseArbeiten(termin.arbeit || '') || [termin.kennzeichen || '?'];
          const zeitMin = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 60;
          const vortagLabel = vortagDate.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
          ohneZuordnung.push({
            terminId: termin.id,
            terminNr: termin.termin_nr,
            kunde: termin.kunde_name,
            kennzeichen: termin.kennzeichen,
            arbeit: `📅 ${vortagLabel}: ${arbeitenListe.join(', ')}`,
            arbeitenListe,
            zeitMinuten: zeitMin,
            anzeigeZeitMinuten: zeitMin,
            bringZeit: termin.bring_zeit || null,
            abholungZeit: termin.abholung_zeit || null,
            status: termin.status || 'geplant',
            istSchwebend: termin.ist_schwebend === 1 || termin.ist_schwebend === true,
            istErweiterung: termin.ist_erweiterung === 1 || termin.ist_erweiterung === true,
            erweiterungAnzahl: 0,
            erweiterungVonId: termin.erweiterung_von_id || null,
            zuordnungsTyp: null,
            mitarbeiterId: null,
            lehrlingId: null,
            istNacharbeit: false,
            nacharbeitStartZeit: null
          });
        }

        this.renderZeitleiste(body, arbeitenMap, ohneZuordnung, mitarbeiter, lehrlinge, mittagspauseDauer, abwesendeMitarbeiter, abwesendeLehrlinge, datum);

      } catch (error) {
        console.error('Fehler beim Laden der Zeitleiste:', error);
        body.innerHTML = '<div class="zeitleiste-leer"><span class="zeitleiste-leer-icon">❌</span><p>Fehler beim Laden</p></div>';
      }
    },

    setupTimelineDropZone(element, startHour, type = 'mitarbeiter') {
      element.addEventListener('dragover', (e) => {
        e.preventDefault();
        
        // Berechne Position und prüfe ob gesperrt
        const rect = element.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const gesperrterBereich = this.isPositionGesperrt(element, dropX);
        
        if (gesperrterBereich) {
          e.dataTransfer.dropEffect = 'none';
          element.classList.remove('drag-over');
          this.removeDragTimeIndicator();
          document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
          return;
        }
        
        e.dataTransfer.dropEffect = 'move';
        element.classList.add('drag-over');
        
        // Berechne Zeit für Indikator
        const pixelPerHour = 100;
        const hoursFromStart = dropX / pixelPerHour;
        const totalMinutes = Math.round((startHour + hoursFromStart) * 60);
        const raster = this.planungRaster || 5;
        const snappedMinutes = Math.round(totalMinutes / raster) * raster;
        let newHour = Math.floor(snappedMinutes / 60);
        let newMinute = snappedMinutes % 60;
        
        // Dauer für Endzeitberechnung (falls vorhanden)
        let dauer = 30; // Standard
        const draggingEl = document.querySelector('.dragging');
        if (draggingEl && draggingEl.dataset.dauer) {
          dauer = parseInt(draggingEl.dataset.dauer);
        }
        
        // Hole Termin-ID und Arbeit-Index für Kollisionsprüfung
        const draggingTerminId = draggingEl ? draggingEl.dataset.terminId : null;
        const draggingArbeitIndex = draggingEl ? draggingEl.dataset.arbeitIndex : null;
        const excludeArbeitIdx = draggingArbeitIndex !== undefined ? parseInt(draggingArbeitIndex) : null;
        
        // Prüfe nur auf Kollision für visuelles Feedback (ohne automatische Korrektur)
        const kollisionCheck = this.checkDropKollision(element, snappedMinutes, dauer, draggingTerminId, excludeArbeitIdx);
        
        let anzeigeMinuten = snappedMinutes;
        let hatKollision = kollisionCheck.hatKollision && kollisionCheck.typ === 'termin'; // Nur echte Termin-Überlappungen rot markieren
        
        const zeit = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
        const endMinutes = anzeigeMinuten + dauer;
        const endHour = Math.floor(endMinutes / 60);
        const endMinute = endMinutes % 60;
        const endzeit = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
        
        // Indikator aktualisieren (mit Warnzeichen bei Überlappung)
        if (hatKollision) {
          this.updateDragTimeIndicator(e.clientX, e.clientY, `⚠️ ${zeit}`, endzeit);
        } else {
          this.updateDragTimeIndicator(e.clientX, e.clientY, zeit, endzeit);
        }
        
        // Positionslinie an der gewünschten Position anzeigen (rot bei Kollision)
        const snappedLeftPx = ((newHour - startHour) * 60 + newMinute) * (pixelPerHour / 60);
        
        this.showDragPositionLine(element, snappedLeftPx, hatKollision ? { hatKollision: true } : null);
      });

      element.addEventListener('dragleave', () => {
        element.classList.remove('drag-over');
        // Positionslinie entfernen beim Verlassen
        document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
      });

      element.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation(); // Verhindert Bubbling zu übergeordneten Drop-Zonen
        element.classList.remove('drag-over');
        // Zeit-Indikator und Positionslinie entfernen
        this.removeDragTimeIndicator();
        document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
        
        // Prüfe ob Drop in gesperrtem Bereich erfolgt und berechne Position
        const rect = element.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        if (this.isPositionGesperrt(element, dropX)) {
          this.showToast('❌ Termine können nicht außerhalb der Arbeitszeit platziert werden', 'error');
          return;
        }
        
        const terminId = e.dataTransfer.getData('text/plain');
        // Doppel-Drop Guard: selber Termin nicht zweimal innerhalb 1s verarbeiten
        if (this._dropGuard && this._dropGuard.terminId === terminId && Date.now() - this._dropGuard.ts < 1000) return;
        this._dropGuard = { terminId, ts: Date.now() };
        const arbeitName = e.dataTransfer.getData('application/x-arbeit-name');
        const arbeitIndex = e.dataTransfer.getData('application/x-arbeit-index');
        const istArbeitBlock = e.dataTransfer.getData('application/x-ist-arbeit-block') === 'true';
        const mitarbeiterId = element.dataset.mitarbeiterId;
        const lehrlingId = element.dataset.lehrlingId;
        const targetType = element.dataset.type || 'mitarbeiter';
        
        // Berechne neue Startzeit basierend auf Drop-Position
        const pixelPerHour = 100;
        const hoursFromStart = dropX / pixelPerHour;
        const totalMinutes = Math.round((startHour + hoursFromStart) * 60);
        // Raster aus Einstellung holen (Standard: 15 Minuten)
        const raster = this.planungRaster || 15;
        // Gesamtminuten snappen (identisch zu Dragover-Logik, verhindert Abweichung)
        let snappedMinutes = Math.round(totalMinutes / raster) * raster;
        let newHour = Math.floor(snappedMinutes / 60);
        let newMinute = snappedMinutes % 60;
        
        // Hole Dauer: primär aus dataTransfer (zuverlässiger als DOM-Suche)
        const dauerFromTransfer = parseInt(e.dataTransfer.getData('application/x-dauer')) || 0;
        const draggingEl = document.querySelector('.dragging');
        let dauer = dauerFromTransfer || (draggingEl && draggingEl.dataset.dauer ? parseInt(draggingEl.dataset.dauer) : 30) || 30;
        
        // Prüfe nur auf Mittagspausen-Kollision und verschiebe automatisch nach der Pause
        const excludeArbeitIdx = istArbeitBlock ? parseInt(arbeitIndex) : null;
        const kollisionCheck = this.checkDropKollision(element, snappedMinutes, dauer, terminId, excludeArbeitIdx);
        
        // Nur bei Pause-Kollision automatisch korrigieren
        if (kollisionCheck.hatKollision && (kollisionCheck.typ === 'pause-start' || kollisionCheck.typ === 'pause-komplett')) {
          const nachPause = Math.ceil(kollisionCheck.pauseEndMinutes / raster) * raster;
          snappedMinutes = nachPause;
          newHour = Math.floor(snappedMinutes / 60);
          newMinute = snappedMinutes % 60;
          this.showToast(`⏱️ ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')} (nach Mittagspause verschoben)`, 'info');
        } else if (kollisionCheck.hatKollision && kollisionCheck.typ === 'termin' && kollisionCheck.naheTermine && kollisionCheck.naheTermine.length > 0) {
          // Smart-Anhängen NUR bei echter Termin-Überlappung (Drop direkt auf anderen Termin)
          const termineVorher = kollisionCheck.naheTermine.filter(t => t.position === 'vorher');
          if (termineVorher.length > 0) {
            termineVorher.sort((a, b) => a.abstand - b.abstand);
            const naechsterVorher = termineVorher[0];
            const AUFRAEUMPAUSE = 10; // 10 Minuten Puffer
            const mitPuffer = Math.ceil((naechsterVorher.terminEnd + AUFRAEUMPAUSE) / raster) * raster;
            // Prüfe ob Position mit Puffer frei ist
            const pufferCheck = this.checkDropKollision(element, mitPuffer, dauer, terminId, excludeArbeitIdx);
            if (!pufferCheck.hatKollision) {
              snappedMinutes = mitPuffer;
              newHour = Math.floor(snappedMinutes / 60);
              newMinute = snappedMinutes % 60;
              this.showToast(`⏱️ ${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')} (an vorherigen Termin angehängt mit 10 Min Puffer)`, 'info');
            }
          }
        }
        
        const newStartzeit = `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}`;
        
        if (terminId) {
          if (istArbeitBlock && arbeitName) {
            // Einzelnen Arbeitsblock verschieben
            await this.moveArbeitBlockToMitarbeiter(terminId, arbeitName, parseInt(arbeitIndex), mitarbeiterId, lehrlingId, targetType, newStartzeit);
          } else {
            try {
              console.log('[DROP] terminId:', terminId, '| mitarbeiterId:', mitarbeiterId, '| lehrlingId:', lehrlingId, '| dauer:', dauer);
              // Vor dem Verschieben: Kapazitäts-Prüfung durchführen
              const person = targetType === 'mitarbeiter' 
                ? await MitarbeiterService.getById(mitarbeiterId)
                : await LehrlingeService.getById(lehrlingId);
              console.log('[DROP] person geladen:', person?.name || 'null');
              
              const selectedDatum = document.getElementById('auslastungDragDropDatum').value;
              const terminDaten = await TermineService.getById(terminId);
              console.log('[DROP] terminDaten geladen:', terminDaten?.id || 'null');
              
              if (!terminDaten) {
                this.showToast('❌ Termin nicht gefunden (ID: ' + terminId + ')', 'error');
                return;
              }

              // Prüfe ob der Termin bereits diesem Mitarbeiter gehört (nur Repositionierung).
              // In diesem Fall zählt belegt_minuten_roh die Dauer schon → Kapazitätscheck würde
              // die Zeit doppelt zählen und fälschlicherweise eine Überlastung melden.
              const zielPersonId = parseInt(mitarbeiterId || lehrlingId);
              const bereitsZugewiesen = targetType === 'lehrling'
                ? terminDaten.lehrling_id === zielPersonId
                : terminDaten.mitarbeiter_id === zielPersonId;

              if (bereitsZugewiesen) {
                // Nur Zeitslot ändern – kein Kapazitätscheck nötig
                console.log('[DROP] Bereits zugewiesen → direkt repositionieren (kein Kapazitätscheck)');
                await this.moveTerminToMitarbeiterWithTime(terminId, mitarbeiterId, lehrlingId, targetType, newStartzeit);
                await this._checkFeierabendUeberlauf(terminId, terminDaten, newStartzeit, selectedDatum);
              } else {
                const kapazitaetWarnung = await this.checkKapazitaetVorZuweisung(
                  person, 
                  selectedDatum, 
                  dauer, 
                  targetType,
                  zielPersonId
                );
                console.log('[DROP] kapazitaetWarnung:', kapazitaetWarnung?.ueberlastet, '| aktuelle:', kapazitaetWarnung?.aktuelleAuslastung, '| max:', kapazitaetWarnung?.maxKapazitaet);

                if (kapazitaetWarnung.ueberlastet) {
                  console.log('[DROP] Überlastet → showVerschiebeWarnung wird aufgerufen...');
                  await this.showVerschiebeWarnung(
                    person,
                    terminDaten,
                    kapazitaetWarnung,
                    selectedDatum,
                    mitarbeiterId,
                    lehrlingId,
                    targetType,
                    newStartzeit
                  );
                } else {
                  console.log('[DROP] Nicht überlastet → direkt zuweisen');
                  await this.moveTerminToMitarbeiterWithTime(terminId, mitarbeiterId, lehrlingId, targetType, newStartzeit);
                  await this._checkFeierabendUeberlauf(terminId, terminDaten, newStartzeit, selectedDatum);
                }
              }
            } catch (error) {
              console.error('[DROP] Fehler beim Zuweisen:', error);
              const terminInfo = terminDaten
                ? ` [${terminDaten.kunde_name || 'Intern'} – ${terminDaten.kennzeichen || ''}]`
                : '';
              this.showToast(`❌ Fehler beim Zuweisen${terminInfo}: ${error.message || 'Unbekannter Fehler'}`, 'error');
            }
          }
        }
      });
    },
  });
}
