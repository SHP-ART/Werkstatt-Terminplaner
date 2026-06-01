export function installDragDropFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async loadAuslastungDragDrop() {
      console.log('[DEBUG] loadAuslastungDragDrop - Start');
      const datumInput = document.getElementById('auslastungDragDropDatum');
      if (!datumInput) {
        console.log('[DEBUG] loadAuslastungDragDrop - datumInput nicht gefunden');
        return;
      }
      
      const datum = datumInput.value;
      console.log('[DEBUG] loadAuslastungDragDrop - Datum:', datum);
      if (!datum) return;

      // Prüfe auf ungespeicherte Änderungen beim Datumswechsel
      if (this.planungAenderungen.size > 0 && this._lastPlanungDatum && this._lastPlanungDatum !== datum) {
        if (!confirm(`Es gibt ${this.planungAenderungen.size} ungespeicherte Änderung(en). Datum trotzdem wechseln?\n\nÄnderungen werden verworfen.`)) {
          datumInput.value = this._lastPlanungDatum;
          return;
        }
        this.planungAenderungen.clear();
      }
      this._lastPlanungDatum = datum;
      
      // UI für Änderungen aktualisieren
      this.updatePlanungAenderungenUI();

      try {
        // 1. Termine für das Datum laden (API gibt jetzt {termine: [], aktivePausen: [], arbeitspausenMap: {}} zurück)
        const terminResponse = await TermineService.getAllMitPausen(datum);
        let termine = terminResponse.termine || [];
        let aktivePausen = terminResponse.aktivePausen || [];
        const arbeitspausenMap = terminResponse.arbeitspausenMap || {};
        // Arbeitspausen direkt in Termin-Objekte einbetten
        termine = termine.map(t => ({ ...t, arbeitspausen: arbeitspausenMap[t.id] || [] }));

        // 1b. Schwebende Termine laden (alle Termine, dann filtern)
        const alleTermine = await TermineService.getAll(null);
        
        console.log('[DEBUG] Gesamte Termine geladen:', alleTermine.length);
        
        // Robuste Filterung: ist_schwebend kann 1, "1", true sein
        const schwebendeTermine = alleTermine.filter(t => 
          t.ist_schwebend === 1 || t.ist_schwebend === '1' || t.ist_schwebend === true
        );

        // Nicht-zugeordnete Termine im Pool anzeigen:
        // - Termine vom gewählten Tag OHNE Mitarbeiter-Zuweisung
        // - Termine von früheren Tagen, die noch offen sind UND deren Abholdatum >= gewählter Tag
        //   (Fahrzeug muss bis zur Abholung fertig sein → in der Planung sichtbar halten)
        // Nächsten Tag berechnen für Vorabanzeige (YYYY-MM-DD) - lokal, kein UTC-Drift
        const [dy, dm, dd] = datum.split('-').map(Number);
        const naechsterTagDate = new Date(dy, dm - 1, dd + 1);
        const naechsterTagStr = `${naechsterTagDate.getFullYear()}-${String(naechsterTagDate.getMonth()+1).padStart(2,'0')}-${String(naechsterTagDate.getDate()).padStart(2,'0')}`;

        const nichtZugeordneteVomDatum = alleTermine.filter(t => {
          if (t.ist_schwebend) return false; // Schwebende bereits oben erfasst
          // Nur bis einschließlich morgen anzeigen (nicht übermorgen und weiter)
          if (t.datum > naechsterTagStr) return false;
          // Termin vom Vortag/früheren Tag: ausblenden nur wenn Abholdatum explizit gesetzt UND vergangen
          if (t.datum < datum) {
            if (t.abholung_datum && t.abholung_datum < datum) return false;
          }
          if (t.status === 'storniert') return false;
          // Abgeschlossene Termine: nur durchlassen wenn per-Arbeit-Abschluss genutzt wurde
          // (mindestens eine Arbeit explizit abgeschlossen UND mindestens eine noch offen)
          if (t.status === 'abgeschlossen') {
            let hatAbgeschlossene = false;
            let hatOffene = false;
            if (t.arbeitszeiten_details) {
              try {
                const det = typeof t.arbeitszeiten_details === 'string'
                  ? JSON.parse(t.arbeitszeiten_details) : t.arbeitszeiten_details;
                for (const k of Object.keys(det)) {
                  if (k.startsWith('_')) continue;
                  if (det[k] && det[k].abgeschlossen === true) {
                    hatAbgeschlossene = true;
                  } else {
                    hatOffene = true;
                  }
                }
              } catch (e) {}
            }
            // Nur durchlassen wenn teilweise abgeschlossen (Feature aktiv genutzt)
            if (!(hatAbgeschlossene && hatOffene)) return false;
          }
          if (t.geloescht_am) return false;
          // Prüfe ob kein Mitarbeiter zugeordnet ist (weder direkt noch über arbeitszeiten_details)
          if (t.mitarbeiter_id) return false;
          if (t.lehrling_id) return false;
          if (t.arbeitszeiten_details) {
            try {
              const details = typeof t.arbeitszeiten_details === 'string'
                ? JSON.parse(t.arbeitszeiten_details)
                : t.arbeitszeiten_details;
              if (details._gesamt_mitarbeiter_id) return false;
            } catch (e) { /* ignorieren */ }
          }
          return true;
        });
        
        console.log('[DEBUG] Termine für Datum:', termine.length);
        console.log('[DEBUG] Schwebende Termine:', schwebendeTermine.length);
        console.log('[DEBUG] Nicht zugeordnete Termine vom Datum:', nichtZugeordneteVomDatum.length);
        
        // Schwebende Termine markieren und zu den Terminen hinzufügen (ohne Duplikate)
        schwebendeTermine.forEach(st => {
          st._istSchwebend = true; // Markierung für UI
          if (!termine.find(t => t.id === st.id)) {
            termine.push(st);
          }
        });

        // Nicht-zugeordnete Termine auch als ziehbar markieren
        nichtZugeordneteVomDatum.forEach(t => {
          t._nichtZugeordnet = true; // Markierung für UI
          if (t.datum < datum) t._istUebertrag = true; // Übertrag aus früherem Tag
          if (t.datum > datum) t._istVorschau = true; // Termin von morgen (Vorabplanung)
          if (!termine.find(x => x.id === t.id)) {
            termine.push(t);
          }
        });

        // 2. Mitarbeiter UND Lehrlinge laden
        const mitarbeiterListe = await MitarbeiterService.getAll();
        const lehrlingeListe = await LehrlingeService.getAll();

        // 3. Echte Auslastung laden (für korrekte Kapazitäten)
        const auslastungData = await AuslastungService.getByDatum(datum);
        
        // 3a. Abwesenheiten für dieses Datum laden (für Kapazitätsberechnung)
        let abwesenheitenFuerDatum = [];
        try {
          abwesenheitenFuerDatum = await fetch(`${CONFIG.API_URL}/abwesenheiten/datum/${datum}`)
            .then(res => res.json());
        } catch (error) {
          console.error('Fehler beim Laden der Abwesenheiten:', error);
        }

        // 3a2. Tagesstempel für dieses Datum laden (für echte Ankunftszeiten)
        let tagesstempelMap = new Map(); // 'ma-{id}' / 'l-{id}' → kommen_zeit
        try {
          const stempelData = await fetch(`${CONFIG.API_URL}/tagesstempel?datum=${datum}`)
            .then(res => res.ok ? res.json() : { stempel: [] });
          (stempelData.stempel || []).forEach(s => {
            const kommen = s.kommen_zeit ? s.kommen_zeit.substring(0, 5) : null;
            if (!kommen) return;
            if (s.mitarbeiter_id) tagesstempelMap.set(`ma-${s.mitarbeiter_id}`, kommen);
            if (s.lehrling_id)    tagesstempelMap.set(`l-${s.lehrling_id}`, kommen);
          });
        } catch (error) {
          console.warn('Tagesstempel konnten nicht geladen werden:', error);
        }
        
        // aktivePausen wurden bereits mit Terminen geladen (siehe oben)
        console.log('Aktive Pausen geladen:', aktivePausen);
        
        // 3b. Werkstatt-Einstellungen laden (für Nebenzeit)
        const einstellungen = await EinstellungenService.getWerkstatt();
        const nebenzeitProzent = einstellungen?.nebenzeit_prozent || 0;
        // Speichere für spätere Verwendung in getTerminGesamtdauer
        this._planungNebenzeitProzent = nebenzeitProzent;
        // Speichere Lehrlinge für Aufgabenbewältigung-Berechnung
        this._planungLehrlinge = lehrlingeListe || [];

        // 3c. Auslastungsbalken aktualisieren
        this.updatePlanungAuslastungsbalken(auslastungData, mitarbeiterListe, lehrlingeListe);

        // 3c2. Anomalien-Banner im Hintergrund laden (nicht blockierend)
        this._loadAuslastungWarnungen(datum);

        // 3d. Arbeitszeiten für alle Mitarbeiter und Lehrlinge laden
        const arbeitszeitenMap = new Map(); // Speichert Arbeitszeiten: 'ma-{id}' oder 'l-{id}' -> {arbeitsbeginn, arbeitsende}
        
        // Arbeitszeiten für Mitarbeiter laden
        await Promise.all(mitarbeiterListe.map(async (ma) => {
          try {
            const arbeitszeit = await fetch(`${CONFIG.API_URL}/arbeitszeiten-plan/for-date?mitarbeiter_id=${ma.id}&datum=${datum}`)
              .then(res => res.ok ? res.json() : null);
            
            if (arbeitszeit && arbeitszeit.arbeitsstunden !== undefined) {
              const istFrei = arbeitszeit.ist_frei === 1;
              if (!istFrei) {
                // Arbeitsbeginn: gestempelte Ankunft hat Vorrang, sonst Standard
                const plannedBeginn = '08:00';
                const arbeitsbeginn = tagesstempelMap.get(`ma-${ma.id}`) || plannedBeginn;
                const arbeitsstunden = arbeitszeit.arbeitsstunden || 8;
                const pausenzeit = arbeitszeit.pausenzeit_minuten || 0;
                // Arbeitsende immer vom geplanten Beginn berechnen (Verspaetung verlaengert den Tag nicht)
                const endeMinuten = this.timeToMinutes(plannedBeginn) + (arbeitsstunden * 60) + pausenzeit;
                const arbeitsende = this.minutesToTime(endeMinuten);
                
                arbeitszeitenMap.set(`ma-${ma.id}`, {
                  arbeitsbeginn,
                  arbeitsende,
                  arbeitsstunden,
                  pausenzeit
                });
              }
            }
          } catch (error) {
            console.warn(`Fehler beim Laden der Arbeitszeit für Mitarbeiter ${ma.name}:`, error);
          }
        }));
        
        // Arbeitszeiten für Lehrlinge laden
        await Promise.all(lehrlingeListe.map(async (l) => {
          try {
            const arbeitszeit = await fetch(`${CONFIG.API_URL}/arbeitszeiten-plan/for-date?lehrling_id=${l.id}&datum=${datum}`)
              .then(res => res.ok ? res.json() : null);
            
            if (arbeitszeit && arbeitszeit.arbeitsstunden !== undefined) {
              const istFrei = arbeitszeit.ist_frei === 1;
              if (!istFrei) {
                // Arbeitsbeginn: gestempelte Ankunft hat Vorrang, sonst Standard
                const plannedBeginn = '08:00';
                const arbeitsbeginn = tagesstempelMap.get(`l-${l.id}`) || plannedBeginn;
                const arbeitsstunden = arbeitszeit.arbeitsstunden || 8;
                const pausenzeit = arbeitszeit.pausenzeit_minuten || 0;
                // Arbeitsende immer vom geplanten Beginn berechnen (Verspaetung verlaengert den Tag nicht)
                const endeMinuten = this.timeToMinutes(plannedBeginn) + (arbeitsstunden * 60) + pausenzeit;
                const arbeitsende = this.minutesToTime(endeMinuten);
                
                arbeitszeitenMap.set(`l-${l.id}`, {
                  arbeitsbeginn,
                  arbeitsende,
                  arbeitsstunden,
                  pausenzeit
                });
              }
            }
          } catch (error) {
            console.warn(`Fehler beim Laden der Arbeitszeit für Lehrling ${l.name}:`, error);
          }
        }));

        // 4. Container leeren
        const sourceContainer = document.getElementById('dragDropNichtZugeordnet');
        const schwebendeContainer = document.getElementById('schwebendeTermineContainer');
        const timelineHeader = document.getElementById('timelineHours');
        const timelineBody = document.getElementById('timelineBody');
        
        if (sourceContainer) sourceContainer.innerHTML = ''; 
        if (schwebendeContainer) schwebendeContainer.innerHTML = '';
        if (timelineHeader) timelineHeader.innerHTML = '';
        if (timelineBody) timelineBody.innerHTML = '';

        // 5. Timeline Header erstellen (Stunden von 8:00 bis 18:00)
        const startHour = 8;
        const endHour = 18;
        const currentHour = new Date().getHours();
        const currentMinute = new Date().getMinutes();
        
        // Halbstündliche Anzeige
        for (let h = startHour; h <= endHour; h++) {
          // Volle Stunde
          const hourDiv = document.createElement('div');
          const isCurrentHour = (h === currentHour && currentMinute < 30);
          hourDiv.className = 'timeline-hour timeline-hour-full' + (isCurrentHour ? ' current-hour' : '');
          hourDiv.textContent = `${h}:00`;
          timelineHeader.appendChild(hourDiv);
          
          // Halbe Stunde (nicht nach der letzten Stunde)
          if (h < endHour) {
            const halfHourDiv = document.createElement('div');
            const isCurrentHalf = (h === currentHour && currentMinute >= 30);
            halfHourDiv.className = 'timeline-hour timeline-hour-half' + (isCurrentHalf ? ' current-hour' : '');
            halfHourDiv.textContent = `${h}:30`;
            timelineHeader.appendChild(halfHourDiv);
          }
        }

        // 6. Mitarbeiter Zeitbahnen erstellen
        const mitarbeiterMap = {}; // ID -> Track Element
        const lehrlingeMap = {}; // ID -> Track Element
        
        // === MITARBEITER ===
        mitarbeiterListe.forEach(ma => {
          // Kapazität berechnen mit neuer Wochenarbeitszeit-Logik (synchron mit vorgeladenen Abwesenheiten)
          const maxMinuten = this.calculateTageskapazitaetMinutenSync(ma, datum, abwesenheitenFuerDatum);
          
          // Aktuelle Auslastung aus API holen (belegt_minuten_roh = reine Arbeitszeit ohne Nebenzeit)
          let currentMinuten = 0;
          let istAbwesend = false;
          let abwesenheitsTyp = '';
          if (auslastungData && auslastungData.mitarbeiter_auslastung) {
            const maAuslastung = auslastungData.mitarbeiter_auslastung.find(m => m.mitarbeiter_id === ma.id);
            if (maAuslastung) {
              currentMinuten = maAuslastung.belegt_minuten_roh || maAuslastung.belegt_minuten || 0;
              istAbwesend = maAuslastung.ist_abwesend === true;
              abwesenheitsTyp = maAuslastung.abwesenheits_typ || '';
            }
          }

          // Auslastungsprozent berechnen
          const auslastungProzent = maxMinuten > 0 ? Math.round((currentMinuten / maxMinuten) * 100) : 0;
          
          // Badge-Farbe basierend auf Auslastung
          let auslastungClass = '';
          if (auslastungProzent < 70) auslastungClass = 'auslastung-low';
          else if (auslastungProzent < 90) auslastungClass = 'auslastung-medium';
          else auslastungClass = 'auslastung-high';

          const row = document.createElement('div');
          row.className = 'timeline-row' + (istAbwesend ? ' abwesend' : '');
          
          // Abwesenheits-Badge mit Typ
          let abwesendBadge = '';
          if (istAbwesend) {
            const abwesenheitsLabels = {
              'urlaub': '🏖️ URLAUB',
              'krank': '🤒 KRANK',
              'lehrgang': '📖 LEHRGANG',
              'berufsschule': '📚 BERUFSSCHULE'
            };
            abwesendBadge = `<span class="abwesend-badge">${abwesenheitsLabels[abwesenheitsTyp] || '🏥 ABWESEND'}</span>`;
          }
          
          // Kapazität mit Stunden und Prozent
          const stundenText = `${(currentMinuten / 60).toFixed(1)}h / ${(maxMinuten / 60).toFixed(1)}h`;
          const kapazitaetText = istAbwesend 
            ? '<span class="kapazitaet-abwesend">0h / 0h (0%)</span>' 
            : `<span class="kapazitaet-wert ${auslastungClass}">⏱️ ${stundenText} (${auslastungProzent}%)</span>`;
          
          row.innerHTML = `
            <div class="timeline-mitarbeiter">
              <div class="timeline-mitarbeiter-name">👷 ${ma.name}${abwesendBadge}</div>
              <div class="timeline-mitarbeiter-kapazitaet" id="kapazitaet-ma-${ma.id}">${kapazitaetText}</div>
            </div>
            <div class="timeline-track ${istAbwesend ? 'abwesend-track' : 'drop-zone'}" data-mitarbeiter-id="${ma.id}" data-type="mitarbeiter" data-abwesend="${istAbwesend}"></div>
          `;
          timelineBody.appendChild(row);
          
          const track = row.querySelector('.timeline-track');
          mitarbeiterMap[ma.id] = track;
          
          // Gesperrte Zeitbereiche und Mittagspause hinzufügen (nur wenn nicht abwesend)
          if (!istAbwesend) {
            const arbeitszeit = arbeitszeitenMap.get(`ma-${ma.id}`);
            if (arbeitszeit) {
              this.addGesperrteZeitbereicheToTrack(track, arbeitszeit.arbeitsbeginn, arbeitszeit.arbeitsende, startHour, endHour);
            }
            
            // Prüfe ob Mitarbeiter in Pause ist
            const pauseInfo = aktivePausen.find(p => p.mitarbeiter_id === ma.id);
            if (pauseInfo) {
              // Aktive Pause anzeigen
              this.addAktivePauseToTrack(track, pauseInfo, startHour);
            } else {
              // Nur geplante Pause anzeigen wenn keine aktive Pause läuft
              this.addMittagspauseToTrack(track, ma.mittagspause_start, startHour, false, ma.pausenzeit_minuten || 30); // false = geplant
            }
            
            // Drop-Events nur für nicht-abwesende registrieren
            this.setupTimelineDropZone(track, startHour);
          }
        });

        // === LEHRLINGE ===
        lehrlingeListe.forEach(lehrling => {
          // Kapazität berechnen mit neuer Wochenarbeitszeit-Logik (synchron mit vorgeladenen Abwesenheiten)
          const maxMinuten = this.calculateTageskapazitaetMinutenSync(lehrling, datum, abwesenheitenFuerDatum);
          
          // Aktuelle Auslastung aus API holen (belegt_minuten_roh = reine Arbeitszeit ohne Nebenzeit)
          let currentMinuten = 0;
          let istAbwesend = false;
          let abwesenheitsTyp = '';
          if (auslastungData && auslastungData.lehrlinge_auslastung) {
            const lAuslastung = auslastungData.lehrlinge_auslastung.find(l => l.lehrling_id === lehrling.id);
            if (lAuslastung) {
              currentMinuten = lAuslastung.belegt_minuten_roh || lAuslastung.belegt_minuten || 0;
              istAbwesend = lAuslastung.ist_abwesend === true;
              abwesenheitsTyp = lAuslastung.abwesenheits_typ || '';
            }
          }

          // Auslastungsprozent berechnen
          const auslastungProzent = maxMinuten > 0 ? Math.round((currentMinuten / maxMinuten) * 100) : 0;
          
          // Badge-Farbe basierend auf Auslastung
          let auslastungClass = '';
          if (auslastungProzent < 70) auslastungClass = 'auslastung-low';
          else if (auslastungProzent < 90) auslastungClass = 'auslastung-medium';
          else auslastungClass = 'auslastung-high';

          const row = document.createElement('div');
          row.className = 'timeline-row timeline-row-lehrling' + (istAbwesend ? ' abwesend' : '');
          
          // Abwesenheits-Badge mit Typ
          let abwesendBadge = '';
          if (istAbwesend) {
            const abwesenheitsLabels = {
              'urlaub': '🏖️ URLAUB',
              'krank': '🤒 KRANK',
              'lehrgang': '📖 LEHRGANG',
              'berufsschule': '📚 BERUFSSCHULE'
            };
            abwesendBadge = `<span class="abwesend-badge">${abwesenheitsLabels[abwesenheitsTyp] || '🏥 ABWESEND'}</span>`;
          }
          
          // Kapazität mit Stunden und Prozent
          const stundenText = `${(currentMinuten / 60).toFixed(1)}h / ${(maxMinuten / 60).toFixed(1)}h`;
          const kapazitaetText = istAbwesend 
            ? '<span class="kapazitaet-abwesend">0h / 0h (0%)</span>' 
            : `<span class="kapazitaet-wert ${auslastungClass}">⏱️ ${stundenText} (${auslastungProzent}%)</span>`;
          
          row.innerHTML = `
            <div class="timeline-mitarbeiter timeline-lehrling">
              <div class="timeline-mitarbeiter-name">🎓 ${lehrling.name}${abwesendBadge}</div>
              <div class="timeline-mitarbeiter-kapazitaet" id="kapazitaet-lehrling-${lehrling.id}">${kapazitaetText}</div>
            </div>
            <div class="timeline-track ${istAbwesend ? 'abwesend-track' : 'drop-zone'}" data-lehrling-id="${lehrling.id}" data-type="lehrling" data-abwesend="${istAbwesend}"></div>
          `;
          timelineBody.appendChild(row);
          
          const track = row.querySelector('.timeline-track');
          lehrlingeMap[lehrling.id] = track;
          console.log('[DEBUG] lehrlingeMap: Lehrling', lehrling.id, '(' + lehrling.name + ') eingetragen, track:', !!track);
          
          // Gesperrte Zeitbereiche, Mittagspause und Drop-Events nur wenn nicht abwesend
          if (!istAbwesend) {
            const arbeitszeit = arbeitszeitenMap.get(`l-${lehrling.id}`);
            if (arbeitszeit) {
              this.addGesperrteZeitbereicheToTrack(track, arbeitszeit.arbeitsbeginn, arbeitszeit.arbeitsende, startHour, endHour);
            }
            
            // Prüfe ob Lehrling in Pause ist
            const pauseInfo = aktivePausen.find(p => p.lehrling_id === lehrling.id);
            if (pauseInfo) {
              // Aktive Pause anzeigen
              this.addAktivePauseToTrack(track, pauseInfo, startHour);
            } else {
              // Nur geplante Pause anzeigen wenn keine aktive Pause läuft
              this.addMittagspauseToTrack(track, lehrling.mittagspause_start, startHour, false, lehrling.pausenzeit_minuten || 30); // false = geplant
            }
            
            this.setupTimelineDropZone(track, startHour, 'lehrling');
          }
        });

        // 7. Termine verteilen
        // Erstelle Maps mit Pause-Infos für die Termin-Erstellung
        const mitarbeiterPauseMap = {};
        mitarbeiterListe.forEach(ma => {
          mitarbeiterPauseMap[ma.id] = ma.mittagspause_start || null;
        });
        const lehrlingePauseMap = {};
        lehrlingeListe.forEach(l => {
          lehrlingePauseMap[l.id] = l.mittagspause_start || null;
        });

        console.log('[DEBUG] Maps aufgebaut:');
        console.log('[DEBUG]   mitarbeiterMap Keys:', Object.keys(mitarbeiterMap).join(', ') || '(leer)');
        console.log('[DEBUG]   lehrlingeMap Keys:  ', Object.keys(lehrlingeMap).join(', ') || '(leer)');
        console.log('[DEBUG] Starte Termin-Verarbeitung für', termine.length, 'Termine');
        
        termine.forEach(termin => {
          // Termin im Cache speichern für späteren Zugriff (z.B. Shift+Click)
          this.termineById[termin.id] = termin;
          
          // Schwebende Termine separat in eigenem Panel anzeigen (nicht hier)
          const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
          if (istSchwebend) {
            console.log('[DEBUG] Termin', termin.termin_nr, 'ist schwebend - wird übersprungen');
            return; // Schwebende Termine später separat verarbeiten
          }
          
          console.log('[DEBUG] Verarbeite Termin:', termin.termin_nr, 'ID:', termin.id);
          
          // Parse arbeitszeiten_details
          let details = null;
          if (termin.arbeitszeiten_details) {
            try {
              details = typeof termin.arbeitszeiten_details === 'string' 
                ? JSON.parse(termin.arbeitszeiten_details) 
                : termin.arbeitszeiten_details;
            } catch (e) {
              console.warn('Fehler beim Parsen von arbeitszeiten_details:', e);
            }
          }
          
          // Zähle einzelne Arbeiten (nicht Meta-Felder)
          const arbeiten = [];
          let hatIndividuelleZeiten = false; // Flag ob Arbeiten eigene Zeiten haben
          
          if (details) {
            for (const key in details) {
              if (key.startsWith('_')) continue; // Meta-Felder überspringen
              const arbeitData = details[key];
              // Arbeit mit Details (Objekt) oder einfacher Wert (Zahl)
              if (typeof arbeitData === 'object' && arbeitData !== null) {
                const zeit = parseInt(arbeitData.zeit) || 0;
                // NUR Zeit > 0 zählt für Splitting! Startzeit/Mitarbeiter ohne Zeit = keine individuellen Zeiten
                if (zeit > 0) {
                  hatIndividuelleZeiten = true;
                  arbeiten.push({ name: key, ...arbeitData, zeit });
                }
              } else if (typeof arbeitData === 'number' && arbeitData > 0) {
                hatIndividuelleZeiten = true;
                arbeiten.push({ name: key, zeit: arbeitData });
              }
            }
          } else if (termin.arbeiten && Array.isArray(termin.arbeiten) && termin.arbeiten.length > 0) {
            // Fallback: Altes Format mit termin.arbeiten Array
            termin.arbeiten.forEach((arbeitName, index) => {
              arbeiten.push({ 
                name: arbeitName, 
                zeit: Math.ceil((parseInt(termin.geschaetzte_zeit) || 60) / termin.arbeiten.length)
              });
            });
            hatIndividuelleZeiten = true; // Array-Format = individuelle Arbeiten
          } else if (termin.arbeit && typeof termin.arbeit === 'string' && termin.arbeit.includes('||')) {
            // Fallback 2: Feld "arbeit" mit || Trennung
            const arbeitNamen = termin.arbeit.split('||').map(a => a.trim()).filter(a => a.length > 0);
            const gesamtzeit = parseInt(termin.geschaetzte_zeit) || 60;
            const zeitProArbeit = Math.ceil(gesamtzeit / arbeitNamen.length);
            arbeitNamen.forEach((arbeitName, index) => {
              arbeiten.push({ 
                name: arbeitName, 
                zeit: zeitProArbeit
              });
            });
            hatIndividuelleZeiten = true; // || Trennung = individuelle Arbeiten
          }
          
          // Wenn KEINE individuellen Zeiten, behandle als EINEN Termin
          if (!hatIndividuelleZeiten && arbeiten.length > 0) {
            arbeiten.length = 0; // Array leeren = wird als normaler Termin behandelt
          }
          
          // DEBUG: Zeige Details für problematische Termine
          if (termin.termin_nr && (termin.termin_nr.includes('2026-065') || termin.termin_nr.includes('2026-067') || 
              termin.termin_nr.includes('2026-068') || termin.termin_nr.includes('2026-069') || termin.termin_nr.includes('2026-070'))) {
            console.log(`[DEBUG] ${termin.termin_nr} geladen:`, { 
              terminId: termin.id, 
              arbeitenCount: arbeiten.length, 
              arbeiten, 
              hatIndividuelleZeiten,
              details,
              raw: termin.arbeitszeiten_details,
              altesFormat: termin.arbeiten
            });
          }
          
          // Wenn Termin mehrere Arbeiten hat, jede als separaten Block darstellen
          if (arbeiten.length > 1) {
            console.log(`[DEBUG] ${termin.termin_nr} - Mehrere Arbeiten (${arbeiten.length}) erkannt, erstelle separate Blöcke`);
            
            // Berechne Gesamtdauer und prüfe ob alle Arbeiten eine Zeit haben
            let gesamtArbeitZeit = 0;
            let arbeitenOhneZeit = 0;
            arbeiten.forEach(a => {
              const zeit = parseInt(a.zeit) || 0;
              if (zeit > 0) {
                gesamtArbeitZeit += zeit;
              } else {
                arbeitenOhneZeit++;
              }
            });
            
            // Wenn manche Arbeiten keine Zeit haben, verteile die Restzeit
            const terminGesamtzeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 60;
            const restzeit = terminGesamtzeit - gesamtArbeitZeit;
            const zeitProArbeitOhneZeit = arbeitenOhneZeit > 0 ? Math.round(restzeit / arbeitenOhneZeit) : 30;
            
            // Sequentielle Startzeit für Arbeiten (Abstandspausen zwischen Arbeiten automatisch entfernen)
            // Priorität: DB-Feld startzeit (gesetzt beim Einplanen) > _startzeit aus Details > bring_zeit
            // details._startzeit kann fehlerhaft sein (z.B. auf Startzeit einer einzelnen Arbeit gesetzt)
            let laufendeArbeitsStartzeit = termin.startzeit || (details && details._startzeit) || termin.bring_zeit || '08:00';

            // Mehrere Arbeiten - jede als separater Block
            // Erst Zuordnungen ermitteln, um proportionale Berechnung korrekt zu machen
            const arbeitZuordnungen = arbeiten.map(arbeit => this.getArbeitZuordnung(arbeit, details, termin));
            
            // Summe der Planzeiten nur von ZUGEORDNETEN Arbeiten (für proportionale tatsächliche Zeit)
            let zugeordneteGesamtZeit = 0;
            arbeiten.forEach((arbeit, index) => {
              const z = arbeitZuordnungen[index];
              const istZugeordnet = (z.type === 'lehrling' && z.id && lehrlingeMap[z.id]) ||
                                    (z.type === 'mitarbeiter' && z.id && mitarbeiterMap[z.id]);
              if (istZugeordnet) {
                zugeordneteGesamtZeit += parseInt(arbeit.zeit) > 0 ? parseInt(arbeit.zeit) : zeitProArbeitOhneZeit;
              }
            });
            // Fallback: wenn keine Arbeit zugeordnet, alle verwenden
            if (zugeordneteGesamtZeit <= 0) zugeordneteGesamtZeit = gesamtArbeitZeit;

            arbeiten.forEach((arbeit, index) => {
              const arbeitZuordnung = arbeitZuordnungen[index];
              
              // DEBUG
              if (termin.termin_nr && termin.termin_nr.includes('2026-06')) {
                console.log(`[DEBUG] ${termin.termin_nr} - Arbeit "${arbeit.name}":`, { 
                  arbeit, 
                  arbeitZuordnung,
                  lehrlingMapHasKey: arbeitZuordnung.type === 'lehrling' && !!lehrlingeMap[arbeitZuordnung.id],
                  mitarbeiterMapHasKey: arbeitZuordnung.type === 'mitarbeiter' && !!mitarbeiterMap[arbeitZuordnung.id]
                });
              }
              
              // Erstelle virtuellen Termin für diese Arbeit
              // Dauer bestimmen: per-Arbeit tatsaechliche_zeit > proportional aus Gesamt-tatsaechliche_zeit > geplante Zeit
              let arbeitDauer;
              if (parseInt(arbeit.tatsaechliche_zeit) > 0) {
                // Per-Arbeit tatsaechliche_zeit ist explizit gesetzt
                arbeitDauer = parseInt(arbeit.tatsaechliche_zeit);
              } else if (termin.status === 'abgeschlossen' && parseInt(termin.tatsaechliche_zeit) > 0 && gesamtArbeitZeit > 0) {
                // Abgeschlossener Termin ohne per-Arbeit Zeitangabe:
                // Proportionale tatsaechliche Zeit berechnen — aber nur anteilig an zugeordneten Arbeiten,
                // damit nicht-zugeordnete Arbeiten (z.B. für morgen) die sichtbaren Balken verzerren.
                const arbeitPlanzeit = parseInt(arbeit.zeit) > 0 ? parseInt(arbeit.zeit) : zeitProArbeitOhneZeit;
                arbeitDauer = Math.max(1, Math.round(parseInt(termin.tatsaechliche_zeit) * (arbeitPlanzeit / zugeordneteGesamtZeit)));
              } else {
                arbeitDauer = (parseInt(arbeit.zeit) > 0) ? parseInt(arbeit.zeit) : zeitProArbeitOhneZeit;
              }
              // Effektive Startzeit: gespeicherte individuelle Zeit, sonst sequentiell berechnet
              const effektiveArbeitStartzeit = arbeit.startzeit || laufendeArbeitsStartzeit;
              const arbeitTermin = {
                ...termin,
                _arbeitName: arbeit.name,
                _arbeitIndex: index,
                _istArbeitBlock: true,
                _arbeitDauer: arbeitDauer,
                startzeit: effektiveArbeitStartzeit
              };
              
              // Sequentielle Startzeit für nächste Arbeit berechnen (Abstandspausen entfernen)
              const nebenzeitFuerLaufend = this._planungNebenzeitProzent || 0;
              const dauerFuerLaufend = nebenzeitFuerLaufend > 0 ? Math.round(arbeitDauer * (1 + nebenzeitFuerLaufend / 100)) : arbeitDauer;
              const [lH, lM] = effektiveArbeitStartzeit.split(':').map(Number);
              const endMinFuerLaufend = lH * 60 + lM + dauerFuerLaufend;
              laufendeArbeitsStartzeit = `${Math.floor(endMinFuerLaufend / 60).toString().padStart(2, '0')}:${(endMinFuerLaufend % 60).toString().padStart(2, '0')}`;

              // Abgeschlossene Arbeiten nicht auf der Timeline rendern (besonders Überträge vom Vortag)
              if (arbeit.abgeschlossen === true) {
                return; // Arbeit ist fertig, nicht mehr anzeigen
              }

              // Prüfe ob diese Arbeit zugeordnet ist
              if (arbeitZuordnung.type === 'lehrling' && arbeitZuordnung.id && lehrlingeMap[arbeitZuordnung.id]) {
                const pauseStart = lehrlingePauseMap[arbeitZuordnung.id];
                const timelineElement = this.createArbeitBlockElement(arbeitTermin, arbeit, startHour, endHour, pauseStart, 'lehrling');
                if (timelineElement) {
                  lehrlingeMap[arbeitZuordnung.id].appendChild(timelineElement);
                  // Erstelle Fortsetzung falls nötig
                  const fortsetzung = this.createArbeitBlockFortsetzung(arbeitTermin, arbeit, arbeitTermin.startzeit, startHour, endHour, pauseStart);
                  if (fortsetzung) lehrlingeMap[arbeitZuordnung.id].appendChild(fortsetzung);
                } else {
                  console.warn(`[DEBUG] ${termin.termin_nr} - Arbeit "${arbeit.name}" - createArbeitBlockElement gab NULL zurück`);
                }
              } else if (arbeitZuordnung.type === 'mitarbeiter' && arbeitZuordnung.id && mitarbeiterMap[arbeitZuordnung.id]) {
                const pauseStart = mitarbeiterPauseMap[arbeitZuordnung.id];
                const timelineElement = this.createArbeitBlockElement(arbeitTermin, arbeit, startHour, endHour, pauseStart, 'mitarbeiter');
                if (timelineElement) {
                  mitarbeiterMap[arbeitZuordnung.id].appendChild(timelineElement);
                  // Erstelle Fortsetzung falls nötig
                  const fortsetzung = this.createArbeitBlockFortsetzung(arbeitTermin, arbeit, arbeitTermin.startzeit, startHour, endHour, pauseStart);
                  if (fortsetzung) mitarbeiterMap[arbeitZuordnung.id].appendChild(fortsetzung);
                } else {
                  console.warn(`[DEBUG] ${termin.termin_nr} - Arbeit "${arbeit.name}" - createArbeitBlockElement gab NULL zurück`);
                }
              } else {
                console.warn(`[DEBUG] ${termin.termin_nr} - Arbeit "${arbeit.name}" NICHT zugeordnet, Zuordnung:`, arbeitZuordnung);
                // Nicht zugeordnet - als Mini-Card anzeigen (nur wenn diese Arbeit nicht abgeschlossen)
                const arbeitIstAbgeschlossen = arbeit.abgeschlossen === true;
                if (!arbeitIstAbgeschlossen && termin.status !== 'storniert') {
                  const card = this.createArbeitMiniCard(termin, arbeit, index);
                  card.dataset.dauer = arbeit.zeit; // Setze Dauer für Drag & Drop
                  sourceContainer.appendChild(card);
                }
              }
            });
            return; // Termin ist abgearbeitet, nächster Termin
          }
          
          // === Ab hier: Termine mit 0 oder 1 Arbeit ===
          // Einzelne Arbeit oder keine Details - normale Darstellung
          let zuordnungsTyp = null;
          let mitarbeiterId = null;
          let lehrlingId = null;
          let effektiveStartzeit = null;
          
          console.log('[DEBUG] Termin', termin.termin_nr, '- Prüfe Zuordnung');
          console.log('[DEBUG] - arbeitszeiten_details:', termin.arbeitszeiten_details);
          console.log('[DEBUG] - mitarbeiter_id (Feld):', termin.mitarbeiter_id);
          console.log('[DEBUG] - Parsed details:', details);
            
            if (details) {
              // Priorität 1: _gesamt_mitarbeiter_id – gilt immer als primäre Zuordnung,
              // unabhängig davon ob einzelne Arbeiten eigene mitarbeiter_id/lehrling_id haben.
              if (details._gesamt_mitarbeiter_id) {
                zuordnungsTyp = details._gesamt_mitarbeiter_id.type;
                if (zuordnungsTyp === 'mitarbeiter') {
                  mitarbeiterId = details._gesamt_mitarbeiter_id.id;
                } else if (zuordnungsTyp === 'lehrling') {
                  lehrlingId = details._gesamt_mitarbeiter_id.id;
                }
              }
              
              if (details._startzeit) {
                effektiveStartzeit = details._startzeit;
              }
              // Tatsächliche Startzeit vom Tablet (startzeit-Feld) überschreibt geplante _startzeit
              // wenn der Termin bereits gestartet wurde (in_arbeit oder abgeschlossen)
              if (termin.startzeit && (termin.status === 'in_arbeit' || termin.status === 'abgeschlossen')) {
                effektiveStartzeit = termin.startzeit;
              }
              
              // Priorität 2: Erste Arbeit mit eigener Zuordnung
              if (!zuordnungsTyp && arbeiten.length === 1) {
                const arbeit = arbeiten[0];
                if (arbeit.type === 'lehrling' && (arbeit.lehrling_id || arbeit.mitarbeiter_id)) {
                  zuordnungsTyp = 'lehrling';
                  lehrlingId = arbeit.lehrling_id || arbeit.mitarbeiter_id;
                  if (arbeit.startzeit) effektiveStartzeit = arbeit.startzeit;
                } else if (arbeit.mitarbeiter_id) {
                  zuordnungsTyp = arbeit.type || 'mitarbeiter';
                  mitarbeiterId = arbeit.mitarbeiter_id;
                  if (arbeit.startzeit) effektiveStartzeit = arbeit.startzeit;
                }
              }
            }
            
            // Priorität 3: Fallback auf termin.mitarbeiter_id
            if (!zuordnungsTyp && termin.mitarbeiter_id) {
              mitarbeiterId = termin.mitarbeiter_id;
              zuordnungsTyp = 'mitarbeiter';
              console.log('[DEBUG] Termin', termin.termin_nr, '- Fallback auf termin.mitarbeiter_id:', mitarbeiterId);
            }
            
            console.log('[DEBUG] Termin', termin.termin_nr, '- Finale Zuordnung:', {
              zuordnungsTyp,
              mitarbeiterId,
              lehrlingId,
              effektiveStartzeit,
              mitarbeiterMapHasKey: mitarbeiterId && !!mitarbeiterMap[mitarbeiterId],
              lehrlingMapHasKey: lehrlingId && !!lehrlingeMap[lehrlingId]
            });
            
            // Erstelle Kopie des Termins mit effektiver Startzeit
            const terminFuerTimeline = { ...termin };
            if (effektiveStartzeit) {
              terminFuerTimeline.startzeit = effektiveStartzeit;
            }
            
            // Termin auf Timeline platzieren
            if (zuordnungsTyp === 'lehrling' && lehrlingId && lehrlingeMap[lehrlingId]) {
              console.log('[DEBUG] Termin', termin.termin_nr, '- Platziere auf Lehrling-Timeline:', lehrlingId);
              const pauseStart = lehrlingePauseMap[lehrlingId];
              const timelineElements = this.createTimelineTerminWithPause(terminFuerTimeline, startHour, endHour, pauseStart, 'lehrling');
              timelineElements.forEach(el => {
                if (el) lehrlingeMap[lehrlingId].appendChild(el);
              });
              console.log('[DEBUG] Termin', termin.termin_nr, '- Timeline-Elemente erstellt:', timelineElements.length);
            } else if (mitarbeiterId && mitarbeiterMap[mitarbeiterId]) {
              console.log('[DEBUG] Termin', termin.termin_nr, '- Platziere auf Mitarbeiter-Timeline:', mitarbeiterId);
              const pauseStart = mitarbeiterPauseMap[mitarbeiterId];
              const timelineElements = this.createTimelineTerminWithPause(terminFuerTimeline, startHour, endHour, pauseStart);
              timelineElements.forEach(el => {
                if (el) mitarbeiterMap[mitarbeiterId].appendChild(el);
              });
              console.log('[DEBUG] Termin', termin.termin_nr, '- Timeline-Elemente erstellt:', timelineElements.length);
            } else {
              console.log('[DEBUG] Termin', termin.termin_nr, '- NICHT ZUGEORDNET - platziere in "Nicht zugeordnet" Container');
              console.log('[DEBUG] - Grund: zuordnungsTyp=', zuordnungsTyp, '| mitarbeiterId=', mitarbeiterId, '| lehrlingId=', lehrlingId);
              console.log('[DEBUG] - mitarbeiterMap Keys:', Object.keys(mitarbeiterMap).join(', ') || '(leer)', '→ gesuchter Key', mitarbeiterId, ':', !!mitarbeiterMap[mitarbeiterId]);
              console.log('[DEBUG] - lehrlingeMap  Keys:', Object.keys(lehrlingeMap).join(', ') || '(leer)', '→ gesuchter Key', lehrlingId, ':', !!lehrlingeMap[lehrlingId]);
              // Nicht zugeordnet - als Mini-Card in der Timeline-Dropzone anzeigen
              // (Schwebende Termine erscheinen im linken Panel, nicht-zugeordnete hier)
              if (!termin._istSchwebend && termin.status !== 'abgeschlossen' && termin.status !== 'storniert') {
                const card = this.createTerminMiniCard(termin, { context: 'nicht-zugeordnet' });
                sourceContainer.appendChild(card);
              }
            }
        });
        
        // Überlappungen in jeder Person-Timeline auflösen (cross-Termin Kollisionsvermeidung)
        Object.values(mitarbeiterMap).forEach(track => this.resolveTimelineOverlaps(track));
        Object.values(lehrlingeMap).forEach(track => this.resolveTimelineOverlaps(track));

        // Nicht-zugeordnete Karten nach Gestern / Heute / Morgen gruppieren
        (function groupNichtZugeordnet(container, heute, datum, self) {
          const karten = Array.from(container.children);
          if (karten.length === 0) return;
          const [hy, hm, hd] = datum.split('-').map(Number);
          const vortagDate = new Date(hy, hm - 1, hd - 1);
          const folgetagDate = new Date(hy, hm - 1, hd + 1);
          const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const vortagDatum = fmt(vortagDate);
          const folgetagDatum = fmt(folgetagDate);
          const label = d => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
          const gruppen = [
            { key: vortagDatum, klass: 'nz-section-header--gestern', icon: '⬅️', text: `Gestern (${label(vortagDate)})` },
            { key: datum,       klass: 'nz-section-header--heute',   icon: '📌', text: `Heute (${label(new Date(hy, hm-1, hd))})` },
            { key: folgetagDatum, klass: 'nz-section-header--morgen', icon: '➡️', text: `Morgen (${label(folgetagDate)})` }
          ];
          const byDatum = {};
          karten.forEach(k => {
            const d = k.dataset.datum || datum;
            if (!byDatum[d]) byDatum[d] = [];
            byDatum[d].push(k);
          });
          container.innerHTML = '';
          gruppen.forEach(g => {
            const liste = byDatum[g.key];
            if (!liste || liste.length === 0) return;
            const header = document.createElement('div');
            header.className = `nz-section-header ${g.klass}`;
            const min = liste.reduce((s, k) => s + (parseInt(k.dataset.dauer) || 0), 0);
            const daurText = min >= 60 ? `${Math.floor(min/60)}h${min%60>0?' '+(min%60)+'min':''}` : `${min}min`;
            header.innerHTML = `<span>${g.icon} ${g.text}</span><span class="nz-section-count">${liste.length} ${liste.length===1?'Termin':'Termine'} · ${daurText}</span>`;
            container.appendChild(header);
            liste.forEach(k => container.appendChild(k));
          });
          // Datum die keiner Gruppe entsprechen – sortiert nach Datum, gefiltert nach N Tagen
          const sonstige = Object.entries(byDatum)
            .filter(([d]) => !gruppen.find(g => g.key === d))
            .sort(([a], [b]) => a.localeCompare(b));

          if (sonstige.length > 0) {
            const aktivFilter = self.weitereTermineFilter || 7;
            const baseDatum = new Date(`${datum}T12:00:00`);
            const filterOptionen = [1, 2, 3, 7];

            const sonstigeImFilter = sonstige.filter(([d]) => {
              const tDiff = Math.round((new Date(d + 'T12:00:00') - baseDatum) / 86400000);
              return tDiff >= -1 && tDiff <= aktivFilter;
            });
            const sonstigeSumMe = sonstigeImFilter.reduce((s, [, l]) => s + l.reduce((ss, k) => ss + (parseInt(k.dataset.dauer) || 0), 0), 0);
            const sonstAAnzahl = sonstigeImFilter.reduce((s, [, l]) => s + l.length, 0);

            const weitereHeader = document.createElement('div');
            weitereHeader.className = 'nz-section-header nz-section-header--weitere';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'nz-weitere-title';
            const daurText = sonstigeSumMe >= 60 ? `${Math.floor(sonstigeSumMe/60)}h${sonstigeSumMe%60>0?' '+(sonstigeSumMe%60)+'min':''}` : `${sonstigeSumMe}min`;
            titleSpan.innerHTML = `📋 Weitere <span class="nz-section-count">${sonstAAnzahl} ${sonstAAnzahl===1?'Termin':'Termine'} · ${daurText}</span>`;

            const filterSpan = document.createElement('span');
            filterSpan.className = 'nz-weitere-filter';
            filterOptionen.forEach(n => {
              const btn = document.createElement('button');
              btn.className = 'nz-filter-btn' + (n === aktivFilter ? ' active' : '');
              btn.textContent = n === 7 ? '7 Tage' : `+${n}T`;
              btn.title = `Nächste ${n} Tag${n > 1 ? 'e' : ''} anzeigen`;
              btn.onclick = (e) => {
                e.stopPropagation();
                self.weitereTermineFilter = n;
                self.loadAuslastungDragDrop();
              };
              filterSpan.appendChild(btn);
            });

            weitereHeader.appendChild(titleSpan);
            weitereHeader.appendChild(filterSpan);
            container.appendChild(weitereHeader);

            sonstige.forEach(([d, liste]) => {
              const tDatum = new Date(d + 'T12:00:00');
              const tDiff = Math.round((tDatum - baseDatum) / 86400000);
              if (tDiff < -1 || tDiff > aktivFilter) return;
              const subHeader = document.createElement('div');
              subHeader.className = 'nz-date-sub-header';
              subHeader.textContent = tDatum.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
              container.appendChild(subHeader);
              liste.forEach(k => container.appendChild(k));
            });
          }
        })(sourceContainer, this.formatDateLocal(new Date()), datum, this);

        // Drop-Zone für "Nicht zugeordnet"
        this.setupDropZone(sourceContainer);

        // 8. Schwebende Termine im linken Panel rendern (NUR echte schwebende)
        // Nicht-zugeordnete Termine ohne ist_schwebend erscheinen in der Timeline-Dropzone unten
        this.renderSchwebendeTermine(schwebendeTermine, schwebendeContainer);

        // 9. Überfällige Termine laden und rendern
        this.loadUeberfaelligeTermine();
        this.loadUnterbrocheneAuftraege();

        // Kapazitäten einfärben - Mitarbeiter
        mitarbeiterListe.forEach(ma => {
          const maxMinuten = (ma.arbeitsstunden_pro_tag || 8) * 60;
          let currentMinuten = 0;
          if (auslastungData && auslastungData.mitarbeiter_auslastung) {
            const maAuslastung = auslastungData.mitarbeiter_auslastung.find(m => m.mitarbeiter_id === ma.id);
            if (maAuslastung) currentMinuten = maAuslastung.belegt_minuten_roh || maAuslastung.belegt_minuten || 0;
          }
          
          const kapSpan = document.getElementById(`kapazitaet-ma-${ma.id}`);
          if (kapSpan) {
            if (currentMinuten > maxMinuten) {
              kapSpan.style.color = 'var(--accent)';
              kapSpan.style.fontWeight = 'bold';
            } else {
              kapSpan.style.color = 'var(--muted)';
              kapSpan.style.fontWeight = 'normal';
            }
          }
        });

        // Kapazitäten einfärben - Lehrlinge
        lehrlingeListe.forEach(lehrling => {
          const maxMinuten = (lehrling.arbeitsstunden_pro_tag || 8) * 60;
          let currentMinuten = 0;
          if (auslastungData && auslastungData.lehrlinge_auslastung) {
            const lAuslastung = auslastungData.lehrlinge_auslastung.find(l => l.lehrling_id === lehrling.id);
            if (lAuslastung) currentMinuten = lAuslastung.belegt_minuten_roh || lAuslastung.belegt_minuten || 0;
          }
          
          const kapSpan = document.getElementById(`kapazitaet-lehrling-${lehrling.id}`);
          if (kapSpan) {
            if (currentMinuten > maxMinuten) {
              kapSpan.style.color = 'var(--accent)';
              kapSpan.style.fontWeight = 'bold';
            } else {
              kapSpan.style.color = 'var(--muted)';
              kapSpan.style.fontWeight = 'normal';
            }
          }
        });

        // "Jetzt"-Linie hinzufügen
        this.addTimelineNowLine(startHour, endHour);

        // Arbeitspausen als Overlay-Blöcke auf die Timeline zeichnen
        this.addArbeitspauseOverlays(termine, mitarbeiterMap, lehrlingeMap, startHour);

        // Live-Balken für laufende Termine (in_arbeit): Breite jede Minute aktualisieren
        if (this.inArbeitBarInterval) clearInterval(this.inArbeitBarInterval);
        this.inArbeitBarInterval = setInterval(() => this.updateInArbeitBars(), 60000);

      } catch (error) {
        console.error('Fehler beim Laden der Drag & Drop Auslastung:', error);
        alert('Fehler beim Laden der Daten: ' + (error.message || 'Unbekannter Fehler'));
      }
    },

    resolveTimelineOverlaps(track) {
      // Alle sichtbaren Termin-Blöcke (keine Pausen) aus der Timeline holen
      const blocks = Array.from(track.querySelectorAll('.timeline-termin, .timeline-arbeit-block'))
        .filter(b => !b.dataset.pause && !b.dataset.locked && b.style.left !== '' && b.style.left !== 'auto');

      if (blocks.length < 2) return;

      // Nach Startposition (left) sortieren
      blocks.sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));

      let lastEndPx = 0;
      for (const block of blocks) {
        let leftPx = parseFloat(block.style.left);
        const widthPx = parseFloat(block.style.width) || 0;
        if (leftPx < lastEndPx) {
          leftPx = lastEndPx;
          block.style.left = `${leftPx}px`;
        }
        lastEndPx = leftPx + widthPx;
      }
    },

    addMittagspauseToTrack(track, pauseStart, startHour, istAktiv = false, pauseDauerMinuten = 30) {
      if (!pauseStart) return;
      
      const [pauseH, pauseM] = pauseStart.split(':').map(Number);
      const pauseDauer = pauseDauerMinuten || 30; // Individuelle Pausendauer der Person
      
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      const pauseStartMinutes = (pauseH - startHour) * 60 + pauseM;
      const leftPx = pauseStartMinutes * pixelPerMinute;
      const widthPx = pauseDauer * pixelPerMinute;
      
      const pauseBlock = document.createElement('div');
      pauseBlock.className = istAktiv ? 'timeline-mittagspause timeline-pause-aktiv' : 'timeline-mittagspause timeline-pause-geplant';
      pauseBlock.draggable = false; // Pausen sind nie verschiebbar
      pauseBlock.style.left = `${leftPx}px`;
      pauseBlock.style.width = `${widthPx}px`;
      
      if (!istAktiv) {
        // Geplante Pause - deutlich sichtbar (rötlich-gestreift wie in der Zeitleiste)
        pauseBlock.style.background = 'repeating-linear-gradient(-45deg, rgba(239,83,80,0.15), rgba(239,83,80,0.15) 6px, rgba(239,83,80,0.25) 6px, rgba(239,83,80,0.25) 12px)';
        pauseBlock.style.border = '2px dashed #ef5350';
        pauseBlock.style.borderRadius = '4px';
        pauseBlock.style.cursor = 'not-allowed';
        pauseBlock.style.pointerEvents = 'none'; // Termine können über Pause hinweg platziert werden
        pauseBlock.title = `Geplante Mittagspause ${pauseStart} - ${pauseDauer} min\n⚠️ Pause kann nicht verschoben werden\n✓ Termine können hier platziert werden`;
        pauseBlock.innerHTML = '<span style="font-size:1.1em">🍽️</span>';
      } else {
        pauseBlock.style.cursor = 'not-allowed';
        pauseBlock.style.pointerEvents = 'none'; // Termine können über Pause hinweg platziert werden
        pauseBlock.title = `Mittagspause ${pauseStart} - ${pauseDauer} min\n⚠️ Pause kann nicht verschoben werden\n✓ Termine können hier platziert werden`;
        pauseBlock.innerHTML = '🍽️';
      }
      
      pauseBlock.setAttribute('data-pause', 'true');
      pauseBlock.setAttribute('data-locked', 'true');
      
      track.appendChild(pauseBlock);
    },

    addAktivePauseToTrack(track, pauseInfo, startHour) {
      if (!pauseInfo || !pauseInfo.pause_start_zeit) return;
      
      const pauseStart = new Date(pauseInfo.pause_start_zeit);
      const pauseH = pauseStart.getHours();
      const pauseM = pauseStart.getMinutes();
      const pauseDauer = 30; // 30 Minuten Pause (fest)
      
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      const pauseStartMinutes = (pauseH - startHour) * 60 + pauseM;
      const leftPx = pauseStartMinutes * pixelPerMinute;
      const widthPx = pauseDauer * pixelPerMinute;
      
      const pauseBlock = document.createElement('div');
      pauseBlock.className = 'timeline-aktive-pause';
      pauseBlock.draggable = false; // Pause selbst nicht verschiebbar
      pauseBlock.style.left = `${leftPx}px`;
      pauseBlock.style.width = `${widthPx}px`;
      pauseBlock.style.background = 'linear-gradient(135deg, #fdcb6e 0%, #e17055 100%)';
      pauseBlock.style.border = '2px solid #d63031';
      pauseBlock.style.borderRadius = '4px';
      pauseBlock.style.display = 'flex';
      pauseBlock.style.alignItems = 'center';
      pauseBlock.style.justifyContent = 'center';
      pauseBlock.style.fontSize = '1.2em';
      pauseBlock.style.zIndex = '100';
      pauseBlock.style.cursor = 'not-allowed'; 
      pauseBlock.style.boxShadow = '0 2px 6px rgba(230, 126, 34, 0.4)';
      pauseBlock.style.pointerEvents = 'none'; // Termine können über Pause hinweg platziert werden
      
      const verbleibendeMin = pauseInfo.verbleibende_minuten || 0;
      pauseBlock.title = `🍽️ AKTIVE PAUSE\nGestartet: ${pauseH.toString().padStart(2,'0')}:${pauseM.toString().padStart(2,'0')}${verbleibendeMin > 0 ? `\nVerbleibend: ${verbleibendeMin} Min.` : ''}\n⚠️ Pause kann nicht verschoben werden\n✓ Termine können hier platziert werden`;
      pauseBlock.innerHTML = verbleibendeMin > 0
        ? `🍽️ <small style="margin-left:3px;">${verbleibendeMin}min</small>`
        : `🍽️`;
      pauseBlock.setAttribute('data-pause', 'true');
      pauseBlock.setAttribute('data-locked', 'true'); // Markierung für gesperrte Elemente
      
      track.appendChild(pauseBlock);
    },

    addGesperrteZeitbereicheToTrack(track, arbeitsbeginn, arbeitsende, startHour, endHour) {
      if (!arbeitsbeginn || !arbeitsende) return;
      
      const [beginnH, beginnM] = arbeitsbeginn.split(':').map(Number);
      const [endeH, endeM] = arbeitsende.split(':').map(Number);
      
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      // Bereich VOR Arbeitsbeginn (von startHour bis arbeitsbeginn)
      const arbeitsStartMinuten = (beginnH - startHour) * 60 + beginnM;
      if (arbeitsStartMinuten > 0) {
        const sperrBlock1 = document.createElement('div');
        sperrBlock1.className = 'timeline-gesperrt';
        sperrBlock1.style.left = '0px';
        sperrBlock1.style.width = `${arbeitsStartMinuten * pixelPerMinute}px`;
        sperrBlock1.title = `Nicht im Dienst (vor ${arbeitsbeginn})`;
        sperrBlock1.setAttribute('data-gesperrt', 'true');
        track.appendChild(sperrBlock1);
      }
      
      // Bereich NACH Arbeitsende (von arbeitsende bis endHour)
      const arbeitsEndeMinuten = (endeH - startHour) * 60 + endeM;
      const timelineEndeMinuten = (endHour - startHour) * 60;
      const nachArbeitMinuten = timelineEndeMinuten - arbeitsEndeMinuten;
      
      if (nachArbeitMinuten > 0) {
        const sperrBlock2 = document.createElement('div');
        sperrBlock2.className = 'timeline-gesperrt';
        sperrBlock2.style.left = `${arbeitsEndeMinuten * pixelPerMinute}px`;
        sperrBlock2.style.width = `${nachArbeitMinuten * pixelPerMinute}px`;
        sperrBlock2.title = `Nicht im Dienst (nach ${arbeitsende})`;
        sperrBlock2.setAttribute('data-gesperrt', 'true');
        track.appendChild(sperrBlock2);
      }
    },

    isPositionGesperrt(track, posX) {
      const gesperrteBlocks = track.querySelectorAll('.timeline-gesperrt');
      for (const block of gesperrteBlocks) {
        const blockLeft = parseFloat(block.style.left);
        const blockWidth = parseFloat(block.style.width);
        const blockRight = blockLeft + blockWidth;
        
        if (posX >= blockLeft && posX <= blockRight) {
          return true;
        }
      }
      return false;
    },

    renderSchwebendeTermine(schwebendeTermine, container) {
      if (!container) return;
      
      // Sortierung anwenden (Standard: nach Datum)
      const sortSelect = document.getElementById('schwebendeSortierung');
      const sortierung = sortSelect ? sortSelect.value : 'datum';
      
      const sortierteTermine = this.sortSchwebendeTermineArray(schwebendeTermine, sortierung);
      
      // Counter aktualisieren
      const countElement = document.getElementById('schwebendeCount');
      if (countElement) {
        countElement.textContent = `${sortierteTermine.length} Termin${sortierteTermine.length !== 1 ? 'e' : ''}`;
      }
      
      // Alle schwebenden Termine im Cache speichern, damit sie bei allen Clients verfügbar sind
      sortierteTermine.forEach(termin => {
        this.termineById[termin.id] = termin;
      });
      
      // Balken erstellen
      sortierteTermine.forEach(termin => {
        const bar = this.createSchwebenderTerminBar(termin);
        container.appendChild(bar);
      });
      
      // Speichere Referenz für Sortierung
      this._schwebendeTermineCache = schwebendeTermine;
      
      // Drop-Zone für "Nicht zugeordnet" Container einrichten (um Termine hierher zu ziehen)
      this.setupSchwebendDropZone(container);
    },

    setupSchwebendDropZone(container) {
      if (!container || container._dropZoneSetup) return;
      container._dropZoneSetup = true;
      
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('drag-over-schwebend');
      });
      
      container.addEventListener('dragleave', (e) => {
        // Nur entfernen wenn wir wirklich den Container verlassen
        if (!container.contains(e.relatedTarget)) {
          container.classList.remove('drag-over-schwebend');
        }
      });
      
      container.addEventListener('drop', async (e) => {
        e.preventDefault();
        container.classList.remove('drag-over-schwebend');
        
        const terminId = e.dataTransfer.getData('text/plain');
        
        if (terminId) {
          try {
            // Personenzuweisung aus arbeitszeiten_details entfernen (nur Planzeiten behalten)
            let saubereDetails = null;
            const aktuellerTermin = this.alleTermine?.find(t => t.id == terminId);
            if (aktuellerTermin?.arbeitszeiten_details) {
              try {
                const det = typeof aktuellerTermin.arbeitszeiten_details === 'string'
                  ? JSON.parse(aktuellerTermin.arbeitszeiten_details)
                  : { ...aktuellerTermin.arbeitszeiten_details };
                delete det._gesamt_mitarbeiter_id;
                delete det._startzeit;
                for (const key of Object.keys(det)) {
                  if (det[key] && typeof det[key] === 'object' && ('mitarbeiter_id' in det[key] || 'type' in det[key])) {
                    const entry = { ...det[key] };
                    delete entry.mitarbeiter_id;
                    delete entry.type;
                    delete entry.startzeit;
                    det[key] = entry;
                  }
                }
                saubereDetails = JSON.stringify(det);
              } catch {}
            }

            // Termin als schwebend markieren und Mitarbeiter-Zuweisung entfernen
            await TermineService.update(terminId, { 
              ist_schwebend: 1, 
              mitarbeiter_id: null,
              startzeit: null,
              arbeitszeiten_details: saubereDetails
            });
            
            this.showToast('📋 Termin in "Nicht zugeordnet" verschoben', 'success');
            
            // Ansicht neu laden
            this.loadAuslastungDragDrop();
          } catch (error) {
            console.error('Fehler beim Verschieben:', error);
            this.showToast('Fehler beim Verschieben', 'error');
          }
        }
      });
    },

    sortSchwebendeTermineArray(termine, sortierung) {
      return [...termine].sort((a, b) => {
        switch (sortierung) {
          case 'datum':
            // Nach Abholzeit/Datum sortieren
            const datumA = a.abhol_datum || a.datum || '9999-12-31';
            const datumB = b.abhol_datum || b.datum || '9999-12-31';
            return datumA.localeCompare(datumB);
            
          case 'dauer':
            // Nach geschätzter Zeit (längste zuerst)
            const dauerA = this.getTerminGesamtdauer(a);
            const dauerB = this.getTerminGesamtdauer(b);
            return dauerB - dauerA;
            
          case 'kunde':
            // Alphabetisch nach Kundenname
            const kundeA = (a.kunde_name || '').toLowerCase();
            const kundeB = (b.kunde_name || '').toLowerCase();
            return kundeA.localeCompare(kundeB);
            
          case 'dringlichkeit':
            // Nach Dringlichkeit (hoch zuerst)
            const dringlichkeitOrder = { 'hoch': 1, 'mittel': 2, 'normal': 3, 'niedrig': 4 };
            const dringA = this.getTerminDringlichkeit(a);
            const dringB = this.getTerminDringlichkeit(b);
            return (dringlichkeitOrder[dringA] || 3) - (dringlichkeitOrder[dringB] || 3);
          
          case 'prioritaet':
            // Nach Priorität (hoch zuerst)
            const prioritaetOrder = { 'hoch': 1, 'mittel': 2, 'niedrig': 3 };
            const prioA = a.schwebend_prioritaet || 'mittel';
            const prioB = b.schwebend_prioritaet || 'mittel';
            return (prioritaetOrder[prioA] || 2) - (prioritaetOrder[prioB] || 2);
            
          default:
            return 0;
        }
      });
    },

    sortSchwebendeTermine(sortierung) {
      const container = document.getElementById('schwebendeTermineContainer');
      if (!container || !this._schwebendeTermineCache) return;
      
      container.innerHTML = '';
      this.renderSchwebendeTermine(this._schwebendeTermineCache, container);
    },

    async loadUnterbrocheneAuftraege() {
      const container = document.getElementById('unterbrocheneAuftraege');
      const countBadge = document.getElementById('unterbrocheneCount');
      if (!container) return;

      try {
        const termine = await ApiService.get('/termine');
        const unterbrochen = termine.filter(t =>
          t.split_teil === 2 &&
          !t.datum &&
          t.status === 'geplant' &&
          !t.geloescht
        );

        if (countBadge) {
          countBadge.textContent = `${unterbrochen.length} Auftrag${unterbrochen.length !== 1 ? 'träge' : ''}`;
        }

        container.innerHTML = '';
        if (!unterbrochen.length) {
          container.innerHTML = '<div class="empty-state">✅ Keine unterbrochenen Aufträge</div>';
          return;
        }

        const grundLabels = {
          teil_fehlt: '⏳ Teil fehlt',
          rueckfrage_kunde: '❓ Rückfrage Kunde',
          vorrang: '🔀 Vorrang',
          sonstiges: '📝 Sonstiges'
        };

        unterbrochen.forEach(termin => {
          const card = document.createElement('div');
          card.className = 'ueberfaelliger-termin';
          card.style.borderLeft = '4px solid #e65100';
          card.dataset.terminId = termin.id;

          const grundBadge = termin.unterbrochen_grund
            ? `<span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc02;border-radius:4px;padding:1px 6px;font-size:0.75em;">${grundLabels[termin.unterbrochen_grund] || termin.unterbrochen_grund}</span>`
            : '';
          const richtzeit = termin.geschaetzte_zeit ? `${termin.geschaetzte_zeit} Min.` : '—';

          card.innerHTML = `
            <div class="ueberfaelliger-termin-info">
              <div class="ueberfaelliger-termin-header">
                <span class="ueberfaelliger-termin-kunde">${this.escapeHtml(termin.kunde_name || 'Unbekannt')} ${grundBadge}</span>
                <span class="ueberfaelliger-termin-datum">🕐 Richtzeit: ${richtzeit}</span>
              </div>
              <div class="ueberfaelliger-termin-details">
                <span class="ueberfaelliger-termin-kennzeichen">${this.escapeHtml(termin.kennzeichen || '')}</span>
                <span class="ueberfaelliger-termin-arbeiten">${this.escapeHtml(termin.arbeiten || 'Keine Arbeiten')}</span>
              </div>
            </div>
            <div class="ueberfaelliger-termin-actions">
              <button class="btn btn-einplanen" onclick="app.neuEinplanenUeberfaelligenTermin(${termin.id})" title="Einplanen">
                📅 Einplanen
              </button>
              <button class="btn btn-abschliessen" onclick="app.abschliessenUnterbrochenenAuftrag(${termin.id})" title="Als abgeschlossen markieren">
                ✅ Abschließen
              </button>
              <button class="btn btn-sm" onclick="app.unterbrocheneRichtzeitAnpassen(${termin.id}, ${termin.geschaetzte_zeit || 30})" title="Richtzeit anpassen" style="background:#f0f0f0;border:none;cursor:pointer;padding:4px 8px;border-radius:4px;">
                ✏️ Richtzeit
              </button>
              <button class="btn btn-loeschen" onclick="app.loeschenUnterbrochenenAuftrag(${termin.id})" title="In den Papierkorb verschieben" style="background:#fdecea;color:#c0392b;border:none;cursor:pointer;padding:4px 8px;border-radius:4px;">
                🗑️ Löschen
              </button>
              <button class="btn btn-details" onclick="app.showTerminDetails(${termin.id})" title="Details">
                🔍
              </button>
            </div>
          `;
          container.appendChild(card);
        });
      } catch (error) {
        console.error('Fehler beim Laden unterbrochener Aufträge:', error);
        container.innerHTML = '<div class="empty-state">Fehler beim Laden</div>';
      }
    },

    async unterbrocheneRichtzeitAnpassen(terminId, aktuelleMin) {
      const eingabe = prompt(`Neue Richtzeit in Minuten (aktuell: ${aktuelleMin} min):`, aktuelleMin);
      if (!eingabe || isNaN(parseInt(eingabe))) return;
      const neueMin = Math.max(1, parseInt(eingabe));
      try {
        await ApiService.put(`/termine/${terminId}`, { geschaetzte_zeit: neueMin });
        await this.loadUnterbrocheneAuftraege();
      } catch (e) {
        alert('Fehler beim Aktualisieren der Richtzeit.');
      }
    },

    async abschliessenUnterbrochenenAuftrag(terminId) {
      if (!confirm('Unterbrochenen Auftrag als abgeschlossen markieren?')) return;
      try {
        await ApiService.put(`/termine/${terminId}`, { status: 'abgeschlossen' });
        this.showToast('✅ Auftrag abgeschlossen', 'success');
        await this.loadUnterbrocheneAuftraege();
        this.loadTermine();
      } catch (error) {
        console.error('Fehler beim Abschließen des unterbrochenen Auftrags:', error);
        this.showToast('Fehler beim Abschließen: ' + (error.message || 'Unbekannt'), 'error');
      }
    },

    async loeschenUnterbrochenenAuftrag(terminId) {
      if (!confirm('Unterbrochenen Auftrag wirklich löschen (in den Papierkorb verschieben)?')) return;
      try {
        await ApiService.delete(`/termine/${terminId}`);
        this.showToast('🗑️ Auftrag in den Papierkorb verschoben', 'success');
        await this.loadUnterbrocheneAuftraege();
        this.loadTermine();
      } catch (error) {
        console.error('Fehler beim Löschen des unterbrochenen Auftrags:', error);
        this.showToast('Fehler beim Löschen: ' + (error.message || 'Unbekannt'), 'error');
      }
    },

    async zeitkorrekturPauseSplit(terminId, aktuelleMin) {
      const eingabe = prompt(`Gearbeitete Zeit korrigieren (aktuell: ${aktuelleMin} min):`, aktuelleMin);
      if (!eingabe || isNaN(parseInt(eingabe))) return;
      const neueMin = Math.max(1, parseInt(eingabe));
      try {
        await ApiService.put(`/termine/${terminId}`, {
          tatsaechliche_zeit: neueMin,
          geschaetzte_zeit: neueMin
        });
        await this.loadZeitstempelung();
      } catch (e) {
        alert('Fehler beim Korrigieren der Zeit.');
      }
    },

    async loadUeberfaelligeTermine() {
      const container = document.getElementById('ueberfaelligeTermineContainer');
      const countBadge = document.getElementById('ueberfaelligeCount');
      
      if (!container) return;
      
      try {
        // Aktuelles Datum (heute)
        const heute = this.formatDateLocal(this.getToday());
        
        // Alle Termine laden
        const termine = await ApiService.get('/termine');
        
        // Filtere überfällige Termine:
        // - Datum liegt vor heute
        // - Status ist NICHT abgeschlossen, abgeholt oder storniert
        // - Nicht gelöscht
        const ueberfaellig = termine.filter(t => {
          const terminDatum = t.datum;
          const istVergangen = terminDatum < heute;
          const nichtAbgeschlossen = !['abgeschlossen', 'abgeholt', 'storniert'].includes(t.status);
          const nichtGeloescht = !t.geloescht;
          
          return istVergangen && nichtAbgeschlossen && nichtGeloescht;
        });
        
        // Nach Datum sortieren (älteste zuerst)
        ueberfaellig.sort((a, b) => a.datum.localeCompare(b.datum));
        
        // Cache für spätere Verwendung
        this._ueberfaelligeTermineCache = ueberfaellig;
        
        // Counter aktualisieren
        if (countBadge) {
          countBadge.textContent = `${ueberfaellig.length} Termin${ueberfaellig.length !== 1 ? 'e' : ''}`;
        }
        
        // Rendern
        this.renderUeberfaelligeTermine(ueberfaellig, container);
        
      } catch (error) {
        console.error('Fehler beim Laden überfälliger Termine:', error);
        container.innerHTML = '<div class="empty-state">Fehler beim Laden</div>';
      }
    },

    renderUeberfaelligeTermine(termine, container) {
      if (!container) return;
      
      container.innerHTML = '';
      
      if (!termine || termine.length === 0) {
        container.innerHTML = '<div class="empty-state">✅ Keine überfälligen Termine</div>';
        return;
      }
      
      const heute = this.getToday();
      
      termine.forEach(termin => {
        const card = document.createElement('div');
        card.className = 'ueberfaelliger-termin';
        card.dataset.terminId = termin.id;
        
        // Tage überfällig berechnen
        const terminDatum = new Date(termin.datum + 'T12:00:00');
        const diffTime = heute - terminDatum;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        // Arbeiten kürzen
        const arbeiten = termin.arbeiten ? 
          (termin.arbeiten.length > 50 ? termin.arbeiten.substring(0, 50) + '...' : termin.arbeiten) : 
          'Keine Arbeiten';
        
        // Datum formatieren
        const datumFormatiert = new Date(termin.datum + 'T12:00:00').toLocaleDateString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit'
        });
        
        card.innerHTML = `
          <div class="ueberfaelliger-termin-info">
            <div class="ueberfaelliger-termin-header">
              <span class="ueberfaelliger-termin-kunde">${termin.kunde_name || 'Unbekannt'}</span>
              <span class="ueberfaelliger-termin-datum">📅 ${datumFormatiert} (${diffDays} Tag${diffDays !== 1 ? 'e' : ''} überfällig)</span>
            </div>
            <div class="ueberfaelliger-termin-details">
              <span class="ueberfaelliger-termin-kennzeichen">${termin.kennzeichen || ''}</span>
              <span class="ueberfaelliger-termin-arbeiten">${arbeiten}</span>
            </div>
          </div>
          <div class="ueberfaelliger-termin-actions">
            <button class="btn btn-abschliessen" onclick="app.abschliessenUeberfaelligenTermin(${termin.id})" title="Als abgeschlossen markieren">
              ✅ Abschließen
            </button>
            <button class="btn btn-einplanen" onclick="app.neuEinplanenUeberfaelligenTermin(${termin.id})" title="Auf heute oder anderes Datum neu einplanen">
              📅 Neu einplanen
            </button>
            <button class="btn btn-details" onclick="app.showTerminDetails(${termin.id})" title="Details anzeigen">
              🔍
            </button>
          </div>
        `;
        
        container.appendChild(card);
      });
    },

    async abschliessenUeberfaelligenTermin(terminId) {
      if (!confirm('Termin als abgeschlossen markieren?')) return;
      
      try {
        await ApiService.put(`/termine/${terminId}`, { status: 'abgeschlossen' });
        
        this.showToast('✅ Termin abgeschlossen', 'success');
        
        // Überfällige Termine neu laden
        this.loadUeberfaelligeTermine();
        
        // Auch andere Listen aktualisieren
        this.loadTermine();
        
      } catch (error) {
        console.error('Fehler beim Abschließen:', error);
        this.showToast('Fehler beim Abschließen: ' + (error.message || 'Unbekannt'), 'error');
      }
    },

    neuEinplanenUeberfaelligenTermin(terminId) {
      // Termin aus Cache holen
      const termin = this._ueberfaelligeTermineCache?.find(t => t.id === terminId);
      if (!termin) {
        this.showToast('Termin nicht gefunden', 'error');
        return;
      }
      
      // Termin-ID merken für späteren Zugriff
      this._neuEinplanenTerminId = terminId;
      
      // Modal-Felder füllen
      document.getElementById('neuEinplanenKunde').textContent = termin.kunde_name || 'Unbekannt';
      document.getElementById('neuEinplanenKennzeichen').textContent = termin.kennzeichen || '';
      document.getElementById('neuEinplanenArbeiten').textContent = termin.arbeiten ? 
        (termin.arbeiten.length > 40 ? termin.arbeiten.substring(0, 40) + '...' : termin.arbeiten) : 
        'Keine Arbeiten';
      document.getElementById('neuEinplanenAltDatum').textContent = 
        new Date(termin.datum + 'T12:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
        });
      
      // Datum auf heute setzen
      const heute = this.formatDateLocal(this.getToday());
      document.getElementById('neuEinplanenDatum').value = heute;
      document.getElementById('neuEinplanenDatum').min = heute;
      document.getElementById('neuEinplanenStatusReset').checked = true;
      
      // Modal anzeigen
      document.getElementById('neuEinplanenModal').style.display = 'flex';
    },

    closeNeuEinplanenModal() {
      document.getElementById('neuEinplanenModal').style.display = 'none';
      this._neuEinplanenTerminId = null;
    },

    setNeuEinplanenDatum(auswahl) {
      const datumInput = document.getElementById('neuEinplanenDatum');
      const heute = this.getToday();
      
      let neuesDatum;
      switch (auswahl) {
        case 'heute':
          neuesDatum = heute;
          break;
        case 'morgen':
          neuesDatum = new Date(heute);
          neuesDatum.setDate(neuesDatum.getDate() + 1);
          break;
        case 'naechsteWoche':
          neuesDatum = new Date(heute);
          // Zum nächsten Montag
          const tagBisMonatg = (8 - neuesDatum.getDay()) % 7 || 7;
          neuesDatum.setDate(neuesDatum.getDate() + tagBisMonatg);
          break;
        default:
          return;
      }
      
      datumInput.value = this.formatDateLocal(neuesDatum);
    },

    async confirmNeuEinplanen() {
      const terminId = this._neuEinplanenTerminId;
      if (!terminId) {
        this.showToast('Kein Termin ausgewählt', 'error');
        return;
      }
      
      const neuesDatum = document.getElementById('neuEinplanenDatum').value;
      const statusReset = document.getElementById('neuEinplanenStatusReset').checked;
      // Checkbox 'neuEinplanenAlsNichtZugeordnet' - wenn checked, Mitarbeiter-Zuweisung entfernen
      const alsNichtZugeordnet = document.getElementById('neuEinplanenAlsNichtZugeordnet')?.checked ?? true;
      
      if (!neuesDatum) {
        this.showToast('Bitte ein Datum auswählen', 'warning');
        return;
      }
      
      try {
        // WICHTIG: ist_schwebend MUSS 0 sein, damit der Termin in 'Nicht zugeordnet' erscheint (nicht in 'Schwebende Termine')
        const updateData = { 
          datum: neuesDatum,
          ist_schwebend: 0,  // EXPLIZIT 0 = NICHT schwebend, sondern festes Datum
          startzeit: null    // Startzeit zurücksetzen für Neuplanung
        };
        
        // Wenn 'Nicht zugeordnet' gewählt, Mitarbeiter-Zuweisung komplett entfernen
        if (alsNichtZugeordnet) {
          updateData.mitarbeiter_id = null;
          updateData.arbeitszeiten_details = null;
        }
        if (statusReset) {
          updateData.status = 'offen';
        }
        
        console.log('Neu-Einplanen updateData:', updateData);
        
        await ApiService.put(`/termine/${terminId}`, updateData);
        
        const datumFormatiert = new Date(neuesDatum + 'T12:00:00').toLocaleDateString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit'
        });
        
        const zielText = alsNichtZugeordnet ? ' → 📋 Nicht zugeordnet' : '';
        this.showToast(`📅 Termin auf ${datumFormatiert} verschoben${zielText}`, 'success');
        
        // Modal schließen
        this.closeNeuEinplanenModal();
        
        // Listen aktualisieren
        this.loadUeberfaelligeTermine();
        this.loadTermine();
        
        // Planung & Zuweisung Ansicht immer aktualisieren (schwebende Termine sind global)
        const datumInput = document.getElementById('auslastungDragDropDatum');
        if (datumInput) {
          this.loadAuslastungDragDrop();
        }
        
      } catch (error) {
        console.error('Fehler beim Neu-Einplanen:', error);
        this.showToast('Fehler beim Neu-Einplanen: ' + (error.message || 'Unbekannt'), 'error');
      }
    },

    updatePlanungAuslastungsbalken(auslastungData, mitarbeiterListe, lehrlingeListe) {
      const prozentElement = document.getElementById('planungAuslastungProzent');
      const fillElement = document.getElementById('planungAuslastungFill');
      const minutenElement = document.getElementById('planungAuslastungMinuten');
      
      if (!prozentElement || !fillElement || !minutenElement) return;
      
      // Verwende dieselbe Berechnung wie in der Auslastungs-Ansicht
      // Die Werte kommen direkt vom Backend (inkl. Nebenzeit-Berechnung)
      let prozent = 0;
      let belegtMinuten = 0;
      let gesamtKapazitaet = 0;
      
      if (auslastungData) {
        // Verwende die vom Backend berechneten Werte (konsistent mit Auslastungs-Tab)
        prozent = auslastungData.auslastung_prozent || 0;
        belegtMinuten = auslastungData.belegt_minuten_mit_service || auslastungData.belegt_minuten || 0;
        gesamtKapazitaet = auslastungData.gesamt_minuten || 0;
      }
      
      // Falls keine Backend-Daten, berechne aus Mitarbeiter-Listen (Fallback)
      if (gesamtKapazitaet === 0) {
        if (mitarbeiterListe && mitarbeiterListe.length > 0) {
          mitarbeiterListe.forEach(ma => {
            gesamtKapazitaet += (ma.arbeitsstunden_pro_tag || 8) * 60;
          });
        }
        if (lehrlingeListe && lehrlingeListe.length > 0) {
          lehrlingeListe.forEach(lehrling => {
            gesamtKapazitaet += (lehrling.arbeitsstunden_pro_tag || 8) * 60;
          });
        }
      }
      
      const prozentCapped = Math.min(prozent, 100); // Maximal 100% für Balkenbreite
      
      // Auslastungs-Klasse bestimmen (gleiche Schwellwerte wie Auslastungs-Tab)
      let auslastungKlasse = 'auslastung-niedrig';
      if (prozent > 100) {
        auslastungKlasse = 'auslastung-hoch';
      } else if (prozent > 80) {
        auslastungKlasse = 'auslastung-mittel';
      }
      
      // UI aktualisieren
      prozentElement.textContent = `${Math.round(prozent)}%`;
      prozentElement.className = auslastungKlasse;
      
      fillElement.style.width = `${prozentCapped}%`;
      fillElement.className = `planung-auslastung-fill ${auslastungKlasse}`;
      
      // Stunden/Minuten formatieren
      const belegtStunden = Math.floor(belegtMinuten / 60);
      const belegtRestMinuten = Math.round(belegtMinuten % 60);
      const kapazitaetStunden = Math.floor(gesamtKapazitaet / 60);
      const kapazitaetRestMinuten = Math.round(gesamtKapazitaet % 60);
      
      const belegtText = belegtStunden > 0 
        ? `${belegtStunden}h ${belegtRestMinuten > 0 ? belegtRestMinuten + 'min' : ''}`.trim()
        : `${belegtRestMinuten}min`;
      const kapazitaetText = kapazitaetStunden > 0 
        ? `${kapazitaetStunden}h ${kapazitaetRestMinuten > 0 ? kapazitaetRestMinuten + 'min' : ''}`.trim()
        : `${gesamtKapazitaet}min`;
      
      minutenElement.textContent = `${belegtText} / ${kapazitaetText} belegt`;
    },

    getTerminDringlichkeit(termin) {
      // Prüfe ob explizite Dringlichkeit gesetzt ist
      if (termin.dringlichkeit) {
        return termin.dringlichkeit.toLowerCase();
      }
      
      // Berechne basierend auf Abholzeit
      if (termin.abhol_datum) {
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
        const abholDatum = new Date(termin.abhol_datum);
        abholDatum.setHours(0, 0, 0, 0);
        
        const tageUntilAbhol = Math.ceil((abholDatum - heute) / (1000 * 60 * 60 * 24));
        
        if (tageUntilAbhol <= 0) return 'hoch';      // Überfällig oder heute
        if (tageUntilAbhol <= 1) return 'mittel';    // Morgen
        if (tageUntilAbhol <= 3) return 'normal';    // 2-3 Tage
        return 'niedrig';                            // Mehr als 3 Tage
      }
      
      return 'normal';
    },

    createSchwebenderTerminBar(termin) {
      const bar = document.createElement('div');
      
      // Dauer berechnen
      const dauer = this.getTerminGesamtdauer(termin);
      const dringlichkeit = this.getTerminDringlichkeit(termin);
      
      bar.className = `schwebender-termin-bar dringlichkeit-${dringlichkeit}`;
      bar.draggable = true;
      bar.id = `schwebend-bar-${termin.id}`;
      
      // CSS Custom Property für dynamische Breite
      bar.style.setProperty('--termin-dauer', dauer);
      
      // Tooltip-Daten erstellen
      const dauerText = dauer >= 60 
        ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
        : `${dauer} min`;
      
      const abholInfo = termin.abholung_datum 
        ? `Abholung: ${this.formatDatum(termin.abholung_datum)}` 
        : (termin.abhol_datum ? `Abholung: ${this.formatDatum(termin.abhol_datum)}` : 'Keine Abholzeit');
      
      // Übertrag-Kennzeichnung
      const istUebertrag = !!termin._istUebertrag;
      if (istUebertrag) bar.classList.add('bar-uebertrag');

      // Bring/Abholzeit für Anzeige
      const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
      const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
      const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
      
      const tooltip = [
        `🚗 ${termin.kennzeichen || 'Kein KFZ'}`,
        `👤 ${termin.kunde_name || 'Unbekannt'}`,
        `⏱️ Dauer: ${dauerText}`,
        termin.bring_zeit ? `🚗↓ Bringzeit: ${termin.bring_zeit}` : '',
        termin.abholung_zeit ? `🚗↑ Abholzeit: ${termin.abholung_zeit}` : '',
        `📅 ${abholInfo}`,
        istUebertrag ? `⚠️ Geplant für: ${this.formatDatum(termin.datum)} – noch nicht zugeordnet!` : '',
        `📋 ${this.getTerminArbeitenText(termin)}`
      ].filter(t => t).join('\n');
      
      bar.setAttribute('data-tooltip', tooltip);
      bar.dataset.terminId = termin.id;
      bar.dataset.dauer = dauer;
      bar.dataset.dringlichkeit = dringlichkeit;
      
      // Priorität Badge erstellen
      const prioritaet = termin.schwebend_prioritaet || 'mittel';
      const prioritaetBadges = {
        'hoch': '<span class="prioritaet-badge prioritaet-badge-hoch" title="Hohe Priorität">🔴</span>',
        'mittel': '<span class="prioritaet-badge prioritaet-badge-mittel" title="Mittlere Priorität">🟡</span>',
        'niedrig': '<span class="prioritaet-badge prioritaet-badge-niedrig" title="Niedrige Priorität">🟢</span>'
      };
      const prioritaetBadge = prioritaetBadges[prioritaet] || prioritaetBadges['mittel'];

      // Übertrag-Badge
      const uebertragBadge = istUebertrag
        ? `<span class="bar-uebertrag-badge" title="Übertrag – geplant für ${this.formatDatum(termin.datum)}, Abholung ${this.formatDatum(termin.abholung_datum)}">📅 ${this.formatDatum(termin.datum)}</span>`
        : '';
      const vorschauBadge = termin._istVorschau
        ? `<span class="bar-uebertrag-badge" style="background:#1565c0;" title="Termin von morgen – wird bei Zuweisung auf heute verschoben">📅 ${this.formatDatum(termin.datum)}</span>`
        : '';
      
      // Intern-Termin-Erkennung und Arbeit-Text
      const istInternTermin = termin.abholung_details === 'Interner Termin';
      const arbeitText = this.getTerminArbeitenText(termin);

      // Inhalt des Balkens
      bar.innerHTML = `
        <div class="bar-header">${prioritaetBadge} ${termin.termin_nr || 'Neu'} • ${istInternTermin ? '🔧 Intern' : (termin.kennzeichen || '')} ${uebertragBadge}${vorschauBadge}</div>
        <div class="bar-details">${istInternTermin ? this.escapeHtml(arbeitText) : (termin.kunde_name || 'Unbekannt')}</div>
        ${istInternTermin && termin.kennzeichen && termin.kennzeichen !== 'INTERN' ? `<div class="bar-details" style="font-size:0.8em;opacity:0.8;">📋 ${this.escapeHtml(termin.kennzeichen)}</div>` : ''}
        <div class="bar-zeit">⏱️ ${dauerText}</div>
        ${zeitenInfo ? `<div class="bar-zeiten">${zeitenInfo}</div>` : ''}
        ${istUebertrag ? `<div class="bar-abholung-deadline">🏁 Abholung: ${this.formatDatum(termin.abholung_datum)}</div>` : ''}
        ${termin._nichtZugeordnet
          ? `<button class="btn-einplanen" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})" title="Termin-Details anzeigen – Mitarbeiter über Ziehen zuweisen">👤 Mitarbeiter zuweisen</button>`
          : `<button class="btn-einplanen" onclick="event.stopPropagation(); app.einplanenSchwebenderTermin(${termin.id})" title="In aktuellen Tag einplanen">📅 Einplanen</button>`
        }
      `;
      
      // Drag Events
      bar.addEventListener('dragstart', (e) => {
        bar.classList.add('dragging');
        e.dataTransfer.setData('text/plain', termin.id);
        e.dataTransfer.setData('application/x-dauer', dauer.toString());
        e.dataTransfer.setData('application/x-schwebend', 'true');
        e.dataTransfer.effectAllowed = 'move';
        
        // Zeit-Indikator erstellen
        this.createDragTimeIndicator();
      });

      bar.addEventListener('dragend', () => {
        bar.classList.remove('dragging');
        document.querySelectorAll('.drop-zone').forEach(zone => zone.classList.remove('drag-over'));
        // Zeit-Indikator entfernen
        this.removeDragTimeIndicator();
      });
      
      // Doppelklick zum Bearbeiten
      bar.addEventListener('dblclick', () => {
        // Wechsle zum Termine-Tab und öffne das Formular (mit display toggle)
        const contents = this.tabCache.contents || document.querySelectorAll('.tab-content');
        for (let i = 0; i < contents.length; i++) {
          contents[i].style.display = 'none';
          contents[i].classList.remove('active');
        }
        const buttons = this.tabCache.buttons || document.querySelectorAll('.tab-button');
        for (let i = 0; i < buttons.length; i++) {
          buttons[i].classList.remove('active');
        }

        const termineTab = this.getCachedElement('termine');
        const termineTabButton = document.querySelector('.tab-button[data-tab="termine"]');

        if (termineTab && termineTabButton) {
          termineTab.style.display = 'block';
          termineTab.classList.add('active');
          termineTabButton.classList.add('active');

          // Zum "Neuer Termin" Sub-Tab wechseln
          termineTab.querySelectorAll('.sub-tab-content').forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
          });
          termineTab.querySelectorAll('.sub-tab-button').forEach(btn => {
            btn.classList.remove('active');
          });

          const neuerTerminContent = this.getCachedElement('neuerTermin');
          const neuerTerminButton = termineTab.querySelector('.sub-tab-button[data-subtab="neuerTermin"]');

          if (neuerTerminContent && neuerTerminButton) {
            neuerTerminContent.style.display = 'block';
            neuerTerminContent.classList.add('active');
            neuerTerminButton.classList.add('active');
          }
        }

        this.loadTerminInForm(termin.id);
      });

      // Shift+Click für schnellen Status-Wechsel, normaler Click für Details
      bar.addEventListener('click', (e) => {
        // Ignoriere Klicks auf den Einplanen-Button
        if (e.target.closest('.btn-einplanen')) {
          return;
        }
        
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          const aktuellerTermin = this.termineById[termin.id] || termin;
          const startzeit = termin.startzeit || termin.bring_zeit || '08:00';
          this.showSchnellStatusDialog(aktuellerTermin, bar, startzeit, dauer);
        } else {
          // Normaler Klick - Details anzeigen
          e.stopPropagation();
          this.showTerminDetails(termin.id);
        }
      });

      return bar;
    },

    async einplanenSchwebenderTermin(terminId) {
      // Termin-Daten laden - erst aus Cache, dann vom Server
      let termin = this.termineById[terminId];
      
      if (!termin) {
        // Termin nicht im Cache - direkt vom Server laden
        try {
          termin = await TermineService.getById(terminId);
          if (termin) {
            // In Cache speichern
            this.termineById[terminId] = termin;
          }
        } catch (error) {
          console.error('Fehler beim Laden des Termins:', error);
        }
      }
      
      if (!termin) {
        console.error('Termin nicht gefunden:', terminId);
        alert('Termin konnte nicht geladen werden. Bitte Seite neu laden.');
        return;
      }
      
      // Termin-ID speichern
      this.schwebendEinplanenTerminId = terminId;
      
      // Modal-Felder befüllen
      document.getElementById('schwebendEinplanenKunde').textContent = termin.kunde_name || 'Unbekannt';
      document.getElementById('schwebendEinplanenKennzeichen').textContent = termin.kennzeichen || '-';
      document.getElementById('schwebendEinplanenArbeiten').textContent = termin.arbeit || this.getTerminArbeitenText(termin) || '-';
      
      // Datum aus dem aktuellen Datumsfeld übernehmen
      const datumInput = document.getElementById('auslastungDragDropDatum');
      const datum = datumInput?.value || new Date().toISOString().split('T')[0];
      document.getElementById('schwebendEinplanenDatum').value = datum;
      
      // Checkbox standardmäßig aktiviert = Termin bleibt in "Nicht zugeordnet"
      document.getElementById('schwebendEinplanenAlsSchwebend').checked = true;
      
      // Modal anzeigen
      document.getElementById('schwebendEinplanenModal').style.display = 'flex';
    },

    closeSchwebendEinplanenModal() {
      document.getElementById('schwebendEinplanenModal').style.display = 'none';
      this.schwebendEinplanenTerminId = null;
    },

    setSchwebendEinplanenDatum(option) {
      const heute = new Date();
      let datum;
      
      switch(option) {
        case 'heute':
          datum = heute;
          break;
        case 'morgen':
          datum = new Date(heute);
          datum.setDate(datum.getDate() + 1);
          break;
        case 'naechsteWoche':
          datum = new Date(heute);
          datum.setDate(datum.getDate() + 7);
          break;
        default:
          datum = heute;
      }
      
      document.getElementById('schwebendEinplanenDatum').value = datum.toISOString().split('T')[0];
    },

    async confirmSchwebendEinplanen() {
      const terminId = this.schwebendEinplanenTerminId;
      if (!terminId) return;
      
      const datum = document.getElementById('schwebendEinplanenDatum').value;
      if (!datum) {
        alert('Bitte wählen Sie ein Datum aus.');
        return;
      }
      
      const inNichtZugeordnet = document.getElementById('schwebendEinplanenAlsSchwebend').checked;
      
      console.log('=== SCHWEBEND EINPLANEN START ===');
      console.log('TerminID:', terminId);
      console.log('Datum:', datum);
      console.log('inNichtZugeordnet:', inNichtZugeordnet);
      
      try {
        // Aktuellen Termin laden um zu prüfen ob er wirklich schwebend ist
        const aktuellerTermin = await TermineService.getById(terminId);
        const istWirklichSchwebend = aktuellerTermin && (aktuellerTermin.ist_schwebend === 1 || aktuellerTermin.ist_schwebend === true);

        const updateData = {
          datum: datum,
          ist_schwebend: 0,  // Termin ist nicht mehr schwebend - festes Datum
          mitarbeiter_id: null  // IMMER Mitarbeiter entfernen = "Nicht zugeordnet"
        };

        // Arbeitszeiten-Details nur bei wirklich schwebenden Terminen zurücksetzen
        // (sie enthalten evtl. Lehrling-Zuordnung die entfernt werden soll).
        // Nicht-zugeordnete Tages-Termine (nichtZugeordnet) behalten ihre Details!
        if (istWirklichSchwebend) {
          updateData.arbeitszeiten_details = null;
        }
        
        console.log('Schwebend-Einplanen updateData:', updateData, '| istWirklichSchwebend:', istWirklichSchwebend);
        console.log('Sende API-Request an:', `/termine/${terminId}`);
        
        const result = await TermineService.update(terminId, updateData);
        console.log('API-Response:', result);
        
        this.showToast(`📅 Termin für ${this.formatDatum(datum)} eingeplant → 📋 Nicht zugeordnet`, 'success');
        
        // Modal schließen
        this.closeSchwebendEinplanenModal();
        
        // Ansicht neu laden
        this.loadAuslastungDragDrop();
      } catch (error) {
        console.error('Fehler beim Einplanen des Termins:', error);
        alert('Fehler beim Einplanen. Bitte erneut versuchen.');
      }
    },

    getTerminArbeitenText(termin) {
      let details = null;
      if (termin.arbeitszeiten_details) {
        try {
          details = typeof termin.arbeitszeiten_details === 'string' 
            ? JSON.parse(termin.arbeitszeiten_details) 
            : termin.arbeitszeiten_details;
        } catch (e) {
          return termin.arbeit || 'Keine Arbeit';
        }
      }
      
      if (!details) {
        return termin.arbeit || 'Keine Arbeit';
      }
      
      const arbeiten = [];
      for (const key in details) {
        if (key.startsWith('_')) continue;
        arbeiten.push(key);
      }
      
      if (arbeiten.length === 0) {
        return termin.arbeit || 'Keine Arbeit';
      }
      
      if (arbeiten.length <= 2) {
        return arbeiten.join(', ');
      }
      
      return `${arbeiten.slice(0, 2).join(', ')} +${arbeiten.length - 2}`;
    },

    getArbeitZuordnung(arbeit, details, termin) {
      // Zuerst: Eigene Zuordnung der Arbeit prüfen
      if (arbeit.type === 'lehrling' && (arbeit.lehrling_id || arbeit.mitarbeiter_id)) {
        return { type: 'lehrling', id: arbeit.lehrling_id || arbeit.mitarbeiter_id };
      }
      if (arbeit.mitarbeiter_id) {
        return { type: arbeit.type || 'mitarbeiter', id: arbeit.mitarbeiter_id };
      }
      
      // Fallback: _gesamt_mitarbeiter_id (ganzer Termin zugewiesen)
      if (details && details._gesamt_mitarbeiter_id) {
        return { 
          type: details._gesamt_mitarbeiter_id.type, 
          id: details._gesamt_mitarbeiter_id.id 
        };
      }

      // Fallback: termin.mitarbeiter_id
      if (termin.mitarbeiter_id) {
        return { type: 'mitarbeiter', id: termin.mitarbeiter_id };
      }
      
      return { type: null, id: null };
    },

    createArbeitBlockElement(termin, arbeit, startHour, endHour, pauseStart, type = 'mitarbeiter') {
      const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
      const istAbgeschlossen = arbeit.abgeschlossen === true;
      
      // Startzeit parsen (normalizeZeit wandelt HHMM → HH:MM)
      let startzeit = this.normalizeZeit(termin.startzeit || '08:00');
      const [startH, startM] = startzeit.split(':').map(Number);
      
      // Dauer: _arbeitDauer (vom Aufrufer vorberechnet, z.B. proportional für abgeschlossen) hat höchste Priorität,
      // dann per-Arbeit tatsaechliche_zeit, schließlich geplante Zeit
      const dauer = parseInt(termin._arbeitDauer) > 0
        ? parseInt(termin._arbeitDauer)
        : (parseInt(arbeit.tatsaechliche_zeit) > 0
            ? parseInt(arbeit.tatsaechliche_zeit)
            : (parseInt(arbeit.zeit) || 30));
      
      // Nebenzeit-Aufschlag
      const nebenzeitProzent = this._planungNebenzeitProzent || 0;
      const dauerMitNebenzeit = nebenzeitProzent > 0 
        ? Math.round(dauer * (1 + nebenzeitProzent / 100)) 
        : dauer;
      
      // Position berechnen (100px pro Stunde)
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      const startMinutesFromDayStart = (startH - startHour) * 60 + startM;
      
      // DEBUG für problematische Termine
      if (termin.termin_nr && termin.termin_nr.includes('2026-070')) {
        console.log(`[DEBUG createArbeitBlockElement] ${termin.termin_nr} - ${arbeit.name}:`, {
          startzeit,
          startH,
          startM,
          startHour,
          endHour,
          dauer,
          pauseStart,
          checkAusserhalb: startH < startHour || startH > endHour
        });
      }
      
      // Außerhalb des sichtbaren Bereichs?
      if (startH < startHour || startH > endHour) {
        if (termin.termin_nr && termin.termin_nr.includes('2026-070')) {
          console.warn(`[DEBUG] ${termin.termin_nr} - ${arbeit.name} - AUSSERHALB des Bereichs (${startHour}-${endHour})`);
        }
        return null;
      }
      
      // === PAUSE-SPLIT-LOGIK ===
      const startMinutes = startH * 60 + startM;
      const endMinutes = startMinutes + dauerMitNebenzeit;
      
      // Prüfe ob Arbeitsblock über Pause geht
      let pauseStartMinutes = null;
      let pauseEndMinutes = null;
      const pauseDauer = 30; // Standard Pausendauer
      
      if (pauseStart) {
        if (typeof pauseStart === 'string') {
          const [pH, pM] = pauseStart.split(':').map(Number);
          pauseStartMinutes = pH * 60 + pM;
          pauseEndMinutes = pauseStartMinutes + pauseDauer;
        } else if (typeof pauseStart === 'number') {
          pauseStartMinutes = pauseStart;
          pauseEndMinutes = pauseStartMinutes + pauseDauer;
        }
      }
      
      const ueberschneidetPause = pauseStartMinutes !== null && 
        startMinutes < pauseStartMinutes && endMinutes > pauseStartMinutes;
      
      if (ueberschneidetPause) {
        // Teil 1: Bis zur Pause
        const teil1Dauer = pauseStartMinutes - startMinutes;
        if (teil1Dauer <= 0) {
          if (termin.termin_nr && termin.termin_nr.includes('2026-070')) {
            console.warn(`[DEBUG] ${termin.termin_nr} - ${arbeit.name} - Startet IN/NACH Pause (teil1Dauer: ${teil1Dauer})`);
          }
          return null; // Startet in oder nach der Pause (Sicherheits-Guard)
        }
        
        const leftPx = startMinutesFromDayStart * pixelPerMinute;
        const widthPx = Math.max(teil1Dauer * pixelPerMinute, 40);
        
        const teil1DauerText = teil1Dauer >= 60 
          ? `${Math.floor(teil1Dauer/60)}h ${teil1Dauer%60 > 0 ? (teil1Dauer%60) + 'min' : ''}`.trim()
          : `${teil1Dauer} min`;
        
        // Erstelle Teil 1
        const div = document.createElement('div');
        const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
        div.className = 'timeline-termin arbeit-block' + statusClass + (isSchwebend ? ' schwebend' : '') + (istAbgeschlossen ? ' arbeit-abgeschlossen' : '');
        div.id = `timeline-arbeit-${termin.id}-${termin._arbeitIndex}`;
        div.dataset.terminId = termin.id;
        div.dataset.arbeitName = arbeit.name;
        div.dataset.arbeitIndex = termin._arbeitIndex;
        div.dataset.dauer = dauerMitNebenzeit;
        div.dataset.originalDauer = dauer;
        div.draggable = true;
        div.style.left = `${leftPx}px`;
        div.style.width = `${widthPx}px`;
        
        const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
        const colorIndex = termin._arbeitIndex % colors.length;
        div.style.borderLeft = `4px solid ${colors[colorIndex]}`;
        
        div.innerHTML = `
          <div class="termin-title">${termin.termin_nr || 'Neu'}${istAbgeschlossen ? ' <span class="arbeit-done-badge">✓</span>' : ''}</div>
          <div class="termin-info arbeit-name">${arbeit.name}</div>
          <div class="termin-info">${teil1DauerText}</div>
        `;
        div.title = `${termin.termin_nr}\n${termin.kunde_name}\n\n📋 Arbeit: ${arbeit.name}\n⏱️ Dauer: ${teil1DauerText}\n🕐 Start: ${startzeit}${istAbgeschlossen ? '\n✅ Abgeschlossen' : ''}`;
        
        this.addDragEventsToArbeitBlock(div, termin, arbeit, startzeit, dauerMitNebenzeit);
        
        return div; // Teil 2 wird separat erstellt
      }
      
      // === NORMALER BLOCK (keine Pause-Überschneidung) ===
      const leftPx = startMinutesFromDayStart * pixelPerMinute;
      const widthPx = Math.max(dauerMitNebenzeit * pixelPerMinute, 40);
      
      const dauerText = dauerMitNebenzeit >= 60 
        ? `${Math.floor(dauerMitNebenzeit/60)}h ${dauerMitNebenzeit%60 > 0 ? (dauerMitNebenzeit%60) + 'min' : ''}`.trim()
        : `${dauerMitNebenzeit} min`;

      const div = document.createElement('div');
      const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
      div.className = 'timeline-termin arbeit-block' + statusClass + (isSchwebend ? ' schwebend' : '') + (istAbgeschlossen ? ' arbeit-abgeschlossen' : '');
      div.id = `timeline-arbeit-${termin.id}-${termin._arbeitIndex}`;
      div.dataset.terminId = termin.id;
      div.dataset.arbeitName = arbeit.name;
      div.dataset.arbeitIndex = termin._arbeitIndex;
      div.dataset.dauer = dauerMitNebenzeit;
      div.dataset.originalDauer = dauer;
      div.draggable = true;
      div.style.left = `${leftPx}px`;
      div.style.width = `${widthPx}px`;
      
      // Farbe basierend auf Arbeit-Index für visuelle Unterscheidung
      const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
      const colorIndex = termin._arbeitIndex % colors.length;
      div.style.borderLeft = `4px solid ${colors[colorIndex]}`;
      
      div.innerHTML = `
        <div class="termin-title">${termin.termin_nr || 'Neu'}${istAbgeschlossen ? ' <span class="arbeit-done-badge">✓</span>' : ''}</div>
        <div class="termin-info arbeit-name">${arbeit.name}</div>
        <div class="termin-info">${dauerText}</div>
      `;
      div.title = `${termin.termin_nr}\n${termin.kunde_name}\n\n📋 Arbeit: ${arbeit.name}\n⏱️ Dauer: ${dauerText}\n🕐 Start: ${startzeit}${istAbgeschlossen ? '\n✅ Abgeschlossen' : ''}`;
      
      this.addDragEventsToArbeitBlock(div, termin, arbeit, startzeit, dauerMitNebenzeit);
      
      return div;
    },

    createArbeitBlockFortsetzung(termin, arbeit, startzeitStr, startHour, endHour, pauseStart, type) {
      // Prüfe ob Pause-Überschneidung vorliegt
      // _arbeitDauer (vorberechnet, z.B. proportional) hat Priorität über arbeit.zeit
      const dauer = (parseInt(termin._arbeitDauer) > 0 ? parseInt(termin._arbeitDauer) : null) || arbeit.zeit || 0;
      const nebenzeitProzent = this._planungNebenzeitProzent || 0;
      const dauerMitNebenzeit = nebenzeitProzent > 0 
        ? Math.round(dauer * (1 + nebenzeitProzent / 100)) 
        : dauer;
        
      const [startHourPart, startMinutePart] = (startzeitStr || '08:00').split(':').map(Number);
      const startMinutes = startHourPart * 60 + startMinutePart;
      const endMinutes = startMinutes + dauerMitNebenzeit;
      
      // Pause parsen (gleiche Logik wie in createArbeitBlockElement)
      let pauseStartMinutes = null;
      let pauseEndMinutes = null;
      const pauseDauer = 30; // Standard Pausendauer
      
      if (pauseStart) {
        if (typeof pauseStart === 'string') {
          const [pH, pM] = pauseStart.split(':').map(Number);
          pauseStartMinutes = pH * 60 + pM;
          pauseEndMinutes = pauseStartMinutes + pauseDauer;
        } else if (typeof pauseStart === 'number') {
          pauseStartMinutes = pauseStart;
          pauseEndMinutes = pauseStartMinutes + pauseDauer;
        }
      }
      
      if (pauseStartMinutes === null) return null;

      const ueberschneidetPause = startMinutes < pauseEndMinutes && endMinutes > pauseStartMinutes;
      
      if (!ueberschneidetPause) {
        return null; // Keine Fortsetzung nötig
      }

      // === TEIL 2 (Fortsetzung) nach der Pause ===
      // Berechne verbleibende Arbeitszeit (nicht absolute Endzeit!)
      const teil1Dauer = pauseStartMinutes - startMinutes;
      const teil2Dauer = dauerMitNebenzeit - teil1Dauer; // Verbleibende Arbeitszeit
      if (teil2Dauer <= 0) return null; // Endet in der Pause
      
      const teil2StartHour = Math.floor(pauseEndMinutes / 60);
      const teil2StartMinute = pauseEndMinutes % 60;
      const teil2StartMinutesFromDayStart = (teil2StartHour - startHour) * 60 + teil2StartMinute;
      
      const pixelPerMinute = 100 / 60; // 100px pro Stunde
      const leftPx = teil2StartMinutesFromDayStart * pixelPerMinute;
      const widthPx = Math.max(teil2Dauer * pixelPerMinute, 40);
      
      const dauerText = teil2Dauer >= 60 
        ? `${Math.floor(teil2Dauer/60)}h ${teil2Dauer%60 > 0 ? (teil2Dauer%60) + 'min' : ''}`.trim()
        : `${teil2Dauer} min`;

      const div = document.createElement('div');
      const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
      div.className = 'timeline-termin arbeit-block fortsetzung' + statusClass;
      div.id = `timeline-arbeit-${termin.id}-${termin._arbeitIndex}-teil2`;
      div.dataset.terminId = termin.id;
      div.dataset.arbeitName = arbeit.name;
      div.dataset.arbeitIndex = termin._arbeitIndex;
      div.dataset.teil = '2';
      div.draggable = false; // Fortsetzungen nicht verschiebbar
      div.style.left = `${leftPx}px`;
      div.style.width = `${widthPx}px`;
      
      // Farbe basierend auf Arbeit-Index
      const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
      const colorIndex = termin._arbeitIndex % colors.length;
      div.style.borderLeft = `4px solid ${colors[colorIndex]}`;
      
      div.innerHTML = `
        <div class="termin-title">↪ ${termin.termin_nr || 'Neu'}</div>
        <div class="termin-info arbeit-name">${arbeit.name}</div>
        <div class="termin-info">${dauerText}</div>
      `;
      div.title = `${termin.termin_nr}\n${termin.kunde_name}\n\n📋 Arbeit: ${arbeit.name}\n⏱️ Fortsetzung: ${dauerText}`;
      
      return div;
    },

    addDragEventsToArbeitBlock(div, termin, arbeit, startzeit, dauer) {
      // Drag Events
      div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData('text/plain', termin.id);
        e.dataTransfer.setData('application/x-arbeit-name', arbeit.name);
        e.dataTransfer.setData('application/x-arbeit-index', termin._arbeitIndex);
        e.dataTransfer.setData('application/x-startzeit', startzeit);
        e.dataTransfer.setData('application/x-dauer', dauer);
        e.dataTransfer.setData('application/x-ist-arbeit-block', 'true');
        e.dataTransfer.effectAllowed = 'move';
        
        this.createDragTimeIndicator();
      });

      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
        this.removeDragTimeIndicator();
      });

      // Shift+Click für schnellen Status-Wechsel
      div.addEventListener('click', (e) => {
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          // Aktuellen Termin aus Cache holen (für aktuellen Status)
          const aktuellerTermin = this.termineById[termin.id] || termin;
          this.showSchnellStatusDialog(aktuellerTermin, div, startzeit, arbeit.zeit || 30, arbeit.name);
        }
      });
    },

    createArbeitMiniCard(termin, arbeit, index) {
      const card = document.createElement('div');
      card.className = 'termin-mini-card arbeit-block';
      card.draggable = true;
      card.id = `termin-arbeit-card-${termin.id}-${index}`;
      card.dataset.terminId = termin.id;
      card.dataset.arbeitName = arbeit.name;
      card.dataset.arbeitIndex = index;
      card.dataset.datum = termin.datum || '';
      
      const dauer = arbeit.zeit || 30;
      
      // Farbe basierend auf Arbeit-Index
      const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
      const colorIndex = index % colors.length;
      card.style.borderLeft = `4px solid ${colors[colorIndex]}`;
      
      // Bring/Abholzeit für Anzeige
      const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
      const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
      const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
      
      card.innerHTML = `
        <div class="mini-card-header">
          <span class="mini-card-nr">${termin.termin_nr || 'Neu'}</span>
          <span class="mini-card-kennzeichen">${termin.kennzeichen || ''}</span>
        </div>
        <div class="mini-card-kunde">${termin.kunde_name || ''}</div>
        <div class="mini-card-arbeit">${arbeit.name}</div>
        <div class="mini-card-dauer">⏱️ ${dauer} min</div>
        ${zeitenInfo ? `<div class="mini-card-zeiten">${zeitenInfo}</div>` : ''}
      `;
      
      // Tooltip mit mehr Info
      const abholzeitInfo = termin.abholung_zeit ? `\n🚗↑ Abholung: ${termin.abholung_zeit}` : '';
      const bringzeitInfo = termin.bring_zeit ? `\n🚗↓ Bringzeit: ${termin.bring_zeit}` : '';
      card.title = `${termin.termin_nr}\n${termin.kunde_name}\n📋 ${arbeit.name}\n⏱️ ${dauer} min${bringzeitInfo}${abholzeitInfo}`;

      // Drag Events
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', termin.id);
        e.dataTransfer.setData('application/x-arbeit-name', arbeit.name);
        e.dataTransfer.setData('application/x-arbeit-index', index);
        e.dataTransfer.setData('application/x-dauer', dauer);
        e.dataTransfer.setData('application/x-ist-arbeit-block', 'true');
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.drop-zone').forEach(zone => zone.classList.remove('drag-over'));
      });

      return card;
    },

    getTerminGesamtdauer(termin) {
      // Nebenzeit-Prozent aus gespeichertem Wert (wird in loadAuslastungDragDrop gesetzt)
      const nebenzeitProzent = this._planungNebenzeitProzent || 0;
      const lehrlinge = this._planungLehrlinge || [];

      // Hilfsfunktion: Finde zugeordneten Lehrling aus arbeitszeiten_details
      const findZugeordnetenLehrling = (details) => {
        if (!details) return null;

        // Prüfe _gesamt_mitarbeiter_id (Hauptzuordnung)
        if (details._gesamt_mitarbeiter_id) {
          const gesamt = details._gesamt_mitarbeiter_id;
          if (gesamt.type === 'lehrling' && gesamt.id) {
            return lehrlinge.find(l => l.id === gesamt.id);
          }
        }

        // Prüfe individuelle Zuordnungen
        for (const [key, value] of Object.entries(details)) {
          if (key.startsWith('_')) continue;
          if (typeof value === 'object' && value.type === 'lehrling') {
            const lehrlingId = value.lehrling_id || value.mitarbeiter_id;
            if (lehrlingId) {
              return lehrlinge.find(l => l.id === lehrlingId);
            }
          }
        }
        return null;
      };

      // Versuche zuerst, die Dauer aus arbeitszeiten_details zu berechnen
      let zugeordneterLehrling = null;
      if (termin.arbeitszeiten_details) {
        try {
          const details = typeof termin.arbeitszeiten_details === 'string'
            ? JSON.parse(termin.arbeitszeiten_details)
            : termin.arbeitszeiten_details;

          // Finde zugeordneten Lehrling für Aufgabenbewältigung
          zugeordneterLehrling = findZugeordnetenLehrling(details);

          // Wenn Termin läuft/abgeschlossen und tatsaechliche_zeit gesetzt: diese verwenden
          // (Termin hat länger/kürzer gedauert als geplant)
          let tatsaechlich = parseInt(termin.tatsaechliche_zeit) || 0;

          // Für abgeschlossene Termine mit fertigstellung_zeit: tatsächliche Dauer via Stempel berechnen.
          // Wenn die gemessene Zeit kürzer ist als tatsaechliche_zeit (z.B. weil Planzeit beim
          // Abschließen übernommen wurde), hat der Stempel Vorrang → verhindert falsche Pausen-Splits.
          if (termin.status === 'abgeschlossen' && termin.fertigstellung_zeit) {
            const startStr = details._startzeit || termin.startzeit || termin.bring_zeit;
            if (startStr && /^\d{1,2}:\d{2}/.test(startStr)) {
              const fertigLokal = new Date(termin.fertigstellung_zeit);
              const fertigMin = fertigLokal.getHours() * 60 + fertigLokal.getMinutes();
              const [sh, sm] = startStr.split(':').map(Number);
              const diffMin = fertigMin - (sh * 60 + sm);
              if (diffMin > 5) {
                // Nimm den kleineren Wert: Stempel ist verlässlicher wenn er kleiner ist
                tatsaechlich = tatsaechlich > 0 ? Math.min(tatsaechlich, diffMin) : diffMin;
              }
            }
          }

          if (tatsaechlich > 0 && ['in_arbeit', 'abgeschlossen'].includes(termin.status)) {
            // Bei in_arbeit: Live-Zeit (Jetzt - Start) gewinnt wenn sie größer ist als tatsaechlich.
            // So wächst der Balken automatisch über die ursprünglich geplante Zeit hinaus.
            if (termin.status === 'in_arbeit') {
              const startStr = details._startzeit || termin.startzeit || termin.bring_zeit;
              if (startStr && /^\d{1,2}:\d{2}/.test(startStr)) {
                const [sh, sm] = startStr.split(':').map(Number);
                const jetzt = new Date();
                const liveMin = jetzt.getHours() * 60 + jetzt.getMinutes() - (sh * 60 + sm);
                if (liveMin > tatsaechlich) tatsaechlich = liveMin;
              }
            }
            // Gemessene Zeit: KEINE Nebenzeit oder Lehrlings-Faktor — tatsächliche Zeit ist unveränderlich
            return Math.round(tatsaechlich);
          }

          // Wenn Termin in Arbeit: prüfe ob Live-Dauer (aktuelle Zeit − Startzeit) > geplante Dauer
          // Falls ja: Live-Dauer anzeigen (Termin läuft länger als geplant)
          if (termin.status === 'in_arbeit') {
            const startzeit = details._startzeit || termin.startzeit || termin.bring_zeit;
            if (startzeit && /^\d{1,2}:\d{2}/.test(startzeit)) {
              const [sh, sm] = startzeit.split(':').map(Number);
              const jetzt = new Date();
              const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();
              const startMin = sh * 60 + sm;
              const liveMin = jetztMin - startMin;
              if (liveMin > 0) {
                // Geplante Dauer aus Einzel-Arbeiten oder geschaetzte_zeit berechnen
                let geplanteDauer = 0;
                for (const [key, value] of Object.entries(details)) {
                  if (key.startsWith('_')) continue;
                  if (typeof value === 'number' && value > 0) geplanteDauer += value;
                  else if (typeof value === 'object' && parseInt(value.zeit) > 0) geplanteDauer += parseInt(value.zeit);
                }
                if (!geplanteDauer) geplanteDauer = parseInt(termin.geschaetzte_zeit) || 30;
                if (liveMin > geplanteDauer) {
                  // Live-Zeit: KEINE Nebenzeit oder Lehrlings-Faktor — echter Zeitverlauf
                  return Math.round(liveMin);
                }
              }
            }
          }

          // _dauer_override: explizit gesetzter Gesamtwert (z.B. via Schnell-Bearbeitung)
          // Hat höhere Priorität als Summe der Einzel-Arbeiten
          if (details._dauer_override && parseInt(details._dauer_override) > 0) {
            let d = parseInt(details._dauer_override);
            if (zugeordneterLehrling && zugeordneterLehrling.aufgabenbewaeltigung_prozent &&
                zugeordneterLehrling.aufgabenbewaeltigung_prozent !== 100) {
              d = d * (zugeordneterLehrling.aufgabenbewaeltigung_prozent / 100);
            }
            return Math.round(d);
          }

          let summe = 0;
          for (const [key, value] of Object.entries(details)) {
            // Ignoriere Meta-Felder
            if (key.startsWith('_')) continue;
            if (typeof value === 'number' && value > 0) {
              summe += value;
            } else if (typeof value === 'object' && value.zeit > 0) {
              // Einzel-Arbeit: tatsaechliche_zeit bevorzugen wenn vorhanden
              summe += parseInt(value.tatsaechliche_zeit) > 0 ? parseInt(value.tatsaechliche_zeit) : parseInt(value.zeit);
            }
          }
          if (summe > 0) {
            // 1. Nebenzeit-Aufschlag anwenden
            if (nebenzeitProzent > 0) {
              summe = summe * (1 + nebenzeitProzent / 100);
            }
            // 2. Aufgabenbewältigung für Lehrling anwenden
            if (zugeordneterLehrling && zugeordneterLehrling.aufgabenbewaeltigung_prozent &&
                zugeordneterLehrling.aufgabenbewaeltigung_prozent !== 100) {
              summe = summe * (zugeordneterLehrling.aufgabenbewaeltigung_prozent / 100);
            }
            return Math.round(summe);
          }
        } catch (e) {
          console.warn('Fehler beim Parsen von arbeitszeiten_details:', e);
        }
      }

      // Fallback: tatsaechliche_zeit für laufende/abgeschlossene; sonst fertigstellung_zeit − startzeit; sonst geschaetzte_zeit
      let dauer = 0;
      let dauerIstGemessen = false;
      if (['in_arbeit', 'abgeschlossen'].includes(termin.status)) {
        if (parseInt(termin.tatsaechliche_zeit) > 0) {
          dauer = parseInt(termin.tatsaechliche_zeit);
          dauerIstGemessen = true;
        } else if (termin.status === 'abgeschlossen' && termin.fertigstellung_zeit) {
          const startStr = termin.startzeit || termin.bring_zeit;
          if (startStr && /^\d{1,2}:\d{2}/.test(startStr)) {
            const fertigLokal = new Date(termin.fertigstellung_zeit);
            const fertigMin = fertigLokal.getHours() * 60 + fertigLokal.getMinutes();
            const [sh, sm] = startStr.split(':').map(Number);
            const diffMin = fertigMin - (sh * 60 + sm);
            if (diffMin > 5) { dauer = diffMin; dauerIstGemessen = true; }
          }
        }
      }
      if (!dauer) dauer = termin.geschaetzte_zeit || 30;

      // Nebenzeit und Lehrlings-Faktor NUR für geplante Dauern — nie für gemessene Zeiten
      if (!dauerIstGemessen) {
        if (nebenzeitProzent > 0) {
          dauer = dauer * (1 + nebenzeitProzent / 100);
        }
        if (zugeordneterLehrling && zugeordneterLehrling.aufgabenbewaeltigung_prozent &&
            zugeordneterLehrling.aufgabenbewaeltigung_prozent !== 100) {
          dauer = dauer * (zugeordneterLehrling.aufgabenbewaeltigung_prozent / 100);
        }
      }

      return Math.round(dauer);
    },

    createTimelineTerminWithPause(termin, startHour, endHour, mittagspauseStart, type = 'mitarbeiter') {
      const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
      
      // Prüfe ob Termin durch aktive Pause unterbrochen wurde
      let pauseUnterbrochenBei = null;
      let pauseStartZeit = null;
      if (termin.arbeitszeiten_details) {
        try {
          const details = typeof termin.arbeitszeiten_details === 'string' 
            ? JSON.parse(termin.arbeitszeiten_details) 
            : termin.arbeitszeiten_details;
          
          if (details._pause_unterbrochen_bei) {
            pauseUnterbrochenBei = details._pause_unterbrochen_bei;
            pauseStartZeit = details._pause_start_zeit;
          }
        } catch (e) {
          console.warn('Fehler beim Parsen von arbeitszeiten_details:', e);
        }
      }
      
      // Startzeit parsen (normalisiere HHMM → HH:MM)
      // Für interne Termine: abholung_zeit = "Zeit von" (Startzeit), bring_zeit = "Zeit bis" (Endzeit)
      // Daher: startzeit > abholung_zeit > bring_zeit als Fallback verwenden
      const istInterner = termin.abholung_details === 'Interner Termin' || termin.kunde_name === 'Intern';
      let startzeit = this.normalizeZeit(
        termin.startzeit || 
        (istInterner ? termin.abholung_zeit : null) || 
        termin.bring_zeit || 
        '08:00'
      );
      
      // Dauer in Minuten (reine Arbeitszeit ohne Pause)
      const dauer = this.getTerminGesamtdauer(termin);
      
      // Berechne Start- und Endminuten
      const startMinutes = this.timeToMinutes(startzeit);
      const endMinutes = startMinutes + dauer;
      
      // Fall 1: Termin wurde durch aktive Pause unterbrochen
      if (pauseUnterbrochenBei) {
        const elements = [];
        const [pauseH, pauseM] = pauseUnterbrochenBei.split(':').map(Number);
        const pauseStartMinuten = pauseH * 60 + pauseM;
        const pauseEndMinuten = pauseStartMinuten + 30; // 30 Min Pause
        
        // Teil 1: Bis zur Pausenunterbrechung
        const teil1Dauer = pauseStartMinuten - startMinutes;
        const teil1 = this.createTimelineTerminElement(
          termin, startHour, endHour, type, isSchwebend,
          startzeit, teil1Dauer, dauer, false, true // letzter Parameter = unterbrochen
        );
        if (teil1) {
          teil1.classList.add('termin-unterbrochen');
          teil1.title = `⏸️ UNTERBROCHEN\n${termin.termin_nr || termin.id}\n${termin.arbeit}\nPause gestartet um ${pauseUnterbrochenBei}`;
          elements.push(teil1);
        }
        
        // Teil 2: Fortsetzung nach Pause
        const teil2Dauer = dauer - teil1Dauer;
        if (teil2Dauer > 0) {
          const teil2StartH = Math.floor(pauseEndMinuten / 60);
          const teil2StartM = pauseEndMinuten % 60;
          const teil2Startzeit = `${String(teil2StartH).padStart(2, '0')}:${String(teil2StartM).padStart(2, '0')}`;
          
          const teil2 = this.createTimelineTerminElement(
            termin, startHour, endHour, type, isSchwebend,
            teil2Startzeit, teil2Dauer, dauer, true
          );
          if (teil2) {
            teil2.classList.add('termin-fortsetzung-nach-pause');
            teil2.title = `▶️ FORTSETZUNG NACH PAUSE\n${termin.termin_nr || termin.id}\n${termin.arbeit}\nFortsetzung um ${teil2Startzeit}`;
            elements.push(teil2);
          }
        }
        
        return elements;
      }
      
      // Fall 2: Termin geht über geplante Mittagspause (Standard-Verhalten)
      // Mittagspause parsen (Standard: 30 Minuten Dauer)
      let pauseStartMinuten = null;
      let pauseEndMinuten = null;
      const pauseDauer = 30;
      
      if (mittagspauseStart) {
        const [pauseH, pauseM] = mittagspauseStart.split(':').map(Number);
        pauseStartMinuten = pauseH * 60 + pauseM;
        pauseEndMinuten = pauseStartMinuten + pauseDauer;
      }
      
      // Prüfe ob der Termin über die Mittagspause geht
      if (pauseStartMinuten !== null && startMinutes < pauseStartMinuten && endMinutes > pauseStartMinuten) {
        // Termin muss aufgeteilt werden!
        const elements = [];
        
        // Teil 1: Vor der Pause (Dauer bis Pausenbeginn)
        const teil1Dauer = pauseStartMinuten - startMinutes;
        const teil1 = this.createTimelineTerminElement(
          termin, startHour, endHour, type, isSchwebend,
          startzeit, teil1Dauer, dauer, false
        );
        if (teil1) elements.push(teil1);
        
        // Teil 2: Nach der Pause
        // WICHTIG: Die restliche Arbeitsdauer wird NACH der Pause fortgesetzt
        // Die Pausenzeit verlängert also die Gesamtdauer des Termins
        const teil2Dauer = dauer - teil1Dauer; // Verbleibende Arbeitszeit
        
        if (teil2Dauer > 0) {
          const teil2StartH = Math.floor(pauseEndMinuten / 60);
          const teil2StartM = pauseEndMinuten % 60;
          const teil2Startzeit = `${String(teil2StartH).padStart(2, '0')}:${String(teil2StartM).padStart(2, '0')}`;
          
          const teil2 = this.createTimelineTerminElement(
            termin, startHour, endHour, type, isSchwebend,
            teil2Startzeit, teil2Dauer, dauer, true
          );
          if (teil2) elements.push(teil2);
        }
        
        return elements;
      }
      
      // Keine Aufteilung nötig - normaler Termin
      const element = this.createTimelineTerminElement(
        termin, startHour, endHour, type, isSchwebend,
        startzeit, dauer, dauer, false
      );
      return element ? [element] : [];
    },

    createTimelineTerminElement(termin, startHour, endHour, type, isSchwebend, startzeit, displayDauer, gesamtDauer, istFortsetzung) {
      const startAbsMinutes = this.timeToMinutes(startzeit);
      const startH = Math.floor(startAbsMinutes / 60);
      const startM = startAbsMinutes % 60;
      
      // Position berechnen (100px pro Stunde)
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      // Termine vor startHour werden am linken Rand angezeigt (geklammert)
      const startMinutesFromDayStart = Math.max(0, (startH - startHour) * 60 + startM);
      const leftPx = startMinutesFromDayStart * pixelPerMinute;
      const widthPx = Math.max(displayDauer * pixelPerMinute, 40); // Mindestbreite 40px
      
      // Außerhalb des sichtbaren Bereichs? (nur rechts ausblenden)
      if (startH >= endHour) {
        return null;
      }

      // Dauer formatiert anzeigen
      const dauerText = gesamtDauer >= 60 
        ? `${Math.floor(gesamtDauer/60)}h ${gesamtDauer%60 > 0 ? (gesamtDauer%60) + 'min' : ''}`.trim()
        : `${gesamtDauer} min`;

      // Abholzeit-Info
      const abholzeitInfo = termin.abholung_zeit ? `\n🚗 Abholung: ${termin.abholung_zeit}` : '';
      
      // Erweiterungs-Infos ermitteln
      const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true || termin.erweiterung_von_id;
      const erweiterungVonId = termin.erweiterung_von_id;
      
      // Zähle Erweiterungen zu diesem Termin (aus termineById Cache)
      let erweiterungAnzahl = 0;
      if (this.termineById) {
        Object.values(this.termineById).forEach(t => {
          if (t.erweiterung_von_id === termin.id && !t.ist_geloescht) {
            erweiterungAnzahl++;
          }
        });
      }

      const div = document.createElement('div');
      const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
      const erweiterungClass = istErweiterung ? ' erweiterung-block' : '';
      div.className = 'timeline-termin' + statusClass + erweiterungClass + (isSchwebend ? ' schwebend' : '') + (istFortsetzung ? ' fortsetzung' : '');
      if (termin.ist_wiederholung) {
        div.style.borderLeft = '3px solid #dc3545';
        div.title = (div.title || '') + '\n🔁 Wiederholungstermin';
      }
      div.id = istFortsetzung ? `timeline-termin-${termin.id}-teil2` : `timeline-termin-${termin.id}`;
      div.dataset.terminId = termin.id;
      div.dataset.dauer = gesamtDauer;
      div.dataset.istFortsetzung = istFortsetzung ? '1' : '0';
      div.draggable = !istFortsetzung; // Nur Hauptteil ist draggable
      div.style.left = `${leftPx}px`;
      div.style.width = `${widthPx}px`;

      // Geplante Dauer (ohne Live-Override) für den roten Überlauf-Balken speichern
      let geplanteDauerFuerOvertime = gesamtDauer;
      if (termin.status === 'in_arbeit' && !istFortsetzung) {
        try {
          const detailsForOvertime = termin.arbeitszeiten_details
            ? (typeof termin.arbeitszeiten_details === 'string'
                ? JSON.parse(termin.arbeitszeiten_details)
                : termin.arbeitszeiten_details)
            : {};
          if (parseInt(detailsForOvertime._dauer_override) > 0) {
            geplanteDauerFuerOvertime = parseInt(detailsForOvertime._dauer_override);
          } else if (parseInt(termin.tatsaechliche_zeit) > 0) {
            geplanteDauerFuerOvertime = parseInt(termin.tatsaechliche_zeit);
          } else {
            geplanteDauerFuerOvertime = parseInt(termin.geschaetzte_zeit) || gesamtDauer;
          }
        } catch(e) { /* ignore */ }
      }
      div.dataset.geplanteDauer = geplanteDauerFuerOvertime;
      
      // Erweiterungs-Badge HTML
      const erweiterungBadgeHtml = erweiterungAnzahl > 0 
        ? `<span class="timeline-erweiterung-badge" title="${erweiterungAnzahl} Erweiterung(en) - Klicken zum Anzeigen">🔗${erweiterungAnzahl}</span>` 
        : '';
      
      // Ist-Erweiterung Badge (wenn dieser Termin selbst eine Erweiterung ist)
      const istErweiterungBadgeHtml = istErweiterung 
        ? `<span class="timeline-ist-erweiterung" title="Dies ist eine Erweiterung">🔗</span>` 
        : '';
      
      // Erweiterungs-Info für Tooltip
      const erweiterungInfo = istErweiterung ? '\n🔗 ERWEITERUNG' : '';
      const hatErweiterungenInfo = erweiterungAnzahl > 0 ? `\n🔗 ${erweiterungAnzahl} Erweiterung(en)` : '';
      
      if (istFortsetzung) {
        // Fortsetzung: Kompaktere Anzeige mit Verbindungsindikator
        div.innerHTML = `
          <div class="termin-title">↪ ${termin.termin_nr || 'Neu'}${istErweiterungBadgeHtml}</div>
          <div class="termin-info">${displayDauer} min (Forts.)</div>
        `;
        div.title = `${termin.termin_nr} (Fortsetzung nach Pause)\n${termin.kunde_name}\n${termin.arbeit}${abholzeitInfo}${erweiterungInfo}`;
      } else {
        div.innerHTML = `
          <button class="timeline-termin-remove-btn" title="Zuweisung entfernen" data-remove-termin-id="${termin.id}">×</button>
          <div class="termin-title">${termin.termin_nr || 'Neu'} - ${termin.kennzeichen || ''}${istErweiterungBadgeHtml}${erweiterungBadgeHtml}</div>
          <div class="termin-info">${termin.kunde_name || ''} • ${dauerText}</div>
        `;
        div.title = `${termin.termin_nr}\n${termin.kunde_name}\n${termin.arbeit}\n${startzeit} - ${dauerText}${abholzeitInfo}${erweiterungInfo}${hatErweiterungenInfo}`;

        // Roter Überlauf-Balken wenn in_arbeit und Planzeit überschritten
        if (termin.status === 'in_arbeit' && gesamtDauer > geplanteDauerFuerOvertime) {
          const overtimeDiv = document.createElement('div');
          overtimeDiv.className = 'timeline-termin-overtime';
          const plannedPx = geplanteDauerFuerOvertime * pixelPerMinute;
          const overtimePx = (gesamtDauer - geplanteDauerFuerOvertime) * pixelPerMinute;
          overtimeDiv.style.left = `${plannedPx}px`;
          overtimeDiv.style.width = `${Math.max(overtimePx, 4)}px`;
          div.appendChild(overtimeDiv);
        }
      }
      
      // Klick-Handler für Erweiterungs-Badge (wenn vorhanden)
      if (erweiterungAnzahl > 0) {
        const badge = div.querySelector('.timeline-erweiterung-badge');
        if (badge) {
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showVerknuepfteTermine(termin.id);
          });
        }
      }
      
      // Klick-Handler für Ist-Erweiterung Badge (zeigt verknüpfte Termine)
      if (istErweiterung) {
        const istBadge = div.querySelector('.timeline-ist-erweiterung');
        if (istBadge) {
          istBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showVerknuepfteTermine(termin.id);
          });
        }
      }

      // Click-Handler für "×"-Button (Zuweisung entfernen)
      if (!istFortsetzung) {
        const removeBtn = div.querySelector('.timeline-termin-remove-btn');
        if (removeBtn) {
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.removeTerminZuweisung(termin.id);
          });
        }
      }

      // Klick: Normaler Klick = Schnell-Menü, Shift+Klick = Details
      // Gilt für ALLE Termine (auch Fortsetzungen und Erweiterungen)
      div.addEventListener('click', (e) => {
        // Ignoriere wenn auf Badge geklickt wurde (hat eigenen Handler)
        if (e.target.classList.contains('timeline-erweiterung-badge') || 
            e.target.classList.contains('timeline-ist-erweiterung') ||
            e.target.classList.contains('timeline-termin-remove-btn')) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        const aktuellerTermin = this.termineById[termin.id] || termin;
        
        if (e.shiftKey) {
          // Shift+Klick - Termin-Details anzeigen
          this.showTerminDetails(termin.id);
        } else {
          // Normaler Klick - Schnell-Status-Menü
          this.showSchnellStatusDialog(aktuellerTermin, div, startzeit, gesamtDauer);
        }
      });

      // Drag Events nur für Hauptteil (nicht Fortsetzungen)
      if (!istFortsetzung) {
        div.addEventListener('dragstart', (e) => {
          div.classList.add('dragging');
          e.dataTransfer.setData('text/plain', termin.id);
          e.dataTransfer.setData('application/x-startzeit', startzeit);
          e.dataTransfer.setData('application/x-dauer', gesamtDauer);
          e.dataTransfer.effectAllowed = 'move';
          
          // Zeit-Indikator erstellen
          this.createDragTimeIndicator();
        });

        div.addEventListener('dragend', () => {
          div.classList.remove('dragging');
          document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
          // Zeit-Indikator entfernen
          this.removeDragTimeIndicator();
        });
      }

      return div;
    },

    createTimelineTermin(termin, startHour, endHour, type = 'mitarbeiter') {
      const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
      
      // Startzeit parsen (Format: "HH:MM" oder aus bring_zeit)
      let startzeit = termin.startzeit || termin.bring_zeit || '08:00';
      const [startH, startM] = startzeit.split(':').map(Number);
      
      // Dauer in Minuten - berechnet aus arbeitszeiten_details
      const dauer = this.getTerminGesamtdauer(termin);
      
      // Position berechnen (100px pro Stunde)
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      const startMinutesFromDayStart = (startH - startHour) * 60 + startM;
      const leftPx = startMinutesFromDayStart * pixelPerMinute;
      const widthPx = Math.max(dauer * pixelPerMinute, 50); // Mindestbreite 50px
      
      // Außerhalb des sichtbaren Bereichs?
      if (startH < startHour || startH > endHour) {
        return null;
      }

      // Dauer formatiert anzeigen
      const dauerText = dauer >= 60 
        ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
        : `${dauer} min`;

      // Abholzeit-Info
      const abholzeitInfo = termin.abholung_zeit ? `\n🚗 Abholung: ${termin.abholung_zeit}` : '';

      const div = document.createElement('div');
      div.className = 'timeline-termin' + (isSchwebend ? ' schwebend' : '');
      div.id = `timeline-termin-${termin.id}`;
      div.dataset.terminId = termin.id;
      div.dataset.dauer = dauer;
      div.draggable = true;
      div.style.left = `${leftPx}px`;
      div.style.width = `${widthPx}px`;
      
      div.innerHTML = `
        <div class="termin-title">${termin.termin_nr || 'Neu'} - ${termin.kennzeichen || ''}</div>
        <div class="termin-info">${termin.kunde_name || ''} • ${dauerText}</div>
      `;
      
      div.title = `${termin.termin_nr}\n${termin.kunde_name}\n${termin.arbeit}\n${startzeit} - ${dauerText}${abholzeitInfo}`;

      // Drag Events
      div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.setData('text/plain', termin.id);
        e.dataTransfer.setData('application/x-startzeit', startzeit);
        e.dataTransfer.setData('application/x-dauer', dauer);
        e.dataTransfer.effectAllowed = 'move';
        
        // Zeit-Indikator erstellen
        this.createDragTimeIndicator();
      });

      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
        // Zeit-Indikator entfernen
        this.removeDragTimeIndicator();
      });

      // Klick für Termin-Details (normal) oder schnellen Status-Wechsel (Shift+Click)
      div.addEventListener('click', (e) => {
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          // Aktuellen Termin aus Cache holen (für aktuellen Status)
          const aktuellerTermin = this.termineById[termin.id] || termin;
          this.showSchnellStatusDialog(aktuellerTermin, div, startzeit, dauer);
        } else {
          // Normaler Klick - Termin-Details anzeigen
          e.preventDefault();
          e.stopPropagation();
          this.showTerminDetails(termin.id);
        }
      });

      return div;
    },

    createDragTimeIndicator() {
      if (document.getElementById('dragTimeIndicator')) return;
      
      const indicator = document.createElement('div');
      indicator.id = 'dragTimeIndicator';
      indicator.className = 'drag-time-indicator';
      indicator.innerHTML = `
        <div class="drag-time-label">🕐</div>
        <div class="drag-time-value">--:--</div>
        <div class="drag-time-end"></div>
      `;
      document.body.appendChild(indicator);
    },

    removeDragTimeIndicator() {
      const indicator = document.getElementById('dragTimeIndicator');
      if (indicator) indicator.remove();
      
      // Auch vertikale Linie entfernen
      document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
    },

    updateDragTimeIndicator(x, y, zeit, endzeit) {
      const indicator = document.getElementById('dragTimeIndicator');
      if (!indicator) return;
      
      indicator.style.left = `${x + 15}px`;
      indicator.style.top = `${y - 50}px`;
      indicator.querySelector('.drag-time-value').textContent = zeit;
      indicator.querySelector('.drag-time-end').textContent = `bis ${endzeit}`;
      indicator.classList.add('visible');
    },

    berechneUeberlappungsDauer(start1, end1, start2, end2) {
      const ueberlappungStart = Math.max(start1, start2);
      const ueberlappungEnd = Math.min(end1, end2);
      
      if (ueberlappungStart >= ueberlappungEnd) {
        return 0; // Keine Überlappung
      }
      
      return ueberlappungEnd - ueberlappungStart;
    },

    async checkUndWarneBeiUeberlappung(terminId, startzeit, personId, type, arbeitIndex = null) {
      try {
        const termin = await TermineService.getById(terminId);
        const datum = document.getElementById('auslastungDragDropDatum')?.value;
        
        // Berechne Startzeit in Minuten
        const [startH, startM] = startzeit.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        
        // Hole Dauer des Termins/Arbeitsblocks
        let dauer = 30;
        if (arbeitIndex !== null && termin.arbeitszeiten_details) {
          const details = typeof termin.arbeitszeiten_details === 'string' 
            ? JSON.parse(termin.arbeitszeiten_details) 
            : termin.arbeitszeiten_details;
          
          const arbeiten = Object.entries(details).filter(([key]) => !key.startsWith('_'));
          if (arbeiten[arbeitIndex]) {
            const [, arbeitData] = arbeiten[arbeitIndex];
            dauer = parseInt(arbeitData.zeit || arbeitData) || 30;
          }
        } else {
          dauer = parseInt(termin.geschaetzte_zeit) || 30;
        }
        
        const endMinutes = startMinutes + dauer;
        
        // Hole alle Termine der gleichen Person am gleichen Tag
        const auslastungData = await AuslastungService.getByDateRange(datum, datum);
        
        // Defensive Prüfung: stelle sicher dass die erwarteten Properties existieren
        if (!auslastungData || (type === 'mitarbeiter' && !auslastungData.mitarbeiter) || (type === 'lehrling' && !auslastungData.lehrlinge)) {
          console.warn('Auslastungsdaten nicht verfügbar für Überlappungsprüfung', { type, datum });
          return;
        }
        
        const personTermine = type === 'mitarbeiter' 
          ? auslastungData.mitarbeiter.find(m => m.id === parseInt(personId))?.termine || []
          : auslastungData.lehrlinge.find(l => l.id === parseInt(personId))?.termine || [];
        
        // Prüfe auf Überlappungen
        const ueberlappungen = [];
        for (const andererTermin of personTermine) {
          if (andererTermin.id === parseInt(terminId)) continue; // Eigenen Termin überspringen
          
          if (andererTermin.startzeit) {
            const [ah, am] = andererTermin.startzeit.split(':').map(Number);
            const andererStart = ah * 60 + am;
            const andererEnd = andererStart + (parseInt(andererTermin.geschaetzte_zeit) || 30);
            
            const ueberlappungsDauer = this.berechneUeberlappungsDauer(startMinutes, endMinutes, andererStart, andererEnd);
            
            if (ueberlappungsDauer > 0) {
              const kunde = andererTermin.kunde_vorname && andererTermin.kunde_nachname
                ? `${andererTermin.kunde_vorname} ${andererTermin.kunde_nachname}`
                : 'Unbekannt';
              const fahrzeug = andererTermin.fahrzeug_marke && andererTermin.fahrzeug_modell
                ? `${andererTermin.fahrzeug_marke} ${andererTermin.fahrzeug_modell}`
                : '';
              
              ueberlappungen.push({
                terminId: andererTermin.id,
                kunde,
                fahrzeug,
                startzeit: andererTermin.startzeit,
                endzeit: `${String(Math.floor(andererEnd / 60)).padStart(2, '0')}:${String(andererEnd % 60).padStart(2, '0')}`,
                dauer: ueberlappungsDauer
              });
            }
          }
        }
        
        // Zeige Warnung wenn Überlappungen gefunden
        if (ueberlappungen.length > 0) {
          const aenderung = this.planungAenderungen.get(terminId);
          if (aenderung) {
            if (!aenderung.ueberlappungen) {
              aenderung.ueberlappungen = [];
            }
            aenderung.ueberlappungen = ueberlappungen;
          }
          
          // Zeige detaillierte Toast-Warnung
          for (const ueberlappung of ueberlappungen) {
            const info = ueberlappung.fahrzeug 
              ? `${ueberlappung.kunde} - ${ueberlappung.fahrzeug}`
              : ueberlappung.kunde;
            this.showToast(
              `⚠️ ${ueberlappung.dauer} Min Überlappung mit ${info} (${ueberlappung.startzeit}-${ueberlappung.endzeit})`,
              'warning',
              5000
            );
          }
        }
      } catch (error) {
        console.error('Fehler bei Überlappungsprüfung:', error);
      }
    },

    checkDropKollision(track, startMinutes, dauer, excludeTerminId, excludeArbeitIndex = null) {
      const endMinutes = startMinutes + dauer;
      const result = { 
        hatKollision: false, 
        grund: '', 
        typ: null, 
        naheTermine: [] // Termine die nahe dran sind (< 45 min Abstand)
      };
      
      const NAHE_GRENZE = 45; // Minuten - wenn näher, wird automatisch angehängt
      
      // 1. Prüfe Mittagspause
      const pauseBlock = track.querySelector('.timeline-mittagspause');
      if (pauseBlock) {
        const pauseLeft = parseFloat(pauseBlock.style.left) || 0;
        const pauseWidth = parseFloat(pauseBlock.style.width) || 0;
        const pixelPerMinute = 100 / 60;
        const pauseStartMinutes = 8 * 60 + (pauseLeft / pixelPerMinute); // startHour = 8
        const pauseEndMinutes = pauseStartMinutes + (pauseWidth / pixelPerMinute);
        
        // Prüfe ob Termin in Pause startet
        if (startMinutes >= pauseStartMinutes && startMinutes < pauseEndMinutes) {
          result.hatKollision = true;
          result.grund = 'Termin kann nicht in der Mittagspause starten';
          result.typ = 'pause-start';
          result.pauseEndMinutes = pauseEndMinutes;
          result.pauseStartMinutes = pauseStartMinutes;
          return result;
        }
        
        // Prüfe ob Termin komplett in Pause liegt
        if (startMinutes >= pauseStartMinutes && endMinutes <= pauseEndMinutes) {
          result.hatKollision = true;
          result.grund = 'Termin liegt komplett in der Mittagspause';
          result.typ = 'pause-komplett';
          result.pauseEndMinutes = pauseEndMinutes;
          result.pauseStartMinutes = pauseStartMinutes;
          return result;
        }
      }
      
      // 2. Sammle alle Termine/Arbeitsblöcke auf diesem Track
      const alleBlocks = track.querySelectorAll('.timeline-termin:not(.fortsetzung)');
      const pixelPerMinute = 100 / 60;
      
      for (const blockEl of alleBlocks) {
        const tId = blockEl.dataset.terminId;
        const arbeitIdx = blockEl.dataset.arbeitIndex;
        
        // Eigenen Block ignorieren (bei Arbeitsblöcken: gleiche terminId UND gleicher arbeitIndex)
        if (tId === excludeTerminId) {
          // Bei Arbeitsblöcken: nur ignorieren wenn auch der Index übereinstimmt
          if (excludeArbeitIndex !== null) {
            if (arbeitIdx === String(excludeArbeitIndex)) continue;
            // Andere Arbeitsblöcke desselben Termins NICHT ignorieren!
          } else {
            // Normaler Termin (kein Arbeitsblock) - komplett ignorieren
            continue;
          }
        }
        
        const tLeft = parseFloat(blockEl.style.left) || 0;
        const tWidth = parseFloat(blockEl.style.width) || 0;
        const tStartMinutes = 8 * 60 + (tLeft / pixelPerMinute); // startHour = 8
        const tEndMinutes = tStartMinutes + (tWidth / pixelPerMinute);
        
        // Prüfe direkte Überlappung
        if (startMinutes < tEndMinutes && endMinutes > tStartMinutes) {
          result.hatKollision = true;
          result.grund = `Überlappung mit ${blockEl.dataset.arbeitName ? 'Arbeitsblock' : 'Termin'}`;
          result.typ = 'termin';
          result.konfliktTermin = { 
            start: tStartMinutes, 
            end: tEndMinutes, 
            terminId: tId,
            arbeitIndex: arbeitIdx
          };
          return result;
        }
        
        // Prüfe ob nahe dran (für automatisches Anhängen)
        const abstandVorher = startMinutes - tEndMinutes; // Positiv = Start ist nach Ende des anderen
        const abstandNachher = tStartMinutes - endMinutes; // Positiv = Start des anderen ist nach unserem Ende
        
        if (abstandVorher >= 0 && abstandVorher < NAHE_GRENZE) {
          // Dieser Block endet kurz vor unserer gewünschten Startzeit
          result.naheTermine.push({
            position: 'vorher',
            abstand: abstandVorher,
            terminStart: tStartMinutes,
            terminEnd: tEndMinutes,
            terminId: tId
          });
        }
        if (abstandNachher >= 0 && abstandNachher < NAHE_GRENZE) {
          // Dieser Block startet kurz nach unserem gewünschten Ende
          result.naheTermine.push({
            position: 'nachher',
            abstand: abstandNachher,
            terminStart: tStartMinutes,
            terminEnd: tEndMinutes,
            terminId: tId
          });
        }
      }
      
      return result;
    },

    findeFreienSlot(track, gewuenschteStart, dauer, excludeTerminId, kollision, excludeArbeitIndex = null) {
      const raster = this.planungRaster || 5;
      
      // Bei Pause-Kollision (Start in Pause oder komplett in Pause): Nach Pause verschieben
      if (kollision.typ === 'pause-start' || kollision.typ === 'pause-komplett') {
        const neueStart = Math.ceil(kollision.pauseEndMinutes / raster) * raster;
        // Prüfe ob nach der Pause frei ist
        const neueKollision = this.checkDropKollision(track, neueStart, dauer, excludeTerminId, excludeArbeitIndex);
        if (!neueKollision.hatKollision) {
          return { startMinutes: neueStart, grund: 'nach Mittagspause' };
        }
      }
      
      // Bei Termin-Kollision: Direkt nach dem Konflikt-Termin
      if (kollision.typ === 'termin') {
        // Direkt nach dem Konflikt-Termin anhängen
        const nachKonflikt = Math.ceil(kollision.konfliktTermin.end / raster) * raster;
        const kollisionNach = this.checkDropKollision(track, nachKonflikt, dauer, excludeTerminId, excludeArbeitIndex);
        if (!kollisionNach.hatKollision) {
          return { startMinutes: nachKonflikt, grund: 'direkt nach vorherigem Termin' };
        }
        
        // Wenn auch danach Kollision, rekursiv weitersuchen
        if (kollisionNach.hatKollision && kollisionNach.typ === 'termin') {
          return this.findeFreienSlot(track, nachKonflikt, dauer, excludeTerminId, kollisionNach, excludeArbeitIndex);
        }
      }
      
      // Keine automatische Korrektur möglich
      return null;
    },

    berechneOptimaleStartzeit(track, gewuenschteStart, dauer, excludeTerminId, excludeArbeitIndex = null) {
      const raster = this.planungRaster || 5;
      const NAHE_GRENZE = 45;
      
      // Hole Kollisionsergebnis mit nahen Terminen
      const kollision = this.checkDropKollision(track, gewuenschteStart, dauer, excludeTerminId, excludeArbeitIndex);
      
      // Bei direkter Kollision: freien Slot finden
      if (kollision.hatKollision) {
        const freierSlot = this.findeFreienSlot(track, gewuenschteStart, dauer, excludeTerminId, kollision, excludeArbeitIndex);
        if (freierSlot) {
          return { 
            startMinutes: freierSlot.startMinutes, 
            angepasst: true, 
            grund: freierSlot.grund 
          };
        }
        return null; // Kein freier Slot gefunden
      }
      
      // Keine direkte Kollision - prüfe ob nahe an anderem Termin
      if (kollision.naheTermine && kollision.naheTermine.length > 0) {
        // Finde den nächsten Termin der VOR unserer gewünschten Startzeit endet
        const termineVorher = kollision.naheTermine.filter(t => t.position === 'vorher');
        
        if (termineVorher.length > 0) {
          // Sortiere nach Abstand (kleinster zuerst)
          termineVorher.sort((a, b) => a.abstand - b.abstand);
          const naechsterVorher = termineVorher[0];
          
          // Wenn der Abstand klein ist, direkt anhängen mit 10 Min Aufräumpause
          if (naechsterVorher.abstand < NAHE_GRENZE && naechsterVorher.abstand > 0) {
            const AUFRAEUMPAUSE = 10; // 10 Minuten Buffer zwischen Terminen
            const angepassteStart = Math.ceil((naechsterVorher.terminEnd + AUFRAEUMPAUSE) / raster) * raster;
            
            // Prüfe ob die angepasste Position frei ist
            const neueKollision = this.checkDropKollision(track, angepassteStart, dauer, excludeTerminId, excludeArbeitIndex);
            if (!neueKollision.hatKollision) {
              return {
                startMinutes: angepassteStart,
                angepasst: true,
                grund: `an vorherigen Termin angehängt (mit 10 Min Puffer)`
              };
            }
          }
        }
      }
      
      // Keine Anpassung nötig - gewünschte Startzeit ist OK
      return {
        startMinutes: Math.round(gewuenschteStart / raster) * raster,
        angepasst: false,
        grund: null
      };
    },

    showDragPositionLine(track, leftPx, kollision = null) {
      // Bestehende Linie entfernen
      document.querySelectorAll('.drag-position-line').forEach(el => el.remove());
      
      const line = document.createElement('div');
      line.className = 'drag-position-line';
      if (kollision && kollision.hatKollision) {
        line.classList.add('kollision');
      }
      line.style.left = `${leftPx}px`;
      track.appendChild(line);
    },

    async moveArbeitBlockToMitarbeiter(terminId, arbeitName, arbeitIndex, mitarbeiterId, lehrlingId, type, startzeit) {
      try {
        const termin = await TermineService.getById(terminId);
        
        // Aktuelles Datum aus dem Planungs-Datumsfeld holen
        const zielDatum = document.getElementById('auslastungDragDropDatum')?.value;
        
        // Speichere Original-Daten wenn noch nicht vorhanden
        if (!this.planungAenderungen.has(terminId)) {
          this.planungAenderungen.set(terminId, {
            originalData: {
              startzeit: termin.startzeit,
              datum: termin.datum,
              mitarbeiter_id: termin.mitarbeiter_id,
              arbeitszeiten_details: termin.arbeitszeiten_details
            },
            arbeitAenderungen: {} // Für individuelle Arbeitsänderungen
          });
        }
        
        const aenderung = this.planungAenderungen.get(terminId);
        
        // Merke ob der Termin schwebend war
        const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
        if (istSchwebend) {
          aenderung.warSchwebend = true;
        }
        
        // Bug 1 Fix: Datum setzen - IMMER wenn schwebend, oder wenn Ziel-Datum anders ist
        if (zielDatum) {
          if (istSchwebend || zielDatum !== termin.datum) {
            aenderung.datum = zielDatum;
            console.log('[DEBUG] ArbeitBlock - Datum wird gesetzt:', zielDatum, '(Original:', termin.datum, ', istSchwebend:', istSchwebend, ')');
          }
        }
        
        // Initialisiere arbeitAenderungen falls nicht vorhanden
        if (!aenderung.arbeitAenderungen) {
          aenderung.arbeitAenderungen = {};
        }
        
        // Speichere Änderung für diese spezifische Arbeit
        aenderung.arbeitAenderungen[arbeitName] = {
          startzeit: startzeit,
          type: type,
          mitarbeiter_id: type === 'lehrling' ? null : (mitarbeiterId ? parseInt(mitarbeiterId) : null),
          lehrling_id: type === 'lehrling' && lehrlingId ? parseInt(lehrlingId) : null
        };
        
        // Setze Flag dass es Arbeits-spezifische Änderungen gibt
        aenderung.hatArbeitAenderungen = true;
        
        // UI aktualisieren
        await this.updateArbeitBlockUI(terminId, arbeitName, arbeitIndex, startzeit, mitarbeiterId, lehrlingId, type);
        
        // Prüfe auf Überlappungen nach dem Verschieben
        await this.checkUndWarneBeiUeberlappung(terminId, startzeit, type === 'mitarbeiter' ? mitarbeiterId : lehrlingId, type, arbeitIndex);
        
        // Änderungen-Zähler aktualisieren
        this.updatePlanungAenderungenUI();
        
      } catch (error) {
        console.error('Fehler beim Verschieben des Arbeitsblocks:', error);
        alert('Fehler beim Verschieben: ' + (error.message || 'Unbekannter Fehler'));
      }
    },

    async updateArbeitBlockUI(terminId, arbeitName, arbeitIndex, startzeit, mitarbeiterId, lehrlingId, type) {
      const blockEl = document.getElementById(`timeline-arbeit-${terminId}-${arbeitIndex}`);
      const miniCard = document.getElementById(`termin-arbeit-card-${terminId}-${arbeitIndex}`);
      
      const startHour = 8;
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      const [startH, startM] = startzeit.split(':').map(Number);
      
      // Bestimme Ziel-Track
      let targetTrack = null;
      if (type === 'lehrling' && lehrlingId) {
        targetTrack = document.querySelector(`.timeline-track[data-lehrling-id="${lehrlingId}"]`);
      } else if (mitarbeiterId) {
        targetTrack = document.querySelector(`.timeline-track[data-mitarbeiter-id="${mitarbeiterId}"]`);
      }
      
      if (blockEl) {
        // Bestehendes Block-Element verschieben
        const dauer = parseInt(blockEl.dataset.dauer) || 30;
        
        // Prüfe ob Arbeitsblock über Mittagspause geht
        const startMinutes = startH * 60 + startM;
        const endMinutes = startMinutes + dauer;
        
        // Hole Mittagspause des Ziel-Tracks
        const pauseBlock = targetTrack?.querySelector('.timeline-mittagspause');
        let pauseStartMinutes = null;
        let pauseEndMinutes = null;
        
        if (pauseBlock) {
          const pauseLeft = parseFloat(pauseBlock.style.left) || 0;
          const pauseWidth = parseFloat(pauseBlock.style.width) || 0;
          pauseStartMinutes = 8 * 60 + (pauseLeft / pixelPerMinute);
          pauseEndMinutes = pauseStartMinutes + (pauseWidth / pixelPerMinute);
        }
        
        // Prüfe ob Arbeitsblock Pause überschneidet
        const ueberschneidetPause = pauseStartMinutes !== null && 
          startMinutes < pauseEndMinutes && endMinutes > pauseStartMinutes;
        
        if (ueberschneidetPause) {
          // Teile Arbeitsblock: Teil 1 bis Pause, Teil 2 nach Pause
          const teil1Dauer = pauseStartMinutes - startMinutes;
          if (teil1Dauer > 0) {
            const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
            const widthPx = Math.max(teil1Dauer * pixelPerMinute, 40);
            blockEl.style.left = `${leftPx}px`;
            blockEl.style.width = `${widthPx}px`;
            blockEl.classList.add('geaendert');
          }
          
          // Teil 2 (Fortsetzung) - verbleibende Arbeitszeit
          const gesamtDauer = endMinutes - startMinutes;
          const teil2Dauer = gesamtDauer - teil1Dauer; // Verbleibende Arbeitszeit
          if (teil2Dauer > 0) {
            // Entferne alte Fortsetzung falls vorhanden
            const alteForts = document.getElementById(`timeline-arbeit-${terminId}-${arbeitIndex}-teil2`);
            if (alteForts) alteForts.remove();
            
            const teil2StartH = Math.floor(pauseEndMinutes / 60);
            const teil2StartM = pauseEndMinutes % 60;
            const teil2LeftPx = (teil2StartH - startHour) * pixelPerHour + teil2StartM * pixelPerMinute;
            const teil2WidthPx = Math.max(teil2Dauer * pixelPerMinute, 40);
            
            const teil2Div = document.createElement('div');
            teil2Div.className = 'timeline-termin arbeit-block fortsetzung geaendert';
            teil2Div.id = `timeline-arbeit-${terminId}-${arbeitIndex}-teil2`;
            teil2Div.dataset.terminId = terminId;
            teil2Div.dataset.arbeitName = arbeitName;
            teil2Div.dataset.arbeitIndex = arbeitIndex;
            teil2Div.dataset.istFortsetzung = '1';
            teil2Div.draggable = false;
            teil2Div.style.left = `${teil2LeftPx}px`;
            teil2Div.style.width = `${teil2WidthPx}px`;
            
            // Farbe wie Hauptblock
            const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
            const colorIndex = arbeitIndex % colors.length;
            teil2Div.style.borderLeft = `4px solid ${colors[colorIndex]}`;
            
            const dauerText = teil2Dauer >= 60 
              ? `${Math.floor(teil2Dauer/60)}h ${teil2Dauer%60 > 0 ? (teil2Dauer%60) + 'min' : ''}`.trim()
              : `${teil2Dauer} min`;
            
            teil2Div.innerHTML = `
              <div class="termin-title">↪ ${arbeitName}</div>
              <div class="termin-info">${dauerText} (Forts.)</div>
            `;
            teil2Div.title = `${arbeitName} (Fortsetzung nach Pause)`;
            
            targetTrack.appendChild(teil2Div);
          }
        } else {
          // Keine Pause-Überschneidung
          const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
          const widthPx = Math.max(dauer * pixelPerMinute, 40);
          blockEl.style.left = `${leftPx}px`;
          blockEl.style.width = `${widthPx}px`;
          blockEl.classList.add('geaendert');
        }
        
        // Track wechseln wenn nötig
        const currentTrack = blockEl.closest('.timeline-track');
        if (targetTrack && targetTrack !== currentTrack) {
          targetTrack.appendChild(blockEl);
        }
      } else if (miniCard && targetTrack) {
        // Mini-Card in Timeline-Block umwandeln
        const termin = await TermineService.getById(terminId);
        const dauer = parseInt(miniCard.dataset.dauer) || 30;
        
        // Prüfe ob Arbeitsblock über Mittagspause geht
        const startMinutes = startH * 60 + startM;
        const endMinutes = startMinutes + dauer;
        
        // Hole Mittagspause des Ziel-Tracks
        const pauseBlock = targetTrack.querySelector('.timeline-mittagspause');
        let pauseStartMinutes = null;
        let pauseEndMinutes = null;
        
        if (pauseBlock) {
          const pauseLeft = parseFloat(pauseBlock.style.left) || 0;
          const pauseWidth = parseFloat(pauseBlock.style.width) || 0;
          pauseStartMinutes = 8 * 60 + (pauseLeft / pixelPerMinute);
          pauseEndMinutes = pauseStartMinutes + (pauseWidth / pixelPerMinute);
        }
        
        // Prüfe ob Arbeitsblock Pause überschneidet
        const ueberschneidetPause = pauseStartMinutes !== null && 
          startMinutes < pauseEndMinutes && endMinutes > pauseStartMinutes;
        
        // Neues Timeline-Element erstellen
        const newBlock = document.createElement('div');
        newBlock.className = 'timeline-termin arbeit-block geaendert';
        newBlock.id = `timeline-arbeit-${terminId}-${arbeitIndex}`;
        newBlock.dataset.terminId = terminId;
        newBlock.dataset.arbeitName = arbeitName;
        newBlock.dataset.arbeitIndex = arbeitIndex;
        newBlock.dataset.dauer = dauer;
        newBlock.draggable = true;
        
        // Farbe
        const colors = ['#3498db', '#9b59b6', '#1abc9c', '#f39c12', '#e74c3c'];
        const colorIndex = arbeitIndex % colors.length;
        newBlock.style.borderLeft = `4px solid ${colors[colorIndex]}`;
        
        if (ueberschneidetPause) {
          // Teil 1: Bis zur Pause
          const teil1Dauer = pauseStartMinutes - startMinutes;
          const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
          const widthPx = Math.max(teil1Dauer * pixelPerMinute, 40);
          newBlock.style.left = `${leftPx}px`;
          newBlock.style.width = `${widthPx}px`;
          
          const teil1DauerText = teil1Dauer >= 60 
            ? `${Math.floor(teil1Dauer/60)}h ${teil1Dauer%60 > 0 ? (teil1Dauer%60) + 'min' : ''}`.trim()
            : `${teil1Dauer} min`;
          
          newBlock.innerHTML = `
            <div class="termin-title">${termin.termin_nr || 'Neu'}</div>
            <div class="termin-info arbeit-name">${arbeitName}</div>
            <div class="termin-info">${teil1DauerText}</div>
          `;
          
          // Teil 2: Nach der Pause (Fortsetzung) - verbleibende Arbeitszeit
          const gesamtDauer = endMinutes - startMinutes;
          const teil2Dauer = gesamtDauer - teil1Dauer; // Verbleibende Arbeitszeit
          if (teil2Dauer > 0) {
            const teil2StartH = Math.floor(pauseEndMinutes / 60);
            const teil2StartM = pauseEndMinutes % 60;
            const teil2LeftPx = (teil2StartH - startHour) * pixelPerHour + teil2StartM * pixelPerMinute;
            const teil2WidthPx = Math.max(teil2Dauer * pixelPerMinute, 40);
            
            const teil2Div = document.createElement('div');
            teil2Div.className = 'timeline-termin arbeit-block fortsetzung geaendert';
            teil2Div.id = `timeline-arbeit-${terminId}-${arbeitIndex}-teil2`;
            teil2Div.dataset.terminId = terminId;
            teil2Div.dataset.arbeitName = arbeitName;
            teil2Div.dataset.arbeitIndex = arbeitIndex;
            teil2Div.dataset.istFortsetzung = '1';
            teil2Div.draggable = false;
            teil2Div.style.left = `${teil2LeftPx}px`;
            teil2Div.style.width = `${teil2WidthPx}px`;
            teil2Div.style.borderLeft = `4px solid ${colors[colorIndex]}`;
            
            const teil2DauerText = teil2Dauer >= 60 
              ? `${Math.floor(teil2Dauer/60)}h ${teil2Dauer%60 > 0 ? (teil2Dauer%60) + 'min' : ''}`.trim()
              : `${teil2Dauer} min`;
            
            teil2Div.innerHTML = `
              <div class="termin-title">↪ ${arbeitName}</div>
              <div class="termin-info">${teil2DauerText} (Forts.)</div>
            `;
            teil2Div.title = `${arbeitName} (Fortsetzung nach Pause)`;
            
            targetTrack.appendChild(teil2Div);
          }
        } else {
          // Keine Pause-Überschneidung
          const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
          const widthPx = Math.max(dauer * pixelPerMinute, 40);
          newBlock.style.left = `${leftPx}px`;
          newBlock.style.width = `${widthPx}px`;
          
          const dauerText = dauer >= 60 
            ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
            : `${dauer} min`;
          
          newBlock.innerHTML = `
            <div class="termin-title">${termin.termin_nr || 'Neu'}</div>
            <div class="termin-info arbeit-name">${arbeitName}</div>
            <div class="termin-info">${dauerText}</div>
          `;
        }
        
        // Drag Events
        newBlock.addEventListener('dragstart', (e) => {
          newBlock.classList.add('dragging');
          e.dataTransfer.setData('text/plain', terminId);
          e.dataTransfer.setData('application/x-arbeit-name', arbeitName);
          e.dataTransfer.setData('application/x-arbeit-index', arbeitIndex);
          e.dataTransfer.setData('application/x-dauer', dauer);
          e.dataTransfer.setData('application/x-ist-arbeit-block', 'true');
          e.dataTransfer.effectAllowed = 'move';
          this.createDragTimeIndicator();
        });
        
        newBlock.addEventListener('dragend', () => {
          newBlock.classList.remove('dragging');
          document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
          this.removeDragTimeIndicator();
        });
        
        targetTrack.appendChild(newBlock);
        miniCard.remove();
      }
    },

    async moveTerminToMitarbeiterWithTime(terminId, mitarbeiterId, lehrlingId, type, startzeit) {
      try {
        // Lade aktuellen Termin für Original-Daten (falls noch nicht im Puffer)
        const termin = await TermineService.getById(terminId);
        
        // Aktuelles Datum aus dem Planungs-Datumsfeld holen
        const zielDatum = document.getElementById('auslastungDragDropDatum')?.value;
        
        // Speichere Original-Daten wenn noch nicht vorhanden
        if (!this.planungAenderungen.has(terminId)) {
          this.planungAenderungen.set(terminId, {
            originalData: {
              startzeit: termin.startzeit,
              datum: termin.datum,
              mitarbeiter_id: termin.mitarbeiter_id,
              arbeitszeiten_details: termin.arbeitszeiten_details
            }
          });
        }
        
        // Aktualisiere Änderungspuffer
        const aenderung = this.planungAenderungen.get(terminId);
        aenderung.startzeit = startzeit;
        aenderung.type = type;
        
        // Merke ob der Termin schwebend war (für Speichern)
        const istSchwebend = termin.ist_schwebend === 1 || termin.ist_schwebend === true;
        if (istSchwebend) {
          aenderung.warSchwebend = true;
        }
        
        // Bug 1 Fix: Datum setzen - IMMER wenn schwebend, oder wenn Ziel-Datum anders ist
        if (zielDatum) {
          if (istSchwebend || zielDatum !== termin.datum) {
            aenderung.datum = zielDatum;
            console.log('[DEBUG] Datum wird gesetzt:', zielDatum, '(Original:', termin.datum, ', istSchwebend:', istSchwebend, ')');
          }
        }
        
        if (type === 'lehrling' && lehrlingId) {
          aenderung.mitarbeiter_id = null;
          aenderung.lehrling_id = parseInt(lehrlingId);
        } else if (mitarbeiterId && mitarbeiterId !== 'null') {
          aenderung.mitarbeiter_id = parseInt(mitarbeiterId);
          aenderung.lehrling_id = null;
        } else {
          aenderung.mitarbeiter_id = null;
          aenderung.lehrling_id = null;
        }
        
        // UI aktualisieren (lokale Vorschau) - await da jetzt async
        await this.updatePlanungTerminUI(terminId, startzeit, aenderung.mitarbeiter_id, aenderung.lehrling_id, type);
        
        // Prüfe auf Überlappungen nach dem Verschieben
        await this.checkUndWarneBeiUeberlappung(terminId, startzeit, type === 'mitarbeiter' ? mitarbeiterId : lehrlingId, type, null);
        
        // Änderungen-Zähler aktualisieren
        this.updatePlanungAenderungenUI();

      } catch (error) {
        console.error('Fehler beim Verschieben:', error);
        alert('Fehler beim Verschieben des Termins: ' + (error.message || 'Unbekannter Fehler'));
      }
    },

    async updatePlanungTerminUI(terminId, startzeit, mitarbeiterId, lehrlingId, type) {
      let terminEl = document.getElementById(`timeline-termin-${terminId}`);
      const fortsetzungEl = document.getElementById(`timeline-termin-${terminId}-teil2`);
      const miniCard = document.getElementById(`termin-card-${terminId}`);
      const schwebendeBar = document.getElementById(`schwebend-bar-${terminId}`);
      
      // Entferne evtl. vorhandene Fortsetzung (wird ggf. neu erstellt)
      if (fortsetzungEl) {
        fortsetzungEl.remove();
      }
      
      // Entferne schwebende Bar wenn vorhanden (beim Drag aus dem Schwebende-Panel)
      if (schwebendeBar) {
        schwebendeBar.remove();
        // Counter aktualisieren
        const container = document.getElementById('schwebendeTermineContainer');
        const countElement = document.getElementById('schwebendeCount');
        if (container && countElement) {
          const verbleibendeTermine = container.querySelectorAll('.schwebender-termin-bar').length;
          countElement.textContent = `${verbleibendeTermine} Termin${verbleibendeTermine !== 1 ? 'e' : ''}`;
        }
      }
      
      // Ziel-Track früh bestimmen (Parameter, nicht DOM-Suche nach terminEl)
      let newTrack = null;
      if (type === 'lehrling' && lehrlingId) {
        newTrack = document.querySelector(`.timeline-track[data-lehrling-id="${lehrlingId}"]`);
      } else if (mitarbeiterId) {
        newTrack = document.querySelector(`.timeline-track[data-mitarbeiter-id="${mitarbeiterId}"]`);
      }

      // Wenn kein Timeline-Element existiert, aber eine Mini-Card oder Schwebende-Bar -> Termin kommt von außerhalb
      if (!terminEl && (miniCard || schwebendeBar)) {
        // Ziel-Track prüfen
        if (!newTrack) {
          this.showToast('❌ Mitarbeiter-Track nicht gefunden – bitte Seite neu laden', 'error');
          return;
        }
        // Lade Termin-Daten (Cache-first, dann API)
        try {
          const termin = this.termineById[terminId] || await TermineService.getById(terminId);
          const dauer = this.getTerminGesamtdauer(termin);
          const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
          const statusClass = termin.status ? ` status-${termin.status.toLowerCase().replace(' ', '-')}` : '';
          
          // Erweiterungs-Infos ermitteln
          const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true || termin.erweiterung_von_id;
          const erweiterungClass = istErweiterung ? ' erweiterung-block' : '';
          
          // Zähle Erweiterungen zu diesem Termin (aus termineById Cache)
          let erweiterungAnzahl = 0;
          if (this.termineById) {
            Object.values(this.termineById).forEach(t => {
              if (t.erweiterung_von_id === termin.id && !t.ist_geloescht) {
                erweiterungAnzahl++;
              }
            });
          }
          
          // Neues Timeline-Element erstellen
          terminEl = document.createElement('div');
          terminEl.className = 'timeline-termin' + statusClass + erweiterungClass + (isSchwebend ? ' schwebend' : '');
          terminEl.id = `timeline-termin-${terminId}`;
          terminEl.dataset.terminId = terminId;
          terminEl.dataset.dauer = dauer;
          terminEl.dataset.istFortsetzung = '0';
          terminEl.draggable = true;
          
          const dauerText = dauer >= 60 
            ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
            : `${dauer} min`;
          
          // Erweiterungs-Badge HTML
          const erweiterungBadgeHtml = erweiterungAnzahl > 0 
            ? `<span class="timeline-erweiterung-badge" title="${erweiterungAnzahl} Erweiterung(en) - Klicken zum Anzeigen">🔗${erweiterungAnzahl}</span>` 
            : '';
          
          // Ist-Erweiterung Badge (wenn dieser Termin selbst eine Erweiterung ist)
          const istErweiterungBadgeHtml = istErweiterung 
            ? `<span class="timeline-ist-erweiterung" title="Dies ist eine Erweiterung">🔗</span>` 
            : '';
          
          terminEl.innerHTML = `
            <div class="termin-title">${termin.termin_nr || 'Neu'} - ${termin.kennzeichen || ''}${istErweiterungBadgeHtml}${erweiterungBadgeHtml}</div>
            <div class="termin-info">${termin.kunde_name || ''} • ${dauerText}</div>
          `;
          
          // Erweiterungs-Info für Tooltip
          const erweiterungInfo = istErweiterung ? '\n🔗 ERWEITERUNG' : '';
          const hatErweiterungenInfo = erweiterungAnzahl > 0 ? `\n🔗 ${erweiterungAnzahl} Erweiterung(en)` : '';
          terminEl.title = `${termin.termin_nr}\n${termin.kunde_name}\n${termin.arbeit}\n${startzeit} - ${dauerText}${erweiterungInfo}${hatErweiterungenInfo}`;
          
          // Klick-Handler für Erweiterungs-Badge (wenn vorhanden)
          if (erweiterungAnzahl > 0) {
            const badge = terminEl.querySelector('.timeline-erweiterung-badge');
            if (badge) {
              badge.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.showVerknuepfteTermine(termin.id);
              });
            }
          }
          
          // Klick-Handler für Ist-Erweiterung Badge
          if (istErweiterung) {
            const istBadge = terminEl.querySelector('.timeline-ist-erweiterung');
            if (istBadge) {
              istBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.showVerknuepfteTermine(termin.id);
              });
            }
          }
          
          // Klick: Normaler Klick = Schnell-Menü, Shift+Klick = Details
          terminEl.addEventListener('click', (e) => {
            // Ignoriere wenn auf Badge geklickt wurde (hat eigenen Handler)
            if (e.target.classList.contains('timeline-erweiterung-badge') || 
                e.target.classList.contains('timeline-ist-erweiterung')) {
              return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            const aktuellerTermin = this.termineById[termin.id] || termin;
            
            if (e.shiftKey) {
              // Shift+Klick - Termin-Details anzeigen
              this.showTerminDetails(termin.id);
            } else {
              // Normaler Klick - Schnell-Status-Menü
              this.showSchnellStatusDialog(aktuellerTermin, terminEl, startzeit, dauer);
            }
          });
          
          // Drag Events hinzufügen
          terminEl.addEventListener('dragstart', (e) => {
            terminEl.classList.add('dragging');
            e.dataTransfer.setData('text/plain', terminId);
            e.dataTransfer.setData('application/x-startzeit', startzeit);
            e.dataTransfer.setData('application/x-dauer', dauer.toString());
            e.dataTransfer.effectAllowed = 'move';
            this.createDragTimeIndicator();
          });
          
          terminEl.addEventListener('dragend', () => {
            terminEl.classList.remove('dragging');
            document.querySelectorAll('.timeline-track').forEach(zone => zone.classList.remove('drag-over'));
            this.removeDragTimeIndicator();
          });
          
          // Mini-Card aus "Nicht zugeordnet" entfernen und terminEl sofort in Track hängen
          newTrack.appendChild(terminEl);
          if (miniCard) {
            miniCard.remove();
          }
          
        } catch (error) {
          console.error('Fehler beim Erstellen des Timeline-Elements:', error);
          this.showToast('❌ Fehler beim Platzieren des Termins: ' + (error.message || 'Unbekannt'), 'error');
          return;
        }
      }
      
      if (!terminEl) {
        this.showToast('❌ Termin konnte nicht zugeordnet werden – bitte Seite neu laden', 'error');
        return;
      }
      
      const [startH, startM] = startzeit.split(':').map(Number);
      const startHour = 8;
      const endHour = 18;
      const pixelPerHour = 100;
      const pixelPerMinute = pixelPerHour / 60;
      
      // Hole Dauer aus dem Element
      const dauer = parseInt(terminEl.dataset.dauer) || 30;
      const startMinutes = startH * 60 + startM;
      const endMinutes = startMinutes + dauer;
      
      const targetTrack = newTrack || terminEl.closest('.timeline-track');
      
      // Mittagspause des Tracks ermitteln
      const pauseBlock = targetTrack?.querySelector('.timeline-mittagspause');
      let pauseStartMinutes = null;
      let pauseEndMinutes = null;
      const pauseDauer = 30;
      
      if (pauseBlock) {
        const pauseLeft = parseFloat(pauseBlock.style.left) || 0;
        pauseStartMinutes = startHour * 60 + (pauseLeft / pixelPerMinute);
        pauseEndMinutes = pauseStartMinutes + pauseDauer;
      }
      
      // Prüfe ob Termin über die Mittagspause geht und gesplittet werden muss
      if (pauseStartMinutes !== null && startMinutes < pauseStartMinutes && endMinutes > pauseStartMinutes) {
        // Teil 1: Vor der Pause
        const teil1Dauer = pauseStartMinutes - startMinutes;
        const teil1LeftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
        const teil1WidthPx = Math.max(teil1Dauer * pixelPerMinute, 40);
        
        terminEl.style.left = `${teil1LeftPx}px`;
        terminEl.style.width = `${teil1WidthPx}px`;
        terminEl.classList.add('geaendert');
        
        // Teil 2: Nach der Pause (Fortsetzung erstellen) - verbleibende Arbeitszeit
        const gesamtDauer = endMinutes - startMinutes;
        const teil2Dauer = gesamtDauer - teil1Dauer; // Verbleibende Arbeitszeit
        if (teil2Dauer > 0) {
          const teil2StartH = Math.floor(pauseEndMinutes / 60);
          const teil2StartM = pauseEndMinutes % 60;
          const teil2LeftPx = (teil2StartH - startHour) * pixelPerHour + teil2StartM * pixelPerMinute;
          const teil2WidthPx = Math.max(teil2Dauer * pixelPerMinute, 40);
          
          // Hole Termin-Infos aus dem Hauptelement
          const terminNr = terminEl.querySelector('.termin-title')?.textContent.split(' - ')[0] || '';
          
          const teil2Div = document.createElement('div');
          teil2Div.className = 'timeline-termin fortsetzung geaendert';
          teil2Div.id = `timeline-termin-${terminId}-teil2`;
          teil2Div.dataset.terminId = terminId;
          teil2Div.dataset.istFortsetzung = '1';
          teil2Div.draggable = false;
          teil2Div.style.left = `${teil2LeftPx}px`;
          teil2Div.style.width = `${teil2WidthPx}px`;
          teil2Div.innerHTML = `
            <div class="termin-title">↪ ${terminNr}</div>
            <div class="termin-info">${teil2Dauer} min (Forts.)</div>
          `;
          teil2Div.title = `${terminNr} (Fortsetzung nach Pause)`;
          
          targetTrack.appendChild(teil2Div);
        }
      } else {
        // Keine Aufteilung nötig - normaler Termin
        const leftPx = (startH - startHour) * pixelPerHour + startM * pixelPerMinute;
        const widthPx = Math.max(dauer * pixelPerMinute, 40);
        
        terminEl.style.left = `${leftPx}px`;
        terminEl.style.width = `${widthPx}px`;
        terminEl.classList.add('geaendert');
      }
      
      // Track wechseln wenn nötig
      const currentTrack = terminEl.closest('.timeline-track');
      if (targetTrack && targetTrack !== currentTrack) {
        targetTrack.appendChild(terminEl);
      }
    },

    updatePlanungAenderungenUI() {
      const count = this.planungAenderungen.size;
      const countBadge = document.getElementById('planungAenderungenCount');
      const speichernBtn = document.getElementById('planungSpeichernBtn');
      const verwerfenBtn = document.getElementById('planungVerwerfenBtn');
      
      if (countBadge) {
        countBadge.textContent = `${count} Änderung${count !== 1 ? 'en' : ''}`;
        countBadge.style.display = count > 0 ? 'inline-block' : 'none';
      }
      
      if (speichernBtn) {
        speichernBtn.disabled = count === 0;
      }
      
      if (verwerfenBtn) {
        verwerfenBtn.style.display = count > 0 ? 'inline-block' : 'none';
      }
    },

    setPlanungRaster(value) {
      this.planungRaster = parseInt(value) || 5;
    },

    async savePlanungAenderungen() {
      if (this.planungAenderungen.size === 0) {
        this.showToast('Keine Änderungen zum Speichern', 'info');
        return;
      }
      console.log(`[PLANUNG-SAVE] Speichere ${this.planungAenderungen.size} Änderung(en)`);
      for (const [id, a] of this.planungAenderungen) {
        console.log(`[PLANUNG-SAVE]  Termin ${id}: mitarbeiter_id=${a.mitarbeiter_id}, lehrling_id=${a.lehrling_id}, type=${a.type}, startzeit=${a.startzeit}, datum=${a.datum || '–'}, warSchwebend=${a.warSchwebend || false}`);
      }
      
      // === Überlappungs-Prüfung vor dem Speichern ===
      const alleUeberlappungen = [];
      
      for (const [terminId, aenderung] of this.planungAenderungen) {
        if (aenderung.ueberlappungen && aenderung.ueberlappungen.length > 0) {
          const termin = await TermineService.getById(terminId);
          const kunde = termin.kunde_vorname && termin.kunde_nachname
            ? `${termin.kunde_vorname} ${termin.kunde_nachname}`
            : 'Unbekannt';
          const fahrzeug = termin.fahrzeug_marke && termin.fahrzeug_modell
            ? `${termin.fahrzeug_marke} ${termin.fahrzeug_modell}`
            : '';
          
          for (const ueberlappung of aenderung.ueberlappungen) {
            alleUeberlappungen.push({
              terminId,
              kunde,
              fahrzeug,
              ueberlappung
            });
          }
        }
      }
      
      // Wenn Überlappungen vorhanden, Warnung anzeigen
      if (alleUeberlappungen.length > 0) {
        let meldung = `<h3>⚠️ ${alleUeberlappungen.length} Überlappung${alleUeberlappungen.length > 1 ? 'en' : ''} gefunden</h3>`;
        meldung += '<div style="max-height: 300px; overflow-y: auto; margin: 10px 0;">';
        
        for (const item of alleUeberlappungen) {
          const info = item.fahrzeug ? `${item.kunde} - ${item.fahrzeug}` : item.kunde;
          const gegnerInfo = item.ueberlappung.fahrzeug 
            ? `${item.ueberlappung.kunde} - ${item.ueberlappung.fahrzeug}`
            : item.ueberlappung.kunde;
          
          meldung += `<div style="margin: 5px 0; padding: 8px; background: #fff3cd; border-radius: 4px;">`;
          meldung += `<strong>${info}</strong><br>`;
          meldung += `↔️ ${item.ueberlappung.dauer} Min mit ${gegnerInfo}<br>`;
          meldung += `<small>(${item.ueberlappung.startzeit}-${item.ueberlappung.endzeit})</small>`;
          meldung += `</div>`;
        }
        
        meldung += '</div>';
        meldung += '<p><strong>Trotzdem speichern?</strong></p>';
        
        const confirmed = await this.showConfirmDialog(
          'Überlappungen vorhanden',
          meldung,
          'Trotzdem speichern',
          'Abbrechen'
        );
        
        if (!confirmed) {
          return; // Benutzer hat abgebrochen
        }
      }
      
      // === Abholzeit-Prüfung vor dem Speichern ===
      const abholzeitKonflikte = [];
      
      for (const [terminId, aenderung] of this.planungAenderungen) {
        try {
          const termin = await TermineService.getById(terminId);
          // DB-Feld: abholung_zeit
          const abholzeit = termin.abholung_zeit;
          if (!abholzeit) continue;
          
          // Berechne Endzeit basierend auf den Änderungen
          let startzeit = aenderung.startzeit;
          let gesamtDauer = 0;
          
          // Parse arbeitszeiten_details für Dauer
          let details = {};
          try {
            details = termin.arbeitszeiten_details ? 
              (typeof termin.arbeitszeiten_details === 'string' ? JSON.parse(termin.arbeitszeiten_details) : termin.arbeitszeiten_details) 
              : {};
          } catch (e) {}
          
          // Berechne Gesamtdauer aus arbeitszeiten_details
          for (const key in details) {
            if (key.startsWith('_')) continue;
            const arbeit = details[key];
            if (typeof arbeit === 'object' && arbeit.zeit) {
              gesamtDauer += parseInt(arbeit.zeit) || 0;
            } else if (typeof arbeit === 'number') {
              gesamtDauer += parseInt(arbeit) || 0;
            }
          }
          
          // Fallback auf geschaetzte_zeit falls keine Details
          if (gesamtDauer === 0) {
            gesamtDauer = parseInt(termin.geschaetzte_zeit) || 0;
          }
          
          // Wenn Arbeits-spezifische Änderungen, finde die späteste Endzeit
          if (aenderung.hatArbeitAenderungen && aenderung.arbeitAenderungen) {
            let spaetesteEndzeit = 0;
            for (const [arbeitName, arbeitAenderung] of Object.entries(aenderung.arbeitAenderungen)) {
              const arbeitStartzeit = arbeitAenderung.startzeit;
              if (!arbeitStartzeit) continue;
              
              const [h, m] = arbeitStartzeit.split(':').map(Number);
              const startMin = h * 60 + m;
              
              // Hole Dauer für diese Arbeit
              let arbeitDauer = 30; // Default
              if (details[arbeitName]) {
                if (typeof details[arbeitName] === 'object' && details[arbeitName].zeit) {
                  arbeitDauer = parseInt(details[arbeitName].zeit) || 30;
                } else if (typeof details[arbeitName] === 'number') {
                  arbeitDauer = parseInt(details[arbeitName]) || 30;
                }
              }
              
              const endeMin = startMin + arbeitDauer;
              if (endeMin > spaetesteEndzeit) {
                spaetesteEndzeit = endeMin;
              }
            }
            
            if (spaetesteEndzeit > 0) {
              // Vergleiche mit Abholzeit
              const [abholH, abholM] = abholzeit.split(':').map(Number);
              const abholMin = abholH * 60 + abholM;
              
              if (spaetesteEndzeit > abholMin) {
                const endzeitStr = `${Math.floor(spaetesteEndzeit/60).toString().padStart(2,'0')}:${(spaetesteEndzeit%60).toString().padStart(2,'0')}`;
                abholzeitKonflikte.push({
                  termin: termin,
                  endzeit: endzeitStr,
                  abholzeit: abholzeit
                });
              }
            }
          } else if (startzeit && gesamtDauer > 0) {
            // Normale Termin-Änderung
            const [h, m] = startzeit.split(':').map(Number);
            const startMin = h * 60 + m;
            const endeMin = startMin + gesamtDauer;
            
            const [abholH, abholM] = abholzeit.split(':').map(Number);
            const abholMin = abholH * 60 + abholM;
            
            if (endeMin > abholMin) {
              const endzeitStr = `${Math.floor(endeMin/60).toString().padStart(2,'0')}:${(endeMin%60).toString().padStart(2,'0')}`;
              abholzeitKonflikte.push({
                termin: termin,
                endzeit: endzeitStr,
                abholzeit: abholzeit
              });
            }
          }
        } catch (e) {
          console.error('Fehler bei Abholzeit-Prüfung:', e);
        }
      }
      
      // Warnung anzeigen falls Abholzeit-Konflikte
      if (abholzeitKonflikte.length > 0) {
        let warnText = `⚠️ Warnung: ${abholzeitKonflikte.length} Termin(e) werden erst nach der Abholzeit fertig:\n\n`;
        abholzeitKonflikte.forEach(k => {
          warnText += `• ${k.termin.termin_nr} - Fertig: ${k.endzeit}, Abholung: ${k.abholzeit}\n`;
        });
        warnText += '\nTrotzdem speichern?';
        
        if (!confirm(warnText)) {
          return;
        }
      }
      
      const speichernBtn = document.getElementById('planungSpeichernBtn');
      if (speichernBtn) {
        speichernBtn.disabled = true;
        speichernBtn.innerHTML = '⏳ Speichern...';
      }
      
      let erfolge = 0;
      let fehler = 0;
      
      for (const [terminId, aenderung] of this.planungAenderungen) {
        try {
          // Lade aktuellen Termin für arbeitszeiten_details
          const termin = await TermineService.getById(terminId);
          let details = {};
          try {
            details = termin.arbeitszeiten_details ? 
              (typeof termin.arbeitszeiten_details === 'string' ? JSON.parse(termin.arbeitszeiten_details) : termin.arbeitszeiten_details) 
              : {};
          } catch (e) {}
          
          let updateData = {};
          
          // Prüfe ob es arbeits-spezifische Änderungen gibt
          if (aenderung.hatArbeitAenderungen && aenderung.arbeitAenderungen) {
            // Arbeits-spezifische Änderungen verarbeiten
            for (const [arbeitName, arbeitAenderung] of Object.entries(aenderung.arbeitAenderungen)) {
              if (details[arbeitName] && typeof details[arbeitName] === 'object') {
                // Existierende Arbeit aktualisieren
                details[arbeitName].startzeit = arbeitAenderung.startzeit;
                details[arbeitName].type = arbeitAenderung.type;
                
                if (arbeitAenderung.type === 'lehrling' && arbeitAenderung.lehrling_id) {
                  details[arbeitName].lehrling_id = arbeitAenderung.lehrling_id;
                  details[arbeitName].mitarbeiter_id = arbeitAenderung.lehrling_id; // Für Kompatibilität
                  delete details[arbeitName].mitarbeiter_id_orig;
                } else if (arbeitAenderung.mitarbeiter_id) {
                  details[arbeitName].mitarbeiter_id = arbeitAenderung.mitarbeiter_id;
                  delete details[arbeitName].lehrling_id;
                }
              } else if (typeof details[arbeitName] === 'number') {
                // Einfacher Wert -> in Objekt umwandeln
                const zeit = details[arbeitName];
                details[arbeitName] = {
                  zeit: zeit,
                  startzeit: arbeitAenderung.startzeit,
                  type: arbeitAenderung.type
                };
                if (arbeitAenderung.type === 'lehrling' && arbeitAenderung.lehrling_id) {
                  details[arbeitName].lehrling_id = arbeitAenderung.lehrling_id;
                  details[arbeitName].mitarbeiter_id = arbeitAenderung.lehrling_id;
                } else if (arbeitAenderung.mitarbeiter_id) {
                  details[arbeitName].mitarbeiter_id = arbeitAenderung.mitarbeiter_id;
                }
              } else {
                // Arbeit existiert noch nicht in details -> neu erstellen
                details[arbeitName] = {
                  zeit: 30, // Standard-Zeit
                  startzeit: arbeitAenderung.startzeit,
                  type: arbeitAenderung.type
                };
                if (arbeitAenderung.type === 'lehrling' && arbeitAenderung.lehrling_id) {
                  details[arbeitName].lehrling_id = arbeitAenderung.lehrling_id;
                  details[arbeitName].mitarbeiter_id = arbeitAenderung.lehrling_id;
                } else if (arbeitAenderung.mitarbeiter_id) {
                  details[arbeitName].mitarbeiter_id = arbeitAenderung.mitarbeiter_id;
                }
              }
            }
            
            // Ermittle die früheste Startzeit für den Termin
            let fruehsteStartzeit = null;
            for (const key in details) {
              if (key.startsWith('_')) continue;
              const arbeit = details[key];
              if (typeof arbeit === 'object' && arbeit.startzeit) {
                if (!fruehsteStartzeit || arbeit.startzeit < fruehsteStartzeit) {
                  fruehsteStartzeit = arbeit.startzeit;
                }
              }
            }
            
            if (fruehsteStartzeit) {
              details._startzeit = fruehsteStartzeit;
              updateData.startzeit = fruehsteStartzeit;
            }
            
            // Bug 1 Fix: Datum aktualisieren wenn gesetzt (auch bei Arbeits-spezifischen Änderungen)
            if (aenderung.datum) {
              updateData.datum = aenderung.datum;
            }
            
            // _gesamt_mitarbeiter_id NICHT ändern, da Arbeiten unterschiedliche Zuordnungen haben können
            // Stattdessen entfernen, damit die individuelle Zuordnung gilt
            delete details._gesamt_mitarbeiter_id;
            
            updateData.arbeitszeiten_details = JSON.stringify(details);
            updateData.mitarbeiter_id = null; // Keine Termin-weite Zuordnung mehr
            
          } else {
            // Normale Termin-weite Änderung (alte Logik)
            updateData.startzeit = aenderung.startzeit;
            
            // Bug 1 Fix: Datum aktualisieren wenn gesetzt
            if (aenderung.datum) {
              updateData.datum = aenderung.datum;
            }
            
            const wirdZugeordnet = aenderung.type !== 'none' && (aenderung.mitarbeiter_id || aenderung.lehrling_id);
            
            if (aenderung.type === 'none') {
              // Zuweisung entfernen
              updateData.mitarbeiter_id = null;
              updateData.startzeit = null;
              delete details._gesamt_mitarbeiter_id;
              delete details._startzeit;
              // Auch individuelle Zuordnungen der Arbeiten entfernen
              for (const key in details) {
                if (!key.startsWith('_') && typeof details[key] === 'object') {
                  delete details[key].mitarbeiter_id;
                  delete details[key].lehrling_id;
                  delete details[key].type;
                  delete details[key].startzeit;
                }
              }
              updateData.arbeitszeiten_details = JSON.stringify(details);
            } else if (aenderung.type === 'lehrling' && aenderung.lehrling_id) {
              updateData.mitarbeiter_id = null;
              details._gesamt_mitarbeiter_id = { type: 'lehrling', id: aenderung.lehrling_id };
              details._startzeit = aenderung.startzeit;
              // Alle Arbeiten dem Lehrling zuordnen
              for (const key in details) {
                if (!key.startsWith('_') && typeof details[key] === 'object') {
                  details[key].type = 'lehrling';
                  details[key].lehrling_id = aenderung.lehrling_id;
                  delete details[key].mitarbeiter_id;
                  details[key].startzeit = aenderung.startzeit;
                }
              }
              updateData.arbeitszeiten_details = JSON.stringify(details);
            } else if (aenderung.mitarbeiter_id) {
              updateData.mitarbeiter_id = aenderung.mitarbeiter_id;
              details._gesamt_mitarbeiter_id = { type: 'mitarbeiter', id: aenderung.mitarbeiter_id };
              details._startzeit = aenderung.startzeit;
              // Alle Arbeiten dem Mitarbeiter zuordnen
              for (const key in details) {
                if (!key.startsWith('_') && typeof details[key] === 'object') {
                  details[key].type = 'mitarbeiter';
                  details[key].mitarbeiter_id = aenderung.mitarbeiter_id;
                  delete details[key].lehrling_id;
                  details[key].startzeit = aenderung.startzeit;
                }
              }
              updateData.arbeitszeiten_details = JSON.stringify(details);
            } else {
              updateData.mitarbeiter_id = null;
            }
          }
          
          // Prüfe ob Termin schwebend war und jetzt zugeordnet wird
          const wirdZugeordnet = aenderung.type !== 'none' && (aenderung.mitarbeiter_id || aenderung.lehrling_id || aenderung.hatArbeitAenderungen);
          const warSchwebend = aenderung.warSchwebend || termin.ist_schwebend === 1 || termin.ist_schwebend === true;
          
          // Wenn schwebender Termin eingeplant wird, ist_schwebend auf 0 setzen
          if (wirdZugeordnet && warSchwebend) {
            updateData.ist_schwebend = 0;
          }
          
          await TermineService.update(terminId, updateData);
          
          erfolge++;
        } catch (error) {
          console.error(`Fehler beim Speichern von Termin ${terminId}:`, error);
          fehler++;
        }
      }
      
      // Änderungspuffer leeren
      this.planungAenderungen.clear();
      
      // Markierung "geaendert" von allen Elementen entfernen
      document.querySelectorAll('.timeline-termin.geaendert').forEach(el => {
        el.classList.remove('geaendert');
      });
      
      if (speichernBtn) {
        speichernBtn.innerHTML = '💾 Speichern';
      }
      
      // UI aktualisieren
      this.updatePlanungAenderungenUI();
      
      // Feedback
      if (fehler === 0) {
        this.showToast(`${erfolge} Startzeit${erfolge !== 1 ? 'en' : ''} erfolgreich gespeichert!`, 'success');
      } else {
        this.showToast(`${erfolge} gespeichert, ${fehler} fehlgeschlagen`, fehler > 0 ? 'warning' : 'success');
      }
      
      // Markiere dass Auslastungsanzeige neu geladen werden muss
      this.auslastungNeedsRefresh = true;
      
      // Vollständig neu laden um Konsistenz sicherzustellen
      this.loadAuslastungDragDrop();

      // A4 Slot-Nachfüllung: Prüfe ob freie Lücken entstanden sind
      if (erfolge > 0) {
        this._pruefeSlotNachfuellung().catch(() => {});
      }
    },

    verwerfePlanungAenderungen() {
      if (this.planungAenderungen.size === 0) return;
      
      if (!confirm(`${this.planungAenderungen.size} Änderung(en) verwerfen?`)) return;
      
      this.planungAenderungen.clear();
      this.updatePlanungAenderungenUI();
      this.showToast('Änderungen verworfen', 'info');
      
      // Neu laden um Originalzustand wiederherzustellen
      this.loadAuslastungDragDrop();
    },

    updateInArbeitBars() {
      const container = document.getElementById('auslastungDragDropContainer');
      if (!container) return;

      const pixelPerMinute = 100 / 60;
      const nebenzeitProzent = this._planungNebenzeitProzent || 0;
      const tracksToResolve = new Set();

      // Einzelne / zusammengefasste Termine (createTimelineTerminWithPause → .timeline-termin)
      container.querySelectorAll('.timeline-termin:not(.fortsetzung):not(.arbeit-block)').forEach(el => {
        const terminId = parseInt(el.dataset.terminId);
        const termin = this.termineById[terminId];
        if (!termin || termin.status !== 'in_arbeit') return;

        const neueDauer = this.getTerminGesamtdauer(termin);
        const neueBreite = Math.max(neueDauer * pixelPerMinute, 40);
        if (parseFloat(el.style.width) !== neueBreite) {
          el.style.width = `${neueBreite}px`;
          el.dataset.dauer = neueDauer;
          tracksToResolve.add(el.parentElement);
        }

        // Roten Überlauf-Balken aktualisieren
        const geplanteDauer = parseInt(el.dataset.geplanteDauer) || 0;
        if (geplanteDauer > 0) {
          let overtimeDiv = el.querySelector('.timeline-termin-overtime');
          if (neueDauer > geplanteDauer) {
            const plannedPx = geplanteDauer * pixelPerMinute;
            const overtimePx = Math.max((neueDauer - geplanteDauer) * pixelPerMinute, 4);
            if (!overtimeDiv) {
              overtimeDiv = document.createElement('div');
              overtimeDiv.className = 'timeline-termin-overtime';
              el.appendChild(overtimeDiv);
            }
            overtimeDiv.style.left = `${plannedPx}px`;
            overtimeDiv.style.width = `${overtimePx}px`;
          } else if (overtimeDiv) {
            overtimeDiv.remove();
          }
        }
      });

      // Mehrteilige Arbeitsblöcke (createArbeitBlockElement → .arbeit-block)
      container.querySelectorAll('.timeline-termin.arbeit-block:not(.fortsetzung)').forEach(el => {
        const terminId = parseInt(el.dataset.terminId);
        const termin = this.termineById[terminId];
        if (!termin || termin.status !== 'in_arbeit') return;

        const liveDauerGesamt = this.getTerminGesamtdauer(termin);
        const originalDauer = parseInt(el.dataset.originalDauer) || 0;
        if (!originalDauer) return;

        tracksToResolve.add(el.parentElement);

        // Geplante Gesamtzeit aller Arbeiten für die Proportionsberechnung
        let geplantGesamt = 0;
        if (termin.arbeitszeiten_details) {
          try {
            const details = typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details)
              : termin.arbeitszeiten_details;
            for (const [key, value] of Object.entries(details)) {
              if (key.startsWith('_')) continue;
              if (typeof value === 'number' && value > 0) geplantGesamt += value;
              else if (typeof value === 'object' && parseInt(value.zeit) > 0) geplantGesamt += parseInt(value.zeit);
            }
          } catch(e) {}
        }
        if (!geplantGesamt) geplantGesamt = parseInt(termin.geschaetzte_zeit) || 60;

        const liveDauerProArbeit = Math.max(1, Math.round(liveDauerGesamt * (originalDauer / geplantGesamt)));
        const dauerMitNebenzeit = nebenzeitProzent > 0
          ? Math.round(liveDauerProArbeit * (1 + nebenzeitProzent / 100))
          : liveDauerProArbeit;
        const neueBreite = Math.max(dauerMitNebenzeit * pixelPerMinute, 40);
        if (parseFloat(el.style.width) !== neueBreite) {
          el.style.width = `${neueBreite}px`;
        }
      });

      tracksToResolve.forEach(track => {
        if (track) this.resolveTimelineOverlaps(track);
      });
    },

    addArbeitspauseOverlays(termine, mitarbeiterMap, lehrlingeMap, startHour) {
      const pixelPerMinute = 100 / 60; // 100px pro Stunde

      const isoToHHMM = (iso) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d)) return null;
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      };
      const hhmmToMin = (hhmm) => {
        if (!hhmm) return null;
        const m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
        return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
      };
      const grundLabels = { teil_fehlt: 'Teil fehlt', rueckfrage_kunde: 'Rückfrage Kunde', vorrang: 'Vorrang' };

      for (const termin of termine) {
        const pausen = termin.arbeitspausen;
        if (!pausen || pausen.length === 0) continue;
        const status = termin.status;
        if (status !== 'in_arbeit' && status !== 'abgeschlossen' && status !== 'wartend') continue;

        // Zugehörigen Track-Container finden
        let track = null;
        if (termin.mitarbeiter_id && mitarbeiterMap[termin.mitarbeiter_id]) {
          track = mitarbeiterMap[termin.mitarbeiter_id];
        } else if (termin.lehrling_id && lehrlingeMap[termin.lehrling_id]) {
          track = lehrlingeMap[termin.lehrling_id];
        } else {
          // Aus arbeitszeiten_details ermitteln
          try {
            const det = typeof termin.arbeitszeiten_details === 'string'
              ? JSON.parse(termin.arbeitszeiten_details) : (termin.arbeitszeiten_details || {});
            if (det._gesamt_mitarbeiter_id) {
              const { type, id } = det._gesamt_mitarbeiter_id;
              if (type === 'mitarbeiter' && mitarbeiterMap[id]) track = mitarbeiterMap[id];
              else if (type === 'lehrling' && lehrlingeMap[id]) track = lehrlingeMap[id];
            }
          } catch (_) {}
        }
        if (!track) continue;

        const jetzt = new Date();
        const jetztHHMM = String(jetzt.getHours()).padStart(2, '0') + ':' + String(jetzt.getMinutes()).padStart(2, '0');

        for (const p of pausen) {
          const pauseStartHHMM = isoToHHMM(p.gestartet_am);
          if (!pauseStartHHMM) continue;
          const pauseEndeHHMM = p.beendet_am ? isoToHHMM(p.beendet_am) : jetztHHMM;
          if (!pauseEndeHHMM) continue;

          const pStartMin = hhmmToMin(pauseStartHHMM);
          const pEndeMin = hhmmToMin(pauseEndeHHMM);
          if (pStartMin === null || pEndeMin === null || pEndeMin <= pStartMin) continue;

          const leftPx = (pStartMin - startHour * 60) * pixelPerMinute;
          if (leftPx < 0) continue; // Außerhalb sichtbarer Bereich
          const widthPx = Math.max((pEndeMin - pStartMin) * pixelPerMinute, 8);
          const istAktiv = !p.beendet_am;
          const grundTxt = grundLabels[p.grund] || p.grund || '';
          const dauerMin = Math.round(pEndeMin - pStartMin);
          const tooltip = `🔧 Auftragsunterbrechung\n${pauseStartHHMM}–${pauseEndeHHMM} (${dauerMin} min)${grundTxt ? '\nGrund: ' + grundTxt : ''}${istAktiv ? '\n(läuft…)' : ''}`;

          const overlay = document.createElement('div');
          overlay.className = 'arbeitspause-overlay' + (istAktiv ? ' aktiv' : '');
          overlay.title = tooltip;
          overlay.style.cssText = `
            position:absolute;
            left:${leftPx}px;
            width:${widthPx}px;
            top:2px;
            bottom:2px;
            background:repeating-linear-gradient(45deg,#fd7e14,#fd7e14 4px,rgba(253,126,20,0.25) 4px,rgba(253,126,20,0.25) 8px);
            border-left:2px solid #fd7e14;
            border-right:2px solid #fd7e14;
            border-radius:3px;
            z-index:15;
            pointer-events:all;
            cursor:help;
            box-sizing:border-box;
          `;
          // Dauer-Label wenn breit genug
          if (widthPx >= 24) {
            const label = document.createElement('span');
            label.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px;font-weight:700;color:#fff;white-space:nowrap;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.5);';
            label.textContent = `🔧 ${dauerMin}′`;
            overlay.appendChild(label);
          }
          track.appendChild(overlay);
        }
      }
    },

    addTimelineNowLine(startHour, endHour) {
      // Alte Linien/Marker entfernen
      document.querySelectorAll('.timeline-now-line, .timeline-now-marker-header').forEach(line => line.remove());

      // Vorherigen Interval stoppen falls vorhanden
      if (this.nowLineInterval) {
        clearInterval(this.nowLineInterval);
        this.nowLineInterval = null;
      }

      // Start-/End-Stunden für scrollTimelineToNow merken
      this._timelineStartHour = startHour;
      this._timelineEndHour = endHour;

      const updateNowLine = () => {
        // Alte Linien/Marker entfernen
        document.querySelectorAll('.timeline-now-line, .timeline-now-marker-header').forEach(line => line.remove());

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Live-Uhr immer aktualisieren (auch außerhalb sichtbarer Stunden)
        const clockEl = document.getElementById('timelineLiveClock');
        if (clockEl) {
          clockEl.textContent = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
        }

        // Nur anzeigen wenn innerhalb der sichtbaren Stunden
        if (currentHour < startHour || currentHour > endHour) return;

        const pixelPerHour = 100; // Muss mit anderen Timeline-Elementen übereinstimmen
        const pixelPerMinute = pixelPerHour / 60;
        const leftPx = ((currentHour - startHour) * 60 + currentMinute) * pixelPerMinute;

        // Füge Linie zu jeder Timeline-Track hinzu
        document.querySelectorAll('.timeline-track').forEach(track => {
          const line = document.createElement('div');
          line.className = 'timeline-now-line';
          line.style.left = `${leftPx}px`;
          track.appendChild(line);
        });

        // Header-Marker (Pin mit Uhrzeit + Pfeil) im Stunden-Header
        const hoursHeader = document.getElementById('timelineHours');
        if (hoursHeader) {
          const marker = document.createElement('div');
          marker.className = 'timeline-now-marker-header';
          marker.style.left = `${leftPx}px`;
          marker.innerHTML = `<div class="pin">${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}</div><div class="arrow"></div>`;
          hoursHeader.appendChild(marker);
        }
      };

      // Initial zeichnen
      updateNowLine();

      // Alle 60 Sekunden aktualisieren
      this.nowLineInterval = setInterval(updateNowLine, 60000);
    },

    scrollTimelineToNow() {
      const container = document.querySelector('.planning-layout .timeline-container');
      if (!container) return;
      const startHour = this._timelineStartHour ?? 8;
      const endHour = this._timelineEndHour ?? 18;
      const now = new Date();
      let h = now.getHours();
      let m = now.getMinutes();
      // Wenn außerhalb der Sichtbaren Stunden: an den Rand scrollen
      if (h < startHour) { h = startHour; m = 0; }
      if (h > endHour) { h = endHour; m = 0; }
      const pixelPerHour = 100;
      const labelWidth = 120; // .timeline-label
      const offsetMin = (h - startHour) * 60 + m;
      const leftPx = labelWidth + offsetMin * (pixelPerHour / 60);
      container.scrollTo({ left: leftPx - container.clientWidth / 2, behavior: 'smooth' });
    },

    createTerminMiniCard(termin, options = {}) {
      const card = document.createElement('div');
      const isSchwebend = termin.ist_schwebend === 1 || termin._istSchwebend;
      const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true || termin.erweiterung_von_id;
      
      card.className = `termin-mini-card status-${termin.status.toLowerCase().replace(' ', '-')}${isSchwebend ? ' schwebend' : ''}${istErweiterung ? ' erweiterung-block' : ''}`;
      card.draggable = true;
      card.id = `termin-card-${termin.id}`;
      
      // Echte Dauer aus arbeitszeiten_details berechnen
      const dauer = this.getTerminGesamtdauer(termin);
      card.dataset.dauer = dauer;
      card.dataset.schwebend = isSchwebend ? '1' : '0';
      card.dataset.datum = termin.datum || '';

      const schwebendBadge = isSchwebend ? '<span class="schwebend-badge" title="Schwebender Termin">⏸</span>' : '';
      const wiederholungMiniCardBadge = (termin.ist_wiederholung)
        ? '<span style="background:#dc3545;color:white;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:bold;">🔁</span>'
        : '';

      // Zähle Erweiterungen zu diesem Termin
      let erweiterungAnzahl = 0;
      if (this.termineById) {
        Object.values(this.termineById).forEach(t => {
          if (t.erweiterung_von_id === termin.id && !t.ist_geloescht) {
            erweiterungAnzahl++;
          }
        });
      }
      
      // Erweiterungs-Badge (für Termine mit Erweiterungen)
      const erweiterungBadge = erweiterungAnzahl > 0 
        ? `<span class="mini-card-erweiterung-badge" title="${erweiterungAnzahl} Erweiterung(en)">🔗${erweiterungAnzahl}</span>` 
        : '';
      
      // Ist-Erweiterung Badge
      const istErweiterungBadge = istErweiterung 
        ? '<span class="mini-card-ist-erweiterung" title="Dies ist eine Erweiterung">🔗</span>' 
        : '';
      
      // Dauer formatiert anzeigen
      const dauerText = dauer >= 60 
        ? `${Math.floor(dauer/60)}h ${dauer%60 > 0 ? (dauer%60) + 'min' : ''}`.trim()
        : `${dauer} min`;
      
      // Bring/Abholzeit für Anzeige
      const bringZeitText = termin.bring_zeit ? `🚗↓ ${termin.bring_zeit}` : '';
      const abholZeitText = termin.abholung_zeit ? `🚗↑ ${termin.abholung_zeit}` : '';
      const zeitenInfo = [bringZeitText, abholZeitText].filter(t => t).join(' • ');
      
      card.innerHTML = `
        <div class="header">
          <span>${schwebendBadge}${istErweiterungBadge}${wiederholungMiniCardBadge}${termin.termin_nr || 'Neu'}${erweiterungBadge}</span>
          <span>${termin.kennzeichen || ''}</span>
        </div>
        <div class="details">
          ${termin.kunde_name || 'Unbekannt'}
        </div>
        <div class="zeit">
          ⏱️ ${dauerText}${isSchwebend ? ' • schwebend' : ''}
        </div>
        ${zeitenInfo ? `<div class="zeiten">${zeitenInfo}</div>` : ''}
      `;
      
      // Klick-Handler für Erweiterungs-Badge
      if (erweiterungAnzahl > 0) {
        const badge = card.querySelector('.mini-card-erweiterung-badge');
        if (badge) {
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showVerknuepfteTermine(termin.id);
          });
        }
      }
      
      // Klick-Handler für Ist-Erweiterung Badge
      if (istErweiterung) {
        const badge = card.querySelector('.mini-card-ist-erweiterung');
        if (badge) {
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.showVerknuepfteTermine(termin.id);
          });
        }
      }

      // Drag Events
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', termin.id);
        e.dataTransfer.setData('application/x-dauer', dauer.toString());
        e.dataTransfer.effectAllowed = 'move';
        
        // Zeit-Indikator erstellen (auch für Mini-Cards)
        this.createDragTimeIndicator();
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.drop-zone').forEach(zone => zone.classList.remove('drag-over'));
        // Zeit-Indikator entfernen
        this.removeDragTimeIndicator();
      });

      // Klick: Im "Nicht zugeordnet"-Panel → direkt Details; sonst Schnell-Menü / Shift+Details
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const aktuellerTermin = this.termineById[termin.id] || termin;
        const startzeit = termin.startzeit || termin.bring_zeit || '08:00';
        
        if (options.context === 'nicht-zugeordnet' || e.shiftKey) {
          // Nicht-zugeordnet oder Shift+Klick → Details anzeigen
          this.showTerminDetails(termin.id);
        } else {
          // Normaler Klick – Schnell-Status-Dialog
          this.showSchnellStatusDialog(aktuellerTermin, card, startzeit, dauer);
        }
      });

      return card;
    },

    setupDropZone(element) {
      element.addEventListener('dragover', (e) => {
        e.preventDefault(); // Erlaubt Drop
        e.dataTransfer.dropEffect = 'move';
        element.classList.add('drag-over');
      });

      element.addEventListener('dragleave', () => {
        element.classList.remove('drag-over');
      });

      element.addEventListener('drop', async (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');
        // Zeit-Indikator entfernen
        this.removeDragTimeIndicator();
        
        const terminId = e.dataTransfer.getData('text/plain');
        
        if (terminId) {
          // Entferne Zuweisung (mitarbeiter_id = null, arbeitszeiten_details bereinigen)
          await this.removeTerminZuweisung(terminId);
        }
      });
    },

    async removeTerminZuweisung(terminId) {
      try {
        // Lade aktuellen Termin für Original-Daten
        const termin = await TermineService.getById(terminId);
        
        // Speichere Original-Daten wenn noch nicht vorhanden
        if (!this.planungAenderungen.has(terminId)) {
          this.planungAenderungen.set(terminId, {
            originalData: {
              startzeit: termin.startzeit,
              mitarbeiter_id: termin.mitarbeiter_id,
              arbeitszeiten_details: termin.arbeitszeiten_details
            }
          });
        }
        
        // Aktualisiere Änderungspuffer - Zuweisung entfernen
        const aenderung = this.planungAenderungen.get(terminId);
        aenderung.mitarbeiter_id = null;
        aenderung.lehrling_id = null;
        aenderung.startzeit = null;
        aenderung.type = 'none';
        
        // Änderungen-Zähler aktualisieren
        this.updatePlanungAenderungenUI();
        
        // Vollständige Neuladung, da Termin in "Nicht zugeordnet" verschoben wird
        this.loadAuslastungDragDrop();

      } catch (error) {
        console.error('Fehler beim Entfernen der Zuweisung:', error);
        alert('Fehler: ' + (error.message || 'Unbekannter Fehler'));
      }
    },

    async moveTerminToMitarbeiter(terminId, mitarbeiterId) {
      try {
        const targetMitarbeiterId = mitarbeiterId === 'null' ? null : parseInt(mitarbeiterId);
        
        // API Update
        await TermineService.update(terminId, { mitarbeiter_id: targetMitarbeiterId });

        // Reload um Konsistenz zu sichern und Kapazitäten zu aktualisieren
        this.loadAuslastungDragDrop();

      } catch (error) {
        console.error('Fehler beim Verschieben:', error);
        alert('Fehler beim Verschieben des Termins: ' + (error.message || 'Unbekannter Fehler'));
        // Rollback durch Reload
        this.loadAuslastungDragDrop();
      }
    },

    updateMitarbeiterKapazitaeten(mitarbeiterListe, termine) {
      // Berechne Summen pro Mitarbeiter
      const summen = {};
      mitarbeiterListe.forEach(ma => summen[ma.id] = 0);
      
      termine.forEach(t => {
        if (t.mitarbeiter_id && summen[t.mitarbeiter_id] !== undefined) {
          summen[t.mitarbeiter_id] += (t.geschaetzte_zeit || 0);
        }
      });

      // Update UI
      mitarbeiterListe.forEach(ma => {
        // Finde den Header für diesen Mitarbeiter
        const slots = document.querySelectorAll('.mitarbeiter-slot');
        slots.forEach(slot => {
          const zone = slot.querySelector('.drop-zone');
          if (zone && parseInt(zone.dataset.mitarbeiterId) === ma.id) {
            const kapazitaetSpan = slot.querySelector('.mitarbeiter-kapazitaet');
            if (kapazitaetSpan) {
              const max = ma.verfuegbare_minuten || 480;
              const current = summen[ma.id];
              kapazitaetSpan.textContent = `${current}/${max} min`;
              
              if (current > max) {
                kapazitaetSpan.style.color = 'var(--accent)';
                kapazitaetSpan.style.fontWeight = 'bold';
              } else {
                kapazitaetSpan.style.color = 'var(--muted)';
                kapazitaetSpan.style.fontWeight = 'normal';
              }
            }
          }
        });
      });
    },

    async _loadAuslastungWarnungenZeitleiste(datum) {
      const banner = document.getElementById('auslastungWarnungBannerZeitleiste');
      const liste  = document.getElementById('auslastungWarnungListeZeitleiste');
      if (!banner || !liste) return;
      banner.style.display = 'none';
      try {
        const res = await KIPlanungService.getAnomalien(datum);
        if (res?.success && res.warnungen?.length > 0) {
          liste.innerHTML = res.warnungen.map(w => `<li>${w}</li>`).join('');
          banner.style.display = 'block';
        }
      } catch (_) { /* Banner bleibt verborgen bei Fehler */ }
    },

    async _pruefeSlotNachfuellung() {
      // Guard: nur wenn Slot-Nachfüllung aktiviert
      if (!document.getElementById('slotNachfuellungEnabled')?.checked) return;
      // Ermittle aktuelles Planungsdatum aus dem Drag&Drop-State
      const datumEl = document.getElementById('planungDatumInput') || document.getElementById('auslastungDatum');
      const datum = datumEl?.value || this.formatDateLocal(new Date());

      try {
        const data = await window.KIPlanungService.getLueckenVorschlaege(datum, null, null, null);
        if (data && data.vorschlaege && data.vorschlaege.length > 0) {
          this._zeigeSlotNachfuellungPopup(data.vorschlaege, datum);
        }
      } catch (e) {
        // Nicht kritisch, ignorieren
      }
    },

    _zeigeSlotNachfuellungPopup(vorschlaege, datum) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#fff;border:1px solid #ddd;border-radius:12px;padding:16px;max-width:320px;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:9000;';
      overlay.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong>💡 Freie Lücke — Vorschläge</strong>
          <button onclick="this.closest('.slot-fill-popup').remove()" style="border:none;background:none;font-size:1.2em;cursor:pointer;">×</button>
        </div>
        <p style="font-size:0.85em;color:#666;margin-bottom:8px;">Schwebende Termine die jetzt passen würden:</p>
        ${vorschlaege.slice(0, 3).map(v => `
          <div class="slot-item" style="padding:8px;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:6px;font-size:0.9em;">
            <strong>${this._escapeHtml(v.kunde_name || 'Unbekannt')}</strong> — ${this._escapeHtml(v.arbeit || '')}<br>
            <small>${v.geschaetzte_zeit || '?'} Min. · Wartet: ${v.wartezeit_tage || 0} Tage</small><br>
            <button class="btn btn-sm" style="margin-top:4px;" onclick="app.showTerminDetails(${v.id}); this.closest('.slot-fill-popup').remove();">Einplanen</button>
          </div>
        `).join('')}
      `;
      overlay.classList.add('slot-fill-popup');
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 20000);
    },
  });
}
