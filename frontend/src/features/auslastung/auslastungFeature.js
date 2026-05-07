export function installAuslastungFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async loadAuslastung() {
      const datumInput = document.getElementById('auslastungDatum');
      if (!datumInput) return;
      const datum = datumInput.value;

      if (!datum) return;

      // Aktualisiere Wocheninfo-Anzeige
      this.updateAuslastungWocheInfo();
      
      // Starte Zeitleisten-Jetzt-Marker Aktualisierung
      this.startZeitleisteNowLineUpdate();

      try {
        const data = await AuslastungService.getByDatum(datum);
        await this.loadAuslastungWoche();
        
        // Lade Zeitleiste
        await this.loadZeitleiste(datum);

        // Anomalien-Check im Hintergrund
        this._loadAuslastungWarnungenZeitleiste(datum);

        // Zeige die Zeiten nach Status
        document.getElementById('geplant').textContent = this.formatMinutesToHours(data.geplant_minuten || 0);
        document.getElementById('inArbeit').textContent = this.formatMinutesToHours(data.in_arbeit_minuten || 0);
        document.getElementById('abgeschlossen').textContent = this.formatMinutesToHours(data.abgeschlossen_minuten || 0);
        document.getElementById('verfuegbar').textContent = this.formatMinutesToHours(data.verfuegbar_minuten);
        const auslastungProzent = data.auslastung_prozent || 0;
        const prozentElement = document.getElementById('prozent');
        if (prozentElement) {
          prozentElement.textContent = `${auslastungProzent}%`;
          
          // Farbcodierung basierend auf Auslastung
          prozentElement.style.color = '';
          prozentElement.style.fontWeight = 'bold';
          if (auslastungProzent > 100) {
            prozentElement.style.color = '#c62828'; // Rot
          } else if (auslastungProzent > 80) {
            prozentElement.style.color = '#f57c00'; // Orange
          } else {
            prozentElement.style.color = '#2e7d32'; // Grün
          }
        }

        if (data.gesamt_minuten) {
          let verfuegbarText = `${this.formatMinutesToHours(data.verfuegbar_minuten)} (${this.formatMinutesToHours(data.gesamt_minuten)} gesamt)`;
          if (data.servicezeit_minuten && data.servicezeit_minuten > 0) {
            verfuegbarText += ` - Servicezeit: ${this.formatMinutesToHours(data.servicezeit_minuten)}`;
          }
          document.getElementById('verfuegbar').textContent = verfuegbarText;
        }
        if (data.einstellungen) {
          // NICHT mehr hier die Einstellungen überschreiben - das führt zu Race-Conditions
          // Die Einstellungen werden in loadWerkstattSettings() geladen
          // this.prefillWerkstattSettings(data.einstellungen);
        }
        if (data.abwesenheit) {
          this.prefillAbwesenheit(datum, data.abwesenheit);
        }

        // Berechne Prozentanteile für die Segmente
        // Verwende belegt_minuten (inkl. Nebenzeit) für die Balkenberechnung
        const belegtMinuten = data.belegt_minuten_mit_service || data.belegt_minuten || 0;
        const referenzMinuten = data.gesamt_minuten > 0 ? data.gesamt_minuten : (belegtMinuten > 0 ? belegtMinuten : 1);
        
        // Berechne die Anteile basierend auf der belegten Zeit (proportional)
        const geplantRoh = data.geplant_minuten || 0;
        const inArbeitRoh = data.in_arbeit_minuten || 0;
        const abgeschlossenRoh = data.abgeschlossen_minuten || 0;
        const belegteZeitRoh = geplantRoh + inArbeitRoh + abgeschlossenRoh;
        
        // Skaliere die Segmente auf die tatsächliche Auslastung
        const auslastungFaktor = belegteZeitRoh > 0 ? belegtMinuten / belegteZeitRoh : 1;
        const geplantProzent = ((geplantRoh * auslastungFaktor) / referenzMinuten) * 100;
        const inArbeitProzent = ((inArbeitRoh * auslastungFaktor) / referenzMinuten) * 100;
        const abgeschlossenProzent = ((abgeschlossenRoh * auslastungFaktor) / referenzMinuten) * 100;

        // Setze die Breite der Segmente
        const geplantSegment = document.getElementById('progressGeplant');
        const inArbeitSegment = document.getElementById('progressInArbeit');
        const abgeschlossenSegment = document.getElementById('progressAbgeschlossen');

        if (geplantSegment && inArbeitSegment && abgeschlossenSegment) {
          geplantSegment.style.width = `${Math.min(geplantProzent, 100)}%`;
          inArbeitSegment.style.width = `${Math.min(inArbeitProzent, 100)}%`;
          abgeschlossenSegment.style.width = `${Math.min(abgeschlossenProzent, 100)}%`;

          // Farbcodierung für Gesamtauslastung
          const gesamtAuslastung = auslastungProzent;
          const progressBar = geplantSegment.parentElement;
          if (progressBar) {
            if (gesamtAuslastung > 100) {
              progressBar.style.borderColor = '#c62828';
              progressBar.style.backgroundColor = '#ffebee';
            } else if (gesamtAuslastung > 80) {
              progressBar.style.borderColor = '#f57c00';
              progressBar.style.backgroundColor = '#fff3e0';
            } else {
              progressBar.style.borderColor = '#2e7d32';
              progressBar.style.backgroundColor = '#e8f5e9';
            }
          }

          // Zeige oder verstecke den "Keine Termine" Text
          const emptyText = document.getElementById('progressEmpty');
          if (emptyText) {
            const hasTermine = (data.geplant_minuten || 0) + (data.in_arbeit_minuten || 0) + (data.abgeschlossen_minuten || 0) > 0;
            emptyText.style.display = hasTermine ? 'none' : 'block';
          }

          // Optional: Zeige Prozent-Text in den Segmenten
          if (geplantProzent > 10) {
            geplantSegment.textContent = `${Math.round(geplantProzent)}%`;
          } else {
            geplantSegment.textContent = '';
          }

          if (inArbeitProzent > 10) {
            inArbeitSegment.textContent = `${Math.round(inArbeitProzent)}%`;
          } else {
            inArbeitSegment.textContent = '';
          }

          if (abgeschlossenProzent > 10) {
            abgeschlossenSegment.textContent = `${Math.round(abgeschlossenProzent)}%`;
          } else {
            abgeschlossenSegment.textContent = '';
          }
        } else {
          console.error('Progress-Segmente nicht gefunden:', {
            geplant: !!geplantSegment,
            inArbeit: !!inArbeitSegment,
            abgeschlossen: !!abgeschlossenSegment
          });
        }

        // Schwebende Termine anzeigen (GLOBAL - unabhängig vom Datum)
        const schwebendDisplay = document.getElementById('schwebendDisplay');
        const schwebendAnzahl = data.schwebend_anzahl || 0;
        const schwebendMinuten = data.schwebend_minuten || 0;
        
        if (schwebendDisplay) {
          if (schwebendAnzahl > 0) {
            schwebendDisplay.style.display = 'block';
            document.getElementById('schwebendAnzahl').textContent = schwebendAnzahl;
            document.getElementById('schwebendZeit').textContent = this.formatMinutesToHours(schwebendMinuten);
            
            // Der Balken ist immer voll (100%), da er nicht relativ zur Tageskapazität ist
            const progressSchwebend = document.getElementById('progressSchwebend');
            if (progressSchwebend) {
              progressSchwebend.style.width = '100%';
              progressSchwebend.textContent = this.formatMinutesToHours(schwebendMinuten);
            }
          } else {
            schwebendDisplay.style.display = 'none';
          }
        }

        // Zeige pro-Mitarbeiter- und Lehrling-Auslastung zusammen
        const container = document.getElementById('mitarbeiterAuslastungContainer');
        const section = document.getElementById('mitarbeiterAuslastungSection');
        
        // Lade aktive Pausen
        let aktivePausen = [];
        try {
          aktivePausen = await fetch(`${CONFIG.API_URL}/pause/aktive`)
            .then(res => res.ok ? res.json() : []);
        } catch (error) {
          console.error('Fehler beim Laden der aktiven Pausen:', error);
        }
        
        if (container && section) {
          let html = '';
          
          // Mitarbeiter-Auslastung
          if (data.mitarbeiter_auslastung && Array.isArray(data.mitarbeiter_auslastung) && data.mitarbeiter_auslastung.length > 0) {
            html += data.mitarbeiter_auslastung.map(ma => {
              // Abwesende Mitarbeiter rot markieren
              const istAbwesend = ma.ist_abwesend === true;
              const abwesenheitsTyp = ma.abwesenheits_typ || '';
              const abwesendStyle = istAbwesend ? 'background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border-left: 4px solid #c62828;' : '';
              
              // Spezifischer Badge je nach Abwesenheitstyp
              let abwesendBadge = '';
              if (istAbwesend) {
                const abwesenheitsLabels = {
                  'urlaub': '🏖️ URLAUB',
                  'krank': '🤒 KRANK',
                  'lehrgang': '📖 LEHRGANG',
                  'berufsschule': '📚 BERUFSSCHULE'
                };
                const label = abwesenheitsLabels[abwesenheitsTyp] || '🏥 ABWESEND';
                abwesendBadge = `<span style="background: #c62828; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">${label}</span>`;
              }
              
              // Prüfe ob Mitarbeiter in Pause ist
              const pauseInfo = aktivePausen.find(p => p.mitarbeiter_id === ma.mitarbeiter_id);
              const pauseBadge = pauseInfo 
                ? `<span style="background: linear-gradient(135deg, #fdcb6e 0%, #e17055 100%); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px; border: 1px solid #d63031;">🍽️ Pause (${pauseInfo.verbleibende_minuten || 0} Min.)</span>` 
                : '';
              
              const prozentColor = istAbwesend ? '#c62828' :
                                  ma.auslastung_prozent > 100 ? '#c62828' :
                                  ma.auslastung_prozent > 80 ? '#f57c00' : '#2e7d32';
              const nurServiceBadge = ma.nur_service ? '<span style="background: #2196f3; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">Nur Service</span>' : '';
              const verfuegbarText = istAbwesend ? '<span style="color: #c62828;">0 h (abwesend)</span>' : this.formatMinutesToHours(ma.verfuegbar_minuten);
              const cardStyle = istAbwesend 
                ? 'margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border-radius: 8px; border-left: 4px solid #c62828;'
                : `margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${prozentColor};`;
              
              // Für "Nur Service" Mitarbeiter: Vereinfachte Anzeige mit Servicezeit + Arbeitszeit + Nebenzeit
              const detailsRow = ma.nur_service 
                ? `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                    <div>Arbeitszeit: ${this.formatMinutesToHours(ma.belegt_minuten_roh || 0)}</div>
                    <div>Servicezeit: ${this.formatMinutesToHours(ma.servicezeit_minuten || 0)}</div>
                    <div>Nebenzeit: ${ma.nebenzeit_prozent || 0}% (${this.formatMinutesToHours(ma.nebenzeit_minuten || 0)})</div>
                    <div>Termine: ${ma.termin_anzahl || 0}</div>
                  </div>`
                : `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                    <div>Geplant: ${this.formatMinutesToHours(ma.geplant_minuten)}</div>
                    <div>In Arbeit: ${this.formatMinutesToHours(ma.in_arbeit_minuten)}</div>
                    <div>Abgeschlossen: ${this.formatMinutesToHours(ma.abgeschlossen_minuten)}</div>
                    <div>Servicezeit: ${this.formatMinutesToHours(ma.servicezeit_minuten || 0)}</div>
                  </div>`;
              
              return `
                <div style="${cardStyle}">
                  <h4 style="margin: 0 0 10px 0;">${ma.mitarbeiter_name}${abwesendBadge}${pauseBadge}${nurServiceBadge}${(ma.nacharbeit_anzahl || 0) > 0 ? `<span style="background: #e65100; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">🔧 Nacharbeit (${ma.nacharbeit_anzahl})</span>` : ''}</h4>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                    <div><strong>Verfügbar:</strong> ${verfuegbarText}</div>
                    <div><strong>Belegt:</strong> ${this.formatMinutesToHours(ma.belegt_minuten)}</div>
                    <div><strong>Auslastung:</strong> <span style="color: ${prozentColor}; font-weight: bold;">${istAbwesend ? '-' : ma.auslastung_prozent + '%'}</span></div>
                  </div>
                  ${detailsRow}
                  ${(ma.nacharbeit_anzahl || 0) > 0 ? `<div style="font-size: 0.85em; color: #e65100; margin-bottom: 6px;">🔧 Nacharbeit-Zeit: ${this.formatMinutesToHours(ma.nacharbeit_minuten || 0)}</div>` : ''}
                  <div style="margin-top: 10px; height: 20px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                    <div style="height: 100%; width: ${istAbwesend ? 0 : Math.min(ma.auslastung_prozent, 100)}%; background: ${prozentColor}; transition: width 0.3s;"></div>
                  </div>
                </div>
              `;
            }).join('');
          }
          
          // Lehrling-Auslastung - immer anzeigen, auch wenn keine Termine vorhanden
          // Prüfe sowohl lehrlinge_auslastung als auch lehrlinge (Fallback)
          const lehrlingeAuslastung = data.lehrlinge_auslastung || [];
          if (Array.isArray(lehrlingeAuslastung) && lehrlingeAuslastung.length > 0) {
            html += lehrlingeAuslastung.map(la => {
              // Abwesende Lehrlinge rot markieren
              const istAbwesend = la.ist_abwesend === true;
              const abwesenheitsTyp = la.abwesenheits_typ || '';
              
              // Spezifischer Badge je nach Abwesenheitstyp
              let abwesendBadge = '';
              if (istAbwesend) {
                const abwesenheitsLabels = {
                  'urlaub': '🏖️ URLAUB',
                  'krank': '🤒 KRANK',
                  'lehrgang': '📖 LEHRGANG',
                  'berufsschule': '📚 BERUFSSCHULE'
                };
                const label = abwesenheitsLabels[abwesenheitsTyp] || '🏥 ABWESEND';
                abwesendBadge = `<span style="background: #c62828; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">${label}</span>`;
              }
              
              // Prüfe ob Lehrling in Pause ist
              const pauseInfo = aktivePausen.find(p => p.lehrling_id === la.lehrling_id);
              const pauseBadge = pauseInfo 
                ? `<span style="background: linear-gradient(135deg, #fdcb6e 0%, #e17055 100%); color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px; border: 1px solid #d63031;">🍽️ Pause (${pauseInfo.verbleibende_minuten || 0} Min.)</span>` 
                : '';
              
              const prozentColor = istAbwesend ? '#c62828' :
                                  la.auslastung_prozent > 100 ? '#c62828' :
                                  la.auslastung_prozent > 80 ? '#f57c00' : '#2e7d32';
              const lehrlingBadge = '<span style="background: #9c27b0; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">Lehrling</span>';
              const verfuegbarText = istAbwesend ? '<span style="color: #c62828;">0 h (abwesend)</span>' : this.formatMinutesToHours(la.verfuegbar_minuten || 0);
              const cardStyle = istAbwesend 
                ? 'margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%); border-radius: 8px; border-left: 4px solid #c62828;'
                : `margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${prozentColor};`;
              return `
                <div style="${cardStyle}">
                  <h4 style="margin: 0 0 10px 0;">${la.lehrling_name || la.name || 'Unbekannt'}${abwesendBadge}${pauseBadge}${lehrlingBadge}</h4>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                    <div><strong>Verfügbar:</strong> ${verfuegbarText}</div>
                    <div><strong>Belegt:</strong> ${this.formatMinutesToHours(la.belegt_minuten || 0)}</div>
                    <div><strong>Auslastung:</strong> <span style="color: ${prozentColor}; font-weight: bold;">${istAbwesend ? '-' : (la.auslastung_prozent || 0) + '%'}</span></div>
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                    <div>Geplant: ${this.formatMinutesToHours(la.geplant_minuten || 0)}</div>
                    <div>In Arbeit: ${this.formatMinutesToHours(la.in_arbeit_minuten || 0)}</div>
                    <div>Abgeschlossen: ${this.formatMinutesToHours(la.abgeschlossen_minuten || 0)}</div>
                    <div>Servicezeit: ${this.formatMinutesToHours(la.servicezeit_minuten || 0)}</div>
                  </div>
                  <div style="margin-top: 10px; height: 20px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                    <div style="height: 100%; width: ${istAbwesend ? 0 : Math.min(la.auslastung_prozent || 0, 100)}%; background: ${prozentColor}; transition: width 0.3s;"></div>
                  </div>
                </div>
              `;
            }).join('');
          } else if (data.lehrlinge && Array.isArray(data.lehrlinge) && data.lehrlinge.length > 0) {
            // Fallback: Wenn lehrlinge_auslastung nicht vorhanden, aber lehrlinge vorhanden sind,
            // zeige sie trotzdem an (mit 0% Auslastung)
            html += data.lehrlinge.map(l => {
              const lehrlingBadge = '<span style="background: #9c27b0; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-left: 10px;">Lehrling</span>';
              // Nebenzeit wird auf belegte Zeit aufgeschlagen, nicht von Kapazität abgezogen
              const verfuegbar = (l.arbeitsstunden_pro_tag || 8) * 60;
              return `
                <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #2e7d32;">
                  <h4 style="margin: 0 0 10px 0;">${l.name || 'Unbekannt'}${lehrlingBadge}</h4>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">
                    <div><strong>Verfügbar:</strong> ${this.formatMinutesToHours(verfuegbar)}</div>
                    <div><strong>Belegt:</strong> ${this.formatMinutesToHours(0)}</div>
                    <div><strong>Auslastung:</strong> <span style="color: #2e7d32; font-weight: bold;">0%</span></div>
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; font-size: 0.9em; color: #666; margin-bottom: 5px;">
                    <div>Geplant: ${this.formatMinutesToHours(0)}</div>
                    <div>In Arbeit: ${this.formatMinutesToHours(0)}</div>
                    <div>Abgeschlossen: ${this.formatMinutesToHours(0)}</div>
                    <div>Servicezeit: ${this.formatMinutesToHours(0)}</div>
                  </div>
                  <div style="margin-top: 10px; height: 20px; background: #e0e0e0; border-radius: 4px; overflow: hidden; position: relative;">
                    <div style="height: 100%; width: 0%; background: #2e7d32; transition: width 0.3s;"></div>
                  </div>
                </div>
              `;
            }).join('');
          }
          
          // Zeige Sektion nur wenn es Mitarbeiter oder Lehrlinge gibt
          if (html) {
            section.style.display = 'block';
            container.innerHTML = html;
          } else {
            section.style.display = 'none';
          }
        }

        // Lade nicht zugeordnete Termine für diesen Tag
        await this.loadNichtZugeordneteTermine(datum, data);

      } catch (error) {
        console.error('Fehler beim Laden der Auslastung:', error);
      }
    },

    navigateAuslastung(days, type) {
      const datumInput = document.getElementById('auslastungDatum');
      if (!datumInput.value) {
        datumInput.value = new Date().toISOString().split('T')[0];
      }
      const currentDate = new Date(datumInput.value);
      currentDate.setDate(currentDate.getDate() + days);
      datumInput.value = currentDate.toISOString().split('T')[0];
      this.loadAuslastung();
    },

    goToAuslastungHeute() {
      const datumInput = document.getElementById('auslastungDatum');
      datumInput.value = new Date().toISOString().split('T')[0];
      this.loadAuslastung();
    },

    async _loadAuslastungWarnungen(datum) {
      const banner = document.getElementById('auslastungWarnungBanner');
      const liste  = document.getElementById('auslastungWarnungListe');
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
  });
}
