export function installReplacementCarsFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadErsatzautos() {
        try {
          const heute = this.formatDateLocal(new Date());
          const [autos, heuteVerfuegbarkeit, aktuelleBuchungen] = await Promise.all([
            ErsatzautosService.getAll(),
            ErsatzautosService.getVerfuegbarkeit(heute),
            ErsatzautosService.getAktuelleBuchungen()
          ]);
          
          // Dashboard-Karten aktualisieren
          const gesamtEl = document.getElementById('ersatzautoGesamt');
          const verfuegbarEl = document.getElementById('ersatzautoHeuteVerfuegbar');
          const vergebenEl = document.getElementById('ersatzautoHeuteVergeben');
          const gesperrtEl = document.getElementById('ersatzautoGesperrt');
          
          if (gesamtEl) gesamtEl.textContent = autos.filter(a => a.aktiv).length;
          if (verfuegbarEl) verfuegbarEl.textContent = heuteVerfuegbarkeit.verfuegbar;
          if (vergebenEl) vergebenEl.textContent = heuteVerfuegbarkeit.vergeben;
          if (gesperrtEl) gesperrtEl.textContent = heuteVerfuegbarkeit.gesperrt || 0;
          
          // Schnellzugriff-Kacheln rendern mit Buchungs-Info
          this.renderErsatzautoKacheln(autos.filter(a => a.aktiv), heuteVerfuegbarkeit.vergeben, aktuelleBuchungen);
          
          // Liste rendern
          this.renderErsatzautoListe(autos);
          
          // Aktuelle Buchungen laden
          this.loadErsatzautoBuchungen();
          
          // Übersicht laden
          this.loadErsatzautoUebersicht();
        } catch (error) {
          console.error('Fehler beim Laden der Ersatzautos:', error);
        }
      },

      renderErsatzautoKacheln(autos, anzahlVergeben = 0, aktuelleBuchungen = []) {
        const container = document.getElementById('ersatzautoKacheln');
        if (!container) return;
        
        if (!autos || autos.length === 0) {
          container.innerHTML = `
            <div style="padding: 20px; text-align: center; background: #f8fafc; border-radius: 8px; width: 100%;">
              <p style="margin: 0; color: #64748b;">Keine aktiven Ersatzautos vorhanden. Fügen Sie unten ein Fahrzeug hinzu.</p>
            </div>
          `;
          return;
        }
        
        const heute = this.formatDateLocal(new Date());
        
        // Zähle nicht-gesperrte Autos
        const nichtGesperrteAutos = autos.filter(auto => {
          const gesperrtBis = auto.gesperrt_bis;
          const istAbgelaufen = gesperrtBis && gesperrtBis < heute;
          return !(auto.manuell_gesperrt === 1 && !istAbgelaufen);
        });
        
        // Markiere X Autos als "vergeben" (die nicht-gesperrten, von oben nach unten)
        let vergebeneCount = 0;
        
        container.innerHTML = autos.map(auto => {
          // Prüfen ob Sperrung abgelaufen ist
          const gesperrtBis = auto.gesperrt_bis;
          const istAbgelaufen = gesperrtBis && gesperrtBis < heute;
          const istGesperrt = auto.manuell_gesperrt === 1 && !istAbgelaufen;
          const sperrgrund = auto.sperrgrund || null;
          const gesperrtSeit = auto.gesperrt_seit || null;
          
          // Prüfe ob dieses Auto als "vergeben" markiert werden soll
          // (nicht manuell gesperrt, aber durch Termine belegt)
          let istVergeben = false;
          let vergebenBuchung = null;
          if (!istGesperrt && vergebeneCount < anzahlVergeben) {
            istVergeben = true;
            vergebeneCount++;
            // Finde passende Buchung zur Anzeige (erste verfügbare)
            if (aktuelleBuchungen && aktuelleBuchungen.length >= vergebeneCount) {
              vergebenBuchung = aktuelleBuchungen[vergebeneCount - 1];
            }
          }
          
          // Status-Klasse und Texte bestimmen
          let statusClass, statusText, icon, hinweisText;
          
          if (istGesperrt) {
            statusClass = 'gesperrt';
            statusText = gesperrtBis ? `Gesperrt bis ${new Date(gesperrtBis).toLocaleDateString('de-DE')}` : 'Gesperrt';
            icon = '🔴';
            hinweisText = '🔓 Klicken zum Freigeben';
          } else if (istVergeben) {
            statusClass = 'vergeben';
            statusText = 'Vergeben';
            icon = '🟠';
            hinweisText = '📋 Durch Termin belegt';
          } else {
            statusClass = 'verfuegbar';
            statusText = 'Verfügbar';
            icon = '🟢';
            hinweisText = '🔒 Klicken zum Sperren';
          }
          
          // Sperrgrund-Anzeige
          let sperrgrundHtml = '';
          if (istGesperrt && sperrgrund) {
            sperrgrundHtml = `<div class="kachel-sperrgrund">⛔ ${sperrgrund}</div>`;
          }
          
          // Gesperrt seit Anzeige
          let gesperrtSeitHtml = '';
          if (istGesperrt && gesperrtSeit) {
            gesperrtSeitHtml = `<div class="kachel-gesperrt-seit">📅 Seit: ${new Date(gesperrtSeit).toLocaleDateString('de-DE')}</div>`;
          }
          
          // Vergeben-Info anzeigen
          let vergebenInfoHtml = '';
          let vergebenKunde = '';
          let vergebenKennzeichen = '';
          let vergebenTerminId = null;
          if (istVergeben && vergebenBuchung) {
            vergebenKunde = vergebenBuchung.kunde_name || 'Kunde';
            vergebenKennzeichen = vergebenBuchung.kennzeichen || '';
            vergebenTerminId = vergebenBuchung.id;
            vergebenInfoHtml = `
              <div class="kachel-vergeben-info">
                <div>👤 ${vergebenKunde}</div>
                <div>🚗 ${vergebenKennzeichen}</div>
              </div>`;
          }
          
          // Klick-Handler - auch für vergebene Autos (zum Freigeben wenn Kunde früher zurückbringt)
          let onclickHandler;
          if (istVergeben && vergebenTerminId) {
            // Escape Sonderzeichen für onclick
            const safeAutoName = (auto.name || '').replace(/'/g, "\\'");
            const safeKunde = (vergebenKunde || '').replace(/'/g, "\\'");
            const safeKennzeichen = vergebenKennzeichen || '';
            onclickHandler = `onclick="app.handleVergebenesAutoKlick(${auto.id}, '${safeAutoName}', '${auto.kennzeichen}', '${safeKunde}', '${safeKennzeichen}', ${vergebenTerminId})"`;
          } else if (istVergeben) {
            // Vergeben aber keine Buchung gefunden - kein Klick-Handler
            onclickHandler = '';
          } else {
            const safeAutoName = (auto.name || '').replace(/'/g, "\\'");
            onclickHandler = `onclick="app.toggleErsatzautoVerfuegbarkeit(${auto.id}, '${safeAutoName}', '${auto.kennzeichen}', ${istGesperrt})"`;
          }
          
          // Hinweistext anpassen
          if (istVergeben) {
            hinweisText = vergebenTerminId ? '🔓 Klicken für frühere Rückgabe' : '📋 Durch Termin belegt';
          }
          
          return `
            <div class="ersatzauto-kachel ${statusClass}" 
                 data-id="${auto.id}" 
                 data-name="${auto.name}"
                 data-kennzeichen="${auto.kennzeichen}"
                 data-gesperrt="${istGesperrt ? '1' : '0'}"
                 data-vergeben="${istVergeben ? '1' : '0'}"
                 ${onclickHandler}>
              <div class="kachel-header">
                <span class="kachel-icon">${icon}</span>
                <span class="kachel-status">${statusText}</span>
              </div>
              <div class="kachel-name">${auto.name}</div>
              <div class="kachel-kennzeichen">${auto.kennzeichen}</div>
              ${auto.typ ? `<div class="kachel-typ">📋 ${auto.typ}</div>` : ''}
              ${sperrgrundHtml}
              ${gesperrtSeitHtml}
              ${vergebenInfoHtml}
              <div class="kachel-hinweis">
                <span>${hinweisText}</span>
              </div>
            </div>
          `;
        }).join('');
      },

      async handleVergebenesAutoKlick(autoId, autoName, autoKennzeichen, kundeName, kundeKennzeichen, terminId) {
        const bestaetigung = confirm(
          `🚗 Ersatzauto früher zurückgegeben?\n\n` +
          `Das Fahrzeug "${autoName}" (${autoKennzeichen}) ist aktuell vergeben an:\n` +
          `👤 ${kundeName}\n` +
          `🚗 ${kundeKennzeichen}\n\n` +
          `Wenn der Kunde das Auto früher zurückgebracht hat, können Sie es hier als verfügbar markieren.\n\n` +
          `Möchten Sie das Auto als VERFÜGBAR markieren?`
        );
        
        if (!bestaetigung) return;
        
        try {
          // Buchung im Termin als zurückgegeben markieren (setzt ersatzauto_bis_datum auf gestern)
          await ErsatzautosService.markiereAlsZurueckgegeben(terminId);
          alert(`✅ ${autoName} (${autoKennzeichen}) ist jetzt wieder verfügbar.`);
          this.loadErsatzautos();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Freigeben:', error);
          alert('❌ Fehler beim Freigeben. Bitte versuchen Sie es erneut.');
        }
      },

      async toggleErsatzautoVerfuegbarkeit(id, name, kennzeichen, istGesperrt) {
        if (istGesperrt) {
          // Freigeben - einfache Bestätigung
          const bestaetigung = confirm(
            `🚗 Ersatzauto FREIGEBEN?\n\nDas Fahrzeug "${name}" (${kennzeichen}) wird wieder als VERFÜGBAR markiert.\n\nMöchten Sie fortfahren?`
          );
          
          if (!bestaetigung) return;
          
          try {
            await ErsatzautosService.entsperren(id);
            alert(`✅ ${name} (${kennzeichen}) ist jetzt wieder verfügbar.`);
            this.loadErsatzautos();
            this.loadDashboard();
          } catch (error) {
            console.error('Fehler beim Freigeben:', error);
            alert('❌ Fehler beim Freigeben. Bitte versuchen Sie es erneut.');
          }
        } else {
          // Sperren - Popup für Anzahl Tage anzeigen
          this.showSperrenPopup(id, name, kennzeichen);
        }
      },

      showSperrenPopup(id, name, kennzeichen) {
        // Bestehenden Modal entfernen falls vorhanden
        const existingModal = document.getElementById('sperrenModal');
        if (existingModal) existingModal.remove();
        
        const heute = new Date();
        const morgen = new Date(heute);
        morgen.setDate(morgen.getDate() + 1);
        const minDatum = this.formatDateLocal(heute);
        
        const modal = document.createElement('div');
        modal.id = 'sperrenModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal-content sperren-modal">
            <div class="modal-header">
              <h3>🔒 Ersatzauto sperren</h3>
              <button class="modal-close" onclick="app.closeSperrenModal()">&times;</button>
            </div>
            <div class="modal-body">
              <p><strong>${name}</strong> (${kennzeichen})</p>
              
              <div class="sperren-grund" style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Grund für die Sperrung (optional):</label>
                <input type="text" id="sperrenGrund" class="form-input" placeholder="z.B. TÜV, Reparatur, Unfall, Service..." style="width: 100%;">
              </div>
              
              <p style="margin-bottom: 15px; color: #64748b;">Wie lange soll das Fahrzeug gesperrt werden?</p>
              
              <div class="sperren-optionen">
                <button class="sperren-option-btn sperren-heute" onclick="app.sperrenFuerTage(${id}, 0)" title="Fahrzeug ist heute zurück und ab morgen wieder verfügbar">
                  <span class="option-tage">☀️</span>
                  <span class="option-label">Nur heute</span>
                </button>
                <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 1)">
                  <span class="option-tage">1</span>
                  <span class="option-label">Tag</span>
                </button>
                <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 2)">
                  <span class="option-tage">2</span>
                  <span class="option-label">Tage</span>
                </button>
                <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 3)">
                  <span class="option-tage">3</span>
                  <span class="option-label">Tage</span>
                </button>
                <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 5)">
                  <span class="option-tage">5</span>
                  <span class="option-label">Tage</span>
                </button>
                <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 7)">
                  <span class="option-tage">7</span>
                  <span class="option-label">Tage</span>
                </button>
                <button class="sperren-option-btn" onclick="app.sperrenFuerTage(${id}, 14)">
                  <span class="option-tage">14</span>
                  <span class="option-label">Tage</span>
                </button>
              </div>
              
              <div class="sperren-custom" style="margin-top: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Oder bis zu einem bestimmten Datum:</label>
                <input type="date" id="sperrenBisDatum" min="${minDatum}" class="form-input" style="width: 100%;">
              </div>
              
              <div class="sperren-vorschau" id="sperrenVorschau" style="margin-top: 15px; padding: 10px; background: #f8fafc; border-radius: 8px; display: none;">
                <span id="sperrenVorschauText"></span>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" onclick="app.closeSperrenModal()">Abbrechen</button>
              <button class="btn btn-primary" id="sperrenBestaetigenBtn" onclick="app.bestaetigenSperrenMitDatum(${id})" disabled>
                🔒 Sperren
              </button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event-Listener für Datum-Eingabe
        const datumInput = document.getElementById('sperrenBisDatum');
        datumInput.addEventListener('change', () => {
          this.updateSperrenVorschau(datumInput.value);
        });
        
        // Modal anzeigen
        setTimeout(() => modal.classList.add('active'), 10);
      },

      updateSperrenVorschau(datum) {
        const vorschau = document.getElementById('sperrenVorschau');
        const vorschauText = document.getElementById('sperrenVorschauText');
        const bestaetigenBtn = document.getElementById('sperrenBestaetigenBtn');
        
        if (datum) {
          if (vorschau) vorschau.style.display = 'block';
          if (vorschauText) vorschauText.innerHTML = `📅 Gesperrt bis: <strong>${new Date(datum).toLocaleDateString('de-DE')}</strong>`;
          if (bestaetigenBtn) {
            bestaetigenBtn.disabled = false;
            bestaetigenBtn.removeAttribute('disabled');
          }
        } else {
          if (vorschau) vorschau.style.display = 'none';
          if (bestaetigenBtn) bestaetigenBtn.disabled = true;
        }
      },

      async sperrenFuerTage(id, tage) {
        const bisDatum = new Date();
        bisDatum.setDate(bisDatum.getDate() + tage);
        const bisDatumStr = this.formatDateLocal(bisDatum);
        
        // Datum-Input setzen und Vorschau aktualisieren
        const datumInput = document.getElementById('sperrenBisDatum');
        if (datumInput) {
          datumInput.value = bisDatumStr;
          this.updateSperrenVorschau(bisDatumStr);
        }
      },

      async bestaetigenSperrenMitDatum(id) {
        const datumInput = document.getElementById('sperrenBisDatum');
        const grundInput = document.getElementById('sperrenGrund');
        const bisDatum = datumInput?.value;
        const sperrgrund = grundInput?.value?.trim() || null;
        
        if (!bisDatum) {
          alert('Bitte wählen Sie ein Datum aus.');
          return;
        }
        
        try {
          // Prüfen ob es Buchungen im Sperrzeitraum gibt
          const heute = this.formatDateLocal(new Date());
          const buchungen = await ErsatzautosService.getBuchungenImZeitraum(heute, bisDatum);
          
          if (buchungen && buchungen.length > 0) {
            // Warnung erstellen
            const buchungsListe = buchungen.map(b => {
              const datum = new Date(b.datum).toLocaleDateString('de-DE');
              return `• ${b.termin_nr || 'Termin'} - ${b.kunde_name || 'Unbekannt'} (${datum})`;
            }).join('\n');
            
            const warnung = `⚠️ ACHTUNG: Im Sperrzeitraum gibt es ${buchungen.length} Termin(e) mit Ersatzfahrzeug-Bedarf!\n\n${buchungsListe}\n\nMöchten Sie das Fahrzeug trotzdem sperren?`;
            
            if (!confirm(warnung)) {
              return; // Abbrechen
            }
          }
          
          await ErsatzautosService.sperrenBis(id, bisDatum, sperrgrund);
          this.closeSperrenModal();
          const grundText = sperrgrund ? ` (Grund: ${sperrgrund})` : '';
          alert(`✅ Fahrzeug gesperrt bis ${new Date(bisDatum).toLocaleDateString('de-DE')}${grundText}.`);
          this.loadErsatzautos();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Sperren:', error);
          alert('❌ Fehler beim Sperren. Bitte versuchen Sie es erneut.');
        }
      },

      closeSperrenModal() {
        const modal = document.getElementById('sperrenModal');
        if (modal) {
          modal.classList.remove('active');
          setTimeout(() => modal.remove(), 300);
        }
      },

      async loadErsatzautoBuchungen() {
        const container = document.getElementById('ersatzautoBuchungen');
        if (!container) return;
        
        try {
          const heute = this.formatDateLocal(new Date());
          
          // Lade Buchungen UND alle Ersatzautos parallel
          const [buchungen, alleAutos] = await Promise.all([
            ErsatzautosService.getAktuelleBuchungen(),
            ErsatzautosService.getAll()
          ]);
          
          // Finde manuell gesperrte Autos (aktive Sperrung)
          const gesperrteAutos = alleAutos.filter(auto => {
            if (!auto.aktiv) return false;
            if (auto.manuell_gesperrt !== 1) return false;
            // Prüfe ob Sperrung abgelaufen
            if (auto.gesperrt_bis && auto.gesperrt_bis < heute) return false;
            return true;
          });
          
          const hatBuchungen = buchungen && buchungen.length > 0;
          const hatGesperrte = gesperrteAutos && gesperrteAutos.length > 0;
          
          if (!hatBuchungen && !hatGesperrte) {
            container.innerHTML = `
              <div class="ersatzauto-empty" style="padding: 20px; text-align: center; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
                <div style="font-size: 2rem; margin-bottom: 10px;">✅</div>
                <p style="margin: 0; color: #166534;">Aktuell sind keine Ersatzautos vergeben oder gesperrt.</p>
              </div>
            `;
            return;
          }
          
          let html = '';
          
          // Zuerst manuell gesperrte Autos anzeigen
          if (hatGesperrte) {
            html += gesperrteAutos.map(auto => {
              const gesperrtBis = auto.gesperrt_bis 
                ? new Date(auto.gesperrt_bis).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : 'Unbefristet';
              const gesperrtSeit = auto.gesperrt_seit
                ? new Date(auto.gesperrt_seit).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : heute;
              
              return `
                <div class="buchung-card gesperrt" style="display: flex; gap: 15px; padding: 15px; background: #fef2f2; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ef4444;">
                  <div class="buchung-icon" style="font-size: 2rem;">🔒</div>
                  <div class="buchung-info" style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                      <div>
                        <strong style="font-size: 1.1rem; color: #b91c1c;">${auto.name}</strong>
                        <span style="margin-left: 10px; color: #6b7280; font-size: 0.85rem;">${auto.kennzeichen}</span>
                      </div>
                      <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">GESPERRT</span>
                    </div>
                    ${auto.sperrgrund ? `
                    <div style="font-size: 0.9rem; color: #b91c1c; margin-bottom: 8px;">
                      <span style="color: #9ca3af;">⛔ Grund:</span>
                      <strong>${auto.sperrgrund}</strong>
                    </div>` : ''}
                    <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.85rem; color: #6b7280;">
                      <div>
                        <span style="color: #9ca3af;">📅 Seit:</span> ${gesperrtSeit}
                      </div>
                      <div>
                        <span style="color: #9ca3af;">📅 Bis:</span> ${gesperrtBis}
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('');
          }
          
          // Dann Buchungen durch Termine anzeigen
          if (hatBuchungen) {
            html += buchungen.map(buchung => {
            const vonDatum = new Date(buchung.datum);
            const bisDatum = buchung.bis_datum ? new Date(buchung.bis_datum) : vonDatum;
            
            const vonFormatiert = vonDatum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const bisFormatiert = bisDatum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            const istMehrtaegig = buchung.datum !== buchung.bis_datum;
            const istHeute = buchung.datum === heute || (buchung.datum <= heute && buchung.bis_datum >= heute);
            
            // Zeitraum-Anzeige
            let zeitraumText = vonFormatiert;
            if (istMehrtaegig) {
              zeitraumText = `${vonFormatiert} - ${bisFormatiert}`;
              if (buchung.ersatzauto_tage) {
                zeitraumText += ` (${buchung.ersatzauto_tage} Tage)`;
              }
            }
            if (buchung.ersatzauto_bis_zeit) {
              zeitraumText += ` bis ${buchung.ersatzauto_bis_zeit} Uhr`;
            }
            
            // Hol- und Bringzeiten ermitteln
            const bringZeit = buchung.bring_zeit || null;
            const abholZeit = buchung.abholung_zeit || buchung.ersatzauto_bis_zeit || null;
            
            // Zeitanzeige-HTML erstellen
            let zeitenHtml = '';
            if (bringZeit || abholZeit) {
              zeitenHtml = `
                  <div style="margin-top: 6px; font-size: 0.85rem; color: #6b7280; display: flex; flex-wrap: wrap; gap: 12px;">
                    ${bringZeit ? `<span>🕐 <strong>Abholung:</strong> ${bringZeit} Uhr</span>` : ''}
                    ${abholZeit ? `<span>🕐 <strong>Rückgabe:</strong> ${abholZeit} Uhr</span>` : ''}
                  </div>`;
            }
            
            return `
              <div class="buchung-card${istHeute ? ' heute' : ''}" style="display: flex; gap: 15px; padding: 15px; background: ${istHeute ? '#fef3c7' : '#f8fafc'}; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${istHeute ? '#f59e0b' : '#3b82f6'};">
                <div class="buchung-icon" style="font-size: 2rem;">🚗</div>
                <div class="buchung-info" style="flex: 1;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                      <strong style="font-size: 1.1rem; color: #1e40af;">${buchung.kennzeichen}</strong>
                      ${buchung.termin_nr ? `<span style="margin-left: 10px; color: #6b7280; font-size: 0.85rem;">${buchung.termin_nr}</span>` : ''}
                    </div>
                    ${istHeute ? '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">HEUTE</span>' : ''}
                  </div>
                  <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 0.9rem; color: #4b5563;">
                    <div>
                      <span style="color: #9ca3af;">👤 Kunde:</span>
                      <strong>${buchung.kunde_name || 'Unbekannt'}</strong>
                    </div>
                    ${buchung.kunde_telefon ? `<div><span style="color: #9ca3af;">📞</span> ${buchung.kunde_telefon}</div>` : ''}
                  </div>
                  <div style="margin-top: 8px; font-size: 0.85rem; color: #6b7280;">
                    <span style="color: #9ca3af;">📅 Zeitraum:</span> ${zeitraumText}
                  </div>
                  ${zeitenHtml}
                </div>
              </div>
            `;
          }).join('');
          }
          
          container.innerHTML = html;
        } catch (error) {
          console.error('Fehler beim Laden der Buchungen:', error);
          container.innerHTML = '<div class="loading" style="color: #ef4444;">Fehler beim Laden der Buchungen</div>';
        }
      },

      renderErsatzautoListe(autos) {
        const container = document.getElementById('ersatzautoListe');
        if (!container) return;
        
        if (!autos || autos.length === 0) {
          container.innerHTML = `
            <div class="ersatzauto-empty">
              <div class="empty-icon">🚗</div>
              <p>Noch keine Ersatzfahrzeuge registriert.</p>
              <p style="font-size: 0.9rem;">Fügen Sie oben Ihr erstes Fahrzeug hinzu.</p>
            </div>
          `;
          return;
        }
        
        container.innerHTML = autos.map(auto => `
          <div class="ersatzauto-card${auto.aktiv ? '' : ' inaktiv'}">
            <div class="ea-icon">🚗</div>
            <div class="ea-info">
              <div class="ea-kennzeichen">${auto.kennzeichen}</div>
              <div class="ea-name">${auto.name}</div>
              ${auto.typ ? `<span class="ea-typ">${auto.typ}</span>` : ''}
            </div>
            <div class="ea-actions">
              <button class="btn-toggle" onclick="app.toggleErsatzautoAktiv(${auto.id}, ${auto.aktiv})" 
                      title="${auto.aktiv ? 'Deaktivieren' : 'Aktivieren'}">
                ${auto.aktiv ? '✓' : '○'}
              </button>
              <button class="btn-edit" onclick="app.editErsatzauto(${auto.id})" title="Bearbeiten">✏️</button>
              <button class="btn-delete" onclick="app.deleteErsatzauto(${auto.id})" title="Löschen">🗑️</button>
            </div>
          </div>
        `).join('');
      },

      async handleErsatzautoSubmit(e) {
        e.preventDefault();
        
        const kennzeichenField = document.getElementById('ersatzautoKennzeichen');
        const nameField = document.getElementById('ersatzautoName');
        const typField = document.getElementById('ersatzautoTyp');
        const editIdField = document.getElementById('ersatzautoEditId');
        
        const kennzeichen = kennzeichenField.value.trim().toUpperCase();
        const name = nameField.value.trim();
        const typ = typField.value;
        const editId = editIdField.value;
        
        if (!kennzeichen || !name) {
          alert('Bitte Kennzeichen und Fahrzeugname eingeben.');
          return;
        }
        
        try {
          if (editId) {
            await ErsatzautosService.update(editId, { kennzeichen, name, typ, aktiv: 1 });
            alert('Fahrzeug aktualisiert.');
          } else {
            await ErsatzautosService.create({ kennzeichen, name, typ });
            alert('Fahrzeug hinzugefügt.');
          }
          
          // Form zurücksetzen
          kennzeichenField.value = '';
          nameField.value = '';
          typField.value = '';
          editIdField.value = '';
          
          this.loadErsatzautos();
        } catch (error) {
          console.error('Fehler beim Speichern:', error);
          alert(error.data?.error || 'Fahrzeug konnte nicht gespeichert werden.');
        }
      },

      async editErsatzauto(id) {
        try {
          const auto = await ErsatzautosService.getById(id);
          
          document.getElementById('ersatzautoKennzeichen').value = auto.kennzeichen;
          document.getElementById('ersatzautoName').value = auto.name;
          document.getElementById('ersatzautoTyp').value = auto.typ || '';
          document.getElementById('ersatzautoEditId').value = auto.id;
          
          // Scroll zum Formular
          document.getElementById('ersatzautoForm').scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
          console.error('Fehler beim Laden des Fahrzeugs:', error);
          alert('Fahrzeug konnte nicht geladen werden.');
        }
      },

      async deleteErsatzauto(id) {
        if (!confirm('Möchten Sie dieses Ersatzfahrzeug wirklich löschen?')) return;
        
        try {
          await ErsatzautosService.delete(id);
          this.loadErsatzautos();
        } catch (error) {
          console.error('Fehler beim Löschen:', error);
          alert('Fahrzeug konnte nicht gelöscht werden.');
        }
      },

      async toggleErsatzautoAktiv(id, currentStatus) {
        try {
          const auto = await ErsatzautosService.getById(id);
          await ErsatzautosService.update(id, {
            ...auto,
            aktiv: currentStatus ? 0 : 1
          });
          this.loadErsatzautos();
        } catch (error) {
          console.error('Fehler beim Ändern des Status:', error);
        }
      },

      async loadErsatzautoUebersicht() {
        const container = document.getElementById('ersatzautoUebersicht');
        if (!container) return;
        
        container.innerHTML = '<div class="loading">Lade Übersicht...</div>';
        
        try {
          // Generiere 5 Wochen (Mo-So) ab dem aktuellen Montag
          const weeks = this.getWeeksForErsatzautoView();
          const today = this.formatDateLocal(new Date());
          
          // Lade Verfügbarkeit für alle Tage parallel
          const allDays = weeks.flat();
          const verfuegbarkeitPromises = allDays.map(day => 
            ErsatzautosService.getVerfuegbarkeit(day.datum)
              .catch(() => ({ gesamt: 0, vergeben: 0, verfuegbar: 0 }))
          );
          const verfuegbarkeiten = await Promise.all(verfuegbarkeitPromises);
          
          // Erstelle Map für schnellen Zugriff
          const verfMap = new Map();
          allDays.forEach((day, idx) => verfMap.set(day.datum, verfuegbarkeiten[idx]));
          
          // Header mit Wochentagen
          let html = `
            <div class="ea-wochen-container">
              <div class="ea-wochen-header">
                <div class="ea-kw-header">KW</div>
                <div class="ea-tag-header">Mo</div>
                <div class="ea-tag-header">Di</div>
                <div class="ea-tag-header">Mi</div>
                <div class="ea-tag-header">Do</div>
                <div class="ea-tag-header">Fr</div>
                <div class="ea-tag-header">Sa</div>
                <div class="ea-tag-header">So</div>
              </div>
          `;
          
          // Jede Woche als Zeile
          weeks.forEach(week => {
            const firstDay = new Date(week[0].datum);
            const kw = this.getWeekNumber(firstDay);
            
            html += `<div class="ea-wochen-zeile">`;
            html += `<div class="ea-kw">KW ${kw}</div>`;
            
            week.forEach(day => {
              const verf = verfMap.get(day.datum) || { gesamt: 0, vergeben: 0, verfuegbar: 0 };
              const isPast = day.datum < today;
              const isToday = day.datum === today;
              const isSunday = day.dayOfWeek === 0;
              const gesperrt = verf.gesperrt || 0;
              
              let statusClass = 'frei';
              let statusText = `${verf.verfuegbar}/${verf.gesamt}`;
              let tooltipText = '';
              
              if (verf.gesamt === 0) {
                statusClass = 'keine';
                statusText = '-';
                tooltipText = 'Keine Ersatzautos';
              } else if (verf.verfuegbar === 0) {
                statusClass = 'voll';
                let details = [];
                if (verf.vergeben > 0) details.push(`${verf.vergeben} vergeben`);
                if (gesperrt > 0) details.push(`${gesperrt} gesperrt`);
                tooltipText = details.join(', ');
              } else if (verf.vergeben > 0 || gesperrt > 0) {
                statusClass = 'teilweise';
                let details = [];
                if (verf.vergeben > 0) details.push(`${verf.vergeben} vergeben`);
                if (gesperrt > 0) details.push(`${gesperrt} gesperrt`);
                tooltipText = details.join(', ');
              } else {
                tooltipText = 'Alle verfügbar';
              }
              
              const todayClass = isToday ? ' ea-heute' : '';
              const pastClass = isPast ? ' ea-vergangen' : '';
              const sundayClass = isSunday ? ' ea-sonntag' : '';
              
              html += `
                <div class="ea-tag-zelle${todayClass}${pastClass}${sundayClass} ea-status-${statusClass}" 
                     title="${day.dayNum}. ${day.monthShort}&#10;${tooltipText}">
                  <div class="ea-tag-datum">${day.dayNum}</div>
                  <div class="ea-tag-verfuegbar">${statusText}</div>
                </div>
              `;
            });
            
            html += `</div>`;
          });
          
          html += `</div>`;
          
          // Legende hinzufügen
          html += `
            <div class="ea-legende">
              <div class="ea-legende-item"><span class="ea-legende-dot ea-frei"></span> Frei</div>
              <div class="ea-legende-item"><span class="ea-legende-dot ea-teilweise"></span> Teilweise belegt</div>
              <div class="ea-legende-item"><span class="ea-legende-dot ea-voll"></span> Ausgebucht</div>
            </div>
          `;
          
          container.innerHTML = html;
          
        } catch (error) {
          console.error('Fehler beim Laden der Ersatzauto-Übersicht:', error);
          container.innerHTML = '<div class="loading" style="color: #ef4444;">Fehler beim Laden</div>';
        }
      },

      getWeeksForErsatzautoView() {
        const weeks = [];
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        
        // Finde den Montag der aktuellen Woche
        const currentDay = today.getDay();
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
        const startMonday = new Date(today);
        startMonday.setDate(today.getDate() + mondayOffset);
        
        // 5 Wochen generieren (Mo-So = 7 Tage pro Woche)
        for (let weekNum = 0; weekNum < 5; weekNum++) {
          const week = [];
          for (let dayNum = 0; dayNum < 7; dayNum++) { // Mo=0 bis So=6
            const day = new Date(startMonday);
            day.setDate(startMonday.getDate() + (weekNum * 7) + dayNum);
            
            const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
            
            week.push({
              datum: this.formatDateLocal(day),
              dayNum: day.getDate(),
              monthShort: monthNames[day.getMonth()],
              dayOfWeek: day.getDay() // 0=So, 1=Mo, ..., 6=Sa
            });
          }
          weeks.push(week);
        }
        return weeks;
      },

      getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
      }
  });
}
