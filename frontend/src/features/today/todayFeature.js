export function installTodayFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadHeuteTermine() {
        try {
          const today = this.formatDateLocal(new Date());
          const heuteDatumEl = document.getElementById('heuteDatum');
          if (heuteDatumEl) {
            const date = new Date(today);
            heuteDatumEl.textContent = date.toLocaleDateString('de-DE', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          }
    
          const termine = await TermineService.getAll(today);
          termine.forEach(t => {
            this.termineById[t.id] = t;
          });
    
          // Sortiere nach Bringzeit (Termine mit Bringzeit zuerst, dann nach Zeit sortiert)
          const sortedTermine = [...termine].sort((a, b) => {
            const zeitA = a.bring_zeit || '';
            const zeitB = b.bring_zeit || '';
            
            // Termine ohne Bringzeit ans Ende
            if (!zeitA && !zeitB) return 0;
            if (!zeitA) return 1;
            if (!zeitB) return -1;
            
            // Sortiere nach Zeit (HH:MM Format)
            return zeitA.localeCompare(zeitB);
          });
    
          // Für Karten nur offene Termine
          const aktiveTermine = termine.filter(t => t.status !== 'abgeschlossen');
    
          this.heuteTermine = aktiveTermine;
          this.renderHeuteTabelle(sortedTermine); // Alle Termine (getrennt nach Status)
          this.renderHeuteKarten(aktiveTermine);  // Nur offene Termine für Karten
          this.updateHeuteInfoKacheln(sortedTermine);
    
          // A6c Überlauf-Banner: zeige Warnung wenn Auslastung > 90%
          this.pruefeUeberlaufBanner(sortedTermine);
        } catch (error) {
          console.error('Fehler beim Laden der heutigen Termine:', error);
          const tbody = document.querySelector('#heuteTermineTable tbody');
          if (tbody) {
            tbody.innerHTML = '<tr><td colspan="15" class="loading">Fehler beim Laden der Termine</td></tr>';
          }
          const kartenGrid = document.getElementById('heuteKartenGrid');
          if (kartenGrid) {
            kartenGrid.innerHTML = '<div class="loading">Fehler beim Laden der Termine</div>';
          }
        }
      },

      renderHeuteTabelle(termine) {
        const tbody = document.querySelector('#heuteTermineTable tbody');
        const abgeschlossenSection = document.getElementById('abgeschlossenSection');
        const abgeschlossenTbody = document.querySelector('#heuteAbgeschlossenTable tbody');
        
        if (!tbody) return;
    
        tbody.innerHTML = '';
        if (abgeschlossenTbody) abgeschlossenTbody.innerHTML = '';
    
        // Trenne offene und abgeschlossene Termine
        const offeneTermine = termine.filter(t => t.status !== 'abgeschlossen');
        const abgeschlosseneTermine = termine.filter(t => t.status === 'abgeschlossen');
    
        // Rendere offene Termine
        if (offeneTermine.length === 0) {
          tbody.innerHTML = '<tr><td colspan="11" class="loading">Keine offenen Termine für heute 🎉</td></tr>';
        } else {
          offeneTermine.forEach(termin => {
            this.renderHeuteTerminRow(tbody, termin, true);
          });
        }
    
        // Rendere abgeschlossene Termine in separate Tabelle
        if (abgeschlossenSection && abgeschlossenTbody) {
          if (abgeschlosseneTermine.length > 0) {
            abgeschlossenSection.style.display = 'block';
            abgeschlosseneTermine.forEach(termin => {
              this.renderHeuteTerminRow(abgeschlossenTbody, termin, false);
            });
          } else {
            abgeschlossenSection.style.display = 'none';
          }
        }
      },

      renderHeuteTerminRow(tbody, termin, showWartet = true) {
        const row = tbody.insertRow();
        const statusClass = `status-${termin.status || 'geplant'}`;
        const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
    
        // Hervorhebung für Bringzeit
        const bringZeitDisplay = termin.bring_zeit
          ? `<strong style="color: var(--accent); font-size: 1.1em;">${termin.bring_zeit}</strong>`
          : '<span style="color: #999;">-</span>';
    
        // Kunde wartet Anzeige
        const kundeWartet = termin.abholung_typ === 'warten'
          ? '<span style="color: #28a745; font-size: 1.2em; font-weight: bold;">✓</span>'
          : '';
    
        // Dringlichkeit-Badge erstellen
        const dringlichkeitBadge = this.getDringlichkeitBadge(termin.dringlichkeit);
    
        // Folgetermin-Badge erstellen
        const folgeterminBadge = this.getFolgeterminBadge(termin.arbeit);
        
        // Teile-Status Badge
        const teileStatusBadge = this.getTerminTeileStatusBadge(termin);
    
        const aktuellerStatus = termin.status || 'geplant';
        const statusTexte = {
          'geplant': 'Geplant',
          'in_arbeit': 'In Arbeit',
          'abgeschlossen': 'Abgeschlossen',
          'abgesagt': 'Abgesagt'
        };
    
        // Arbeit-Anzeige (ohne Folgetermin-Prefix für bessere Lesbarkeit)
        const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);
    
        // Wartet-Spalte + Batch-Checkbox nur bei offenen Terminen
        const wartetCell = showWartet 
          ? `<td style="text-align: center;">${kundeWartet}</td>` 
          : '';
        const batchCell = showWartet
          ? `<td class="batch-check-cell" style="width:30px;text-align:center;"><input type="checkbox" class="termin-batch-check" data-termin-id="${termin.id}"></td>`
          : '';
    
        // Anruf-Spalte: Kunde anrufen wenn fertig
        const anrufCell = termin.kontakt_option && termin.kontakt_option.includes('Kunde anrufen')
          ? `<td style="text-align:center;" title="Kunde anrufen wenn fertig!"><span style="color:#28a745;font-size:1.2em;font-weight:bold;">📞</span></td>`
          : `<td style="text-align:center;color:#ccc;">-</td>`;
    
        // Quick-Action-Buttons (C1): direkte Status-Schnelltasten
        const quickAktionen = showWartet ? `
          ${aktuellerStatus !== 'in_arbeit' && aktuellerStatus !== 'abgeschlossen' ? `<button class="btn-quick-action" title="In Arbeit setzen" onclick="app.quickStatusChange(${termin.id},'in_arbeit')">▶</button>` : ''}
          ${aktuellerStatus !== 'abgeschlossen' ? `<button class="btn-quick-action btn-quick-fertig" title="Fertig" onclick="app.quickStatusChange(${termin.id},'abgeschlossen')">✓</button>` : ''}` : '';
    
        row.innerHTML = `
          ${batchCell}
          <td>${bringZeitDisplay}</td>
          <td>${termin.kunde_name || '-'}${dringlichkeitBadge}${folgeterminBadge}${teileStatusBadge}</td>
          <td>${termin.kunde_telefon || '-'}</td>
          <td>${termin.kennzeichen || '-'}</td>
          ${wartetCell}
          ${anrufCell}
          <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
          <td>${this.formatZeit(zeitAnzeige)}</td>
          <td>
            <span class="status-badge ${statusClass}" data-termin-id="${termin.id}" data-status="${aktuellerStatus}" style="cursor: pointer; user-select: none;">
              ${statusTexte[aktuellerStatus]}
            </span>
            <select class="status-select-dropdown" data-termin-id="${termin.id}" style="display: none; padding: 6px 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 0.9em; min-width: 120px;">
              <option value="geplant" ${aktuellerStatus === 'geplant' ? 'selected' : ''}>Geplant</option>
              <option value="in_arbeit" ${aktuellerStatus === 'in_arbeit' ? 'selected' : ''}>In Arbeit</option>
              <option value="abgeschlossen" ${aktuellerStatus === 'abgeschlossen' ? 'selected' : ''}>Abgeschlossen</option>
              <option value="abgesagt" ${aktuellerStatus === 'abgesagt' ? 'selected' : ''}>Abgesagt</option>
            </select>
          </td>
          <td style="white-space:nowrap;">
            <button class="btn btn-edit" onclick="app.showTerminDetails(${termin.id})">Details</button>${quickAktionen}
          </td>
        `;
    
        // Event-Listener für Status-Badge Klick
        const statusBadge = row.querySelector('.status-badge');
        const statusDropdown = row.querySelector('.status-select-dropdown');
    
        if (statusBadge && statusDropdown) {
          statusBadge.addEventListener('click', () => {
            statusBadge.style.display = 'none';
            statusDropdown.style.display = 'inline-block';
            statusDropdown.focus();
          });
    
          statusDropdown.addEventListener('change', async (e) => {
            const terminId = parseInt(e.target.dataset.terminId);
            const neuerStatus = e.target.value;
            await this.updateTerminStatus(terminId, neuerStatus);
          });
    
          statusDropdown.addEventListener('blur', () => {
            statusDropdown.style.display = 'none';
            statusBadge.style.display = 'inline-block';
          });
        }
      },

      renderHeuteKarten(termine) {
        const kartenGrid = document.getElementById('heuteKartenGrid');
        if (!kartenGrid) return;
    
        kartenGrid.innerHTML = '';
    
        if (termine.length === 0) {
          kartenGrid.innerHTML = '<div class="loading">Keine Termine für heute</div>';
          return;
        }
    
        termine.forEach(termin => {
          const statusClass = `status-${termin.status || 'geplant'}`;
          const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
          const aktuellerStatus = termin.status || 'geplant';
          const statusTexte = {
            'geplant': 'Geplant',
            'in_arbeit': 'In Arbeit',
            'abgeschlossen': 'Abgeschlossen',
            'abgesagt': 'Abgesagt'
          };
          const abholungTypText = {
            'bringen': 'Kunde bringt/holt selbst',
            'hol_bring': 'Hol- und Bringservice',
            'ruecksprache': 'Telefonische Rücksprache',
            'warten': 'Kunde wartet'
          }[termin.abholung_typ] || termin.abholung_typ || '-';
    
          const karte = document.createElement('div');
          karte.className = 'heute-karte';
    
          // Wenn Kunde wartet, füge eine auffällige Markierung hinzu
          const kundeWartetBanner = termin.abholung_typ === 'warten'
            ? '<div style="background: #28a745; color: white; padding: 8px; text-align: center; font-weight: bold; border-radius: 5px 5px 0 0;">⚠️ KUNDE WARTET ⚠️</div>'
            : '';
    
          // Folgetermin-Banner (wenn es ein Folgetermin ist)
          const folgeterminMatch = termin.arbeit ? termin.arbeit.match(/\[Folgetermin zu (T-\d{4}-\d{3})\]/) : null;
          const folgeterminBanner = folgeterminMatch
            ? `<div style="background: #ff9800; color: white; padding: 8px; text-align: center; font-weight: bold; border-radius: ${termin.abholung_typ === 'warten' ? '0' : '5px 5px 0 0'};">🔗 FOLGETERMIN von ${folgeterminMatch[1]}</div>`
            : '';
    
          // Wiederholungstermin-Banner
          const wiederholungBanner = termin.ist_wiederholung
            ? `<div style="background: #dc3545; color: white; padding: 8px; text-align: center; font-weight: bold; border-radius: ${(termin.abholung_typ === 'warten' || folgeterminMatch) ? '0' : '5px 5px 0 0'};">🔁 WIEDERHOLUNGSTERMIN</div>`
            : '';
    
          // Dringlichkeit-Badge für Karten
          const karteDringlichkeitBadge = this.getDringlichkeitBadge(termin.dringlichkeit);
          
          // Arbeit-Anzeige formatieren
          const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);
    
          karte.innerHTML = `
            ${kundeWartetBanner}
            ${folgeterminBanner}
            ${wiederholungBanner}
            <div class="heute-karte-header">
              <div class="heute-karte-nr"><strong>${termin.termin_nr || '-'}</strong>${karteDringlichkeitBadge}</div>
              <div class="status-container" style="position: relative;">
                <span class="status-badge ${statusClass}" data-termin-id="${termin.id}" data-status="${aktuellerStatus}" style="cursor: pointer; user-select: none;">
                  ${statusTexte[aktuellerStatus]}
                </span>
                <select class="status-select-dropdown" data-termin-id="${termin.id}" style="display: none; padding: 6px 10px; border-radius: 4px; border: 1px solid #ddd; font-size: 0.9em; min-width: 120px;">
                  <option value="geplant" ${aktuellerStatus === 'geplant' ? 'selected' : ''}>Geplant</option>
                  <option value="in_arbeit" ${aktuellerStatus === 'in_arbeit' ? 'selected' : ''}>In Arbeit</option>
                  <option value="abgeschlossen" ${aktuellerStatus === 'abgeschlossen' ? 'selected' : ''}>Abgeschlossen</option>
                  <option value="abgesagt" ${aktuellerStatus === 'abgesagt' ? 'selected' : ''}>Abgesagt</option>
                </select>
              </div>
            </div>
            <div class="heute-karte-body">
              <div class="heute-karte-section">
                <h4>Kunde</h4>
                <p><strong>Name:</strong> ${termin.kunde_name || '-'}</p>
                <p><strong>Telefon:</strong> ${termin.kunde_telefon || '-'}</p>
              </div>
              <div class="heute-karte-section">
                <h4>Fahrzeug</h4>
                <p><strong>Kennzeichen:</strong> ${termin.kennzeichen || '-'}</p>
                <p><strong>Kilometerstand:</strong> ${termin.kilometerstand || '-'}</p>
                <p><strong>Ersatzauto:</strong> ${termin.ersatzauto ? 'Ja' : 'Nein'}</p>
              </div>
              <div class="heute-karte-section">
                <h4>Reparatur</h4>
                <p><strong>Arbeit(en):</strong> ${arbeitAnzeige}</p>
                <p><strong>Umfang/Details:</strong> ${termin.umfang || '-'}</p>
                <p><strong>Zeit:</strong> ${this.formatZeit(zeitAnzeige)}</p>
              </div>
              <div class="heute-karte-section">
                <h4>Abholung/Bringservice</h4>
                <p><strong>Typ:</strong> ${abholungTypText}</p>
                ${termin.abholung_details ? `<p><strong>Details:</strong> ${termin.abholung_details}</p>` : ''}
                ${termin.bring_zeit ? `<p><strong>Bringzeit:</strong> ${termin.bring_zeit}</p>` : ''}
                ${termin.abholung_zeit ? `<p><strong>Abholzeit:</strong> ${termin.abholung_zeit}</p>` : ''}
                ${termin.kontakt_option ? `<p><strong>Kontakt:</strong> ${termin.kontakt_option}</p>` : ''}
              </div>
            </div>
            <div class="heute-karte-footer">
              <button class="btn btn-edit" onclick="app.showTerminDetails(${termin.id})">Details anzeigen</button>
              ${aktuellerStatus !== 'in_arbeit' && aktuellerStatus !== 'abgeschlossen' ? `<button class="btn-quick-action" title="In Arbeit setzen" onclick="app.quickStatusChange(${termin.id},'in_arbeit')">▶ In Arbeit</button>` : ''}
              ${aktuellerStatus !== 'abgeschlossen' ? `<button class="btn-quick-action btn-quick-fertig" title="Fertig" onclick="app.quickStatusChange(${termin.id},'abgeschlossen')">✓ Fertig</button>` : ''}
            </div>
          `;
          kartenGrid.appendChild(karte);
    
          // Event-Listener für Status-Badge Klick in der Karte
          const cardStatusBadge = karte.querySelector('.status-badge');
          const cardStatusDropdown = karte.querySelector('.status-select-dropdown');
    
          if (cardStatusBadge && cardStatusDropdown) {
            cardStatusBadge.addEventListener('click', () => {
              cardStatusBadge.style.display = 'none';
              cardStatusDropdown.style.display = 'inline-block';
              cardStatusDropdown.focus();
            });
    
            cardStatusDropdown.addEventListener('change', async (e) => {
              const terminId = parseInt(e.target.dataset.terminId);
              const neuerStatus = e.target.value;
              await this.updateTerminStatus(terminId, neuerStatus);
            });
    
            cardStatusDropdown.addEventListener('blur', () => {
              cardStatusDropdown.style.display = 'none';
              cardStatusBadge.style.display = 'inline-block';
            });
          }
        });
      },

      updateHeuteInfoKacheln(termine) {
        // Aktuelle Uhrzeit aktualisieren
        this.updateAktuelleUhrzeit();
        
        // Nächster Kunde berechnen
        this.updateNaechsterKunde(termine);
        
        // Auslastung für heute berechnen
        this.updateHeuteAuslastung(termine);
        
        // Uhrzeit jede Sekunde aktualisieren
        if (this.uhrzeitInterval) {
          clearInterval(this.uhrzeitInterval);
        }
        this.uhrzeitInterval = setInterval(() => {
          this.updateAktuelleUhrzeit();
          this.updateNaechsterKunde(termine);
        }, 1000);
      },

      async updateHeuteAuslastung(termine) {
        const wertEl = document.getElementById('heuteAuslastungWert');
        const detailEl = document.getElementById('heuteAuslastungDetail');
        
        if (!wertEl || !detailEl) return;
        
        try {
          // Lade Auslastungsdaten von der API (gleiche Berechnung wie im Dashboard)
          const today = this.formatDateLocal(new Date());
          const auslastungData = await AuslastungService.getByDatum(today);
          
          const auslastungProzent = auslastungData.auslastung_prozent || 0;
          const belegteMinuten = auslastungData.belegt_minuten || 0;
          const gesamtMinuten = auslastungData.gesamt_minuten || 0;
          
          // Werte anzeigen
          wertEl.textContent = `${auslastungProzent}%`;
          
          const belegteStunden = (belegteMinuten / 60).toFixed(1);
          const gesamtStunden = (gesamtMinuten / 60).toFixed(1);
          detailEl.textContent = `${belegteStunden} von ${gesamtStunden} Stunden`;
          
          // Farbe je nach Auslastung
          if (auslastungProzent >= 100) {
            wertEl.style.color = '#e53935';
          } else if (auslastungProzent >= 80) {
            wertEl.style.color = '#ff9800';
          } else {
            wertEl.style.color = '#4caf50';
          }
        } catch (error) {
          console.error('Fehler bei Auslastungsberechnung:', error);
          wertEl.textContent = '--%';
          detailEl.textContent = 'Fehler beim Laden';
        }
      },

      async updateTerminStatus(terminId, status) {
        try {
          // Für "in_arbeit": Wenn Termin früher gestartet als geplant → tatsächliche Startzeit speichern
          const updatePayload = { status };
          if (status === 'in_arbeit') {
            const termin = this.termineById[terminId];
            if (termin) {
              const jetzt = new Date();
              const jetztZeit = String(jetzt.getHours()).padStart(2, '0') + ':' + String(jetzt.getMinutes()).padStart(2, '0');
              const geplanteStartzeit = termin.startzeit || termin.bring_zeit;
              if (geplanteStartzeit && jetztZeit < geplanteStartzeit) {
                updatePayload.startzeit = jetztZeit;
                updatePayload.bring_zeit = jetztZeit;
                console.log(`[Vorrücken] Termin ${terminId}: früher gestartet als geplant (${geplanteStartzeit} → ${jetztZeit})`);
              }
            }
          }
    
          const result = await TermineService.update(terminId, updatePayload);
    
          // Aktualisiere den Termin im Cache
          if (this.termineById[terminId]) {
            this.termineById[terminId].status = status;
            if (updatePayload.startzeit) {
              this.termineById[terminId].startzeit = updatePayload.startzeit;
              this.termineById[terminId].bring_zeit = updatePayload.bring_zeit;
            }
            // Feature 10: Aktualisiere auch die berechnete Zeit im Cache
            if (result && result.berechneteZeit) {
              this.termineById[terminId].tatsaechliche_zeit = result.berechneteZeit;
            }
          }
    
          // Feature 10: Zeige automatisch berechnete Zeit an
          if (status === 'abgeschlossen' && result && result.berechneteZeit) {
            this.showToast(`✅ Termin abgeschlossen - Arbeitszeit: ${result.berechneteZeit} Min`, 'success');
          }
    
          // Nachrücken: Folge-Termine der selben Person verschieben
          if (status === 'in_arbeit' || status === 'abgeschlossen') {
            const termin = this.termineById[terminId];
            if (termin) {
              this._nachrueckenFuerTermin(termin).catch(e => console.warn('Nachrücken fehlgeschlagen:', e));
            }
          }
    
          // Aktualisiere Dashboard, Auslastung und Heute-Ansicht
          this.loadDashboard();
          await this.loadHeuteTermine();
    
          // Timeline-Block in Planung & Zuweisung sofort visuell aktualisieren
          this.updateTimelineBlockStatus(terminId, status);
    
          // Planung & Zuweisung neu laden wenn Tab aktiv (damit interne Ansicht + Zuordnung aktuell sind)
          const planungTab = document.getElementById('auslastung-dragdrop');
          if (planungTab && planungTab.classList.contains('active')) {
            this.loadAuslastungDragDrop();
          }
          // Intern-Ansicht aktualisieren falls aktiv oder im Tablet-Modus
          const internTab = document.getElementById('intern');
          if (internTab && (internTab.classList.contains('active') || document.body.classList.contains('intern-tablet-mode-active'))) {
            this.loadInternTeamUebersicht();
          }
        } catch (error) {
          console.error('Fehler beim Aktualisieren des Status:', error);
          alert('Fehler beim Aktualisieren des Status: ' + (error.message || 'Unbekannter Fehler'));
    
          // Lade Tabelle neu, um den alten Status wieder anzuzeigen
          await this.loadHeuteTermine();
        }
      },

      openStatusPopup(terminId, anchorEl) {
        // Altes Popup entfernen
        const existing = document.getElementById('status-popup');
        if (existing) existing.remove();
    
        const termin = this.termineById[terminId];
        if (!termin) return;
    
        const STATUS_LIST = [
          { value: 'wartend',       label: '⏳ Wartend' },
          { value: 'geplant',       label: '📋 Geplant' },
          { value: 'in_arbeit',     label: '🔧 In Arbeit' },
          { value: 'abgeschlossen', label: '✅ Abgeschlossen' },
          { value: 'abgesagt',      label: '❌ Abgesagt' },
        ];
    
        const currentStatus = termin.status || 'geplant';
        let selectedStatus = currentStatus;
    
        const popup = document.createElement('div');
        popup.id = 'status-popup';
        popup.style.cssText = [
          'position:fixed',
          'z-index:9999',
          'background:#ffffff',
          'border:1px solid #d0d5dd',
          'border-radius:10px',
          'min-width:220px',
          'max-height:calc(100vh - 24px)',
          'display:flex',
          'flex-direction:column',
          'box-shadow:0 8px 24px rgba(0,0,0,0.15)',
          'font-family:inherit',
        ].join(';');
    
        popup.innerHTML = `
          <div style="padding:12px 12px 8px 12px;overflow-y:auto;flex:1;">
            <div style="font-size:10px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Status</div>
            <div id="status-popup-list">
              ${STATUS_LIST.map(s => `
                <div class="status-popup-item"
                     data-value="${s.value}"
                     style="padding:7px 8px;border-radius:6px;cursor:pointer;font-size:13px;color:#1f2937;
                            border-left:3px solid ${s.value === currentStatus ? '#4a7adb' : 'transparent'};
                            font-weight:${s.value === currentStatus ? '600' : 'normal'};">
                  ${s.label}
                </div>
              `).join('')}
            </div>
            <div id="status-popup-zeitfeld"></div>
          </div>
          <div style="padding:8px 12px 12px 12px;border-top:1px solid #f3f4f6;">
            <button id="status-popup-save"
                    style="width:100%;border-radius:6px;padding:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #d0d5dd;background:#f9fafb;color:#374151;">
              💾 Speichern
            </button>
          </div>
        `;
    
        // In DOM einfügen, Zeitfeld rendern, dann positionieren (korrekte Höhe!)
        document.body.appendChild(popup);
        this._updateStatusPopupZeitfeld(terminId, selectedStatus);
    
        // Viewport-Clamping nach vollständigem Render
        const rect = anchorEl.getBoundingClientRect();
        const pw = popup.offsetWidth  || 220;
        const ph = popup.offsetHeight || 280;
        let top  = rect.bottom + 4;
        let left = rect.left;
        if (left + pw > window.innerWidth  - 8) left = window.innerWidth  - pw - 8;
        if (left < 8) left = 8;
        if (top  + ph > window.innerHeight - 8) top  = rect.top - ph - 4;
        if (top  < 8) top  = 8;
        popup.style.top  = top  + 'px';
        popup.style.left = left + 'px';
    
        // Status-Item klicken
        popup.querySelectorAll('.status-popup-item').forEach(item => {
          item.addEventListener('click', () => {
            selectedStatus = item.dataset.value;
            popup.querySelectorAll('.status-popup-item').forEach(i => {
              const active = i.dataset.value === selectedStatus;
              i.style.borderLeft = active ? '3px solid var(--primary,#4a7adb)' : '3px solid transparent';
              i.style.fontWeight  = active ? 'bold' : 'normal';
            });
            this._updateStatusPopupZeitfeld(terminId, selectedStatus);
          });
        });
    
        // Speichern
        popup.querySelector('#status-popup-save').addEventListener('click', async () => {
          const input = popup.querySelector('#status-popup-zeit-input');
          const zeitValue = input ? input.value : null;
          popup.remove();
          document.removeEventListener('click', closeHandler, true);
          await this.saveStatusPopup(terminId, selectedStatus, zeitValue);
        });
    
        // Außen-Klick schließt Popup
        const closeHandler = (e) => {
          if (!popup.contains(e.target) && e.target !== anchorEl) {
            popup.remove();
            document.removeEventListener('click', closeHandler, true);
          }
        };
        setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
      },

      _updateStatusPopupZeitfeld(terminId, status) {
        const zeitfeldDiv = document.getElementById('status-popup-zeitfeld');
        const saveBtn     = document.getElementById('status-popup-save');
        if (!zeitfeldDiv) return;
    
        const termin = this.termineById[terminId];
    
        // Speichern-Button-Farbe je Status
        const BTN_COLORS = {
          in_arbeit:     { bg: '#e8f0fe', color: '#1a4a9b', border: '#93b4f5' },
          abgeschlossen: { bg: '#e8f5e9', color: '#1a5a2a', border: '#86c98e' },
          abgesagt:      { bg: '#fce8e8', color: '#8a2020', border: '#f0a0a0' },
        };
        const c = BTN_COLORS[status];
        if (saveBtn) {
          saveBtn.style.background = c ? c.bg    : '#f9fafb';
          saveBtn.style.color      = c ? c.color : '#374151';
          saveBtn.style.border     = c ? `1px solid ${c.border}` : '1px solid #d0d5dd';
          saveBtn.disabled = false;
        }
    
        if (status === 'in_arbeit') {
          const geplant = termin ? (termin.startzeit || termin.bring_zeit || '') : '';
          zeitfeldDiv.innerHTML = `
            <div style="border-top:1px solid #e5e7eb;padding-top:10px;margin-top:8px;">
              <div style="font-size:10px;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Startzeit</div>
              <div style="font-size:11px;color:#6b7280;margin-bottom:5px;">
                Geplant: <span style="color:#2563eb;">${geplant || '—'}</span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                <span style="font-size:11px;color:#374151;">Tatsächlich:</span>
                <input id="status-popup-zeit-input" type="text"
                       value="${geplant}" placeholder="HH:MM" maxlength="5"
                       style="width:60px;background:#f9fafb;border:1px solid #93b4f5;color:#1a4a9b;
                              padding:3px 6px;border-radius:4px;font-size:12px;" />
              </div>
            </div>`;
    
        } else if (status === 'abgeschlossen') {
          // ISO → HH:MM konvertieren
          let fertig = '';
          if (termin) {
            const fz = termin.fertigstellung_zeit;
            if (fz && (fz.includes('T') || fz.includes('Z'))) {
              const d = new Date(fz);
              if (!isNaN(d)) fertig = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
            } else if (fz) {
              fertig = fz;
            }
            if (!fertig) fertig = termin.endzeit_berechnet || '';
          }
          zeitfeldDiv.innerHTML = `
            <div style="border-top:1px solid #e5e7eb;padding-top:10px;margin-top:8px;">
              <div style="font-size:10px;color:#6b7280;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Fertigstellungszeit</div>
              <div style="font-size:11px;color:#6b7280;margin-bottom:5px;">
                Berechnet: <span style="color:#16a34a;">${fertig || '—'}</span>
              </div>
              <div style="display:flex;gap:6px;align-items:center;">
                <span style="font-size:11px;color:#374151;">Tatsächlich:</span>
                <input id="status-popup-zeit-input" type="text"
                       value="${fertig}" placeholder="HH:MM" maxlength="5"
                       style="width:60px;background:#f9fafb;border:1px solid #86c98e;color:#1a5a2a;
                              padding:3px 6px;border-radius:4px;font-size:12px;" />
              </div>
            </div>`;
        } else {
          zeitfeldDiv.innerHTML = '';
        }
    
        // Validierung auf Eingabefeld verdrahten
        const input = document.getElementById('status-popup-zeit-input');
        if (input && saveBtn) {
          const borderOk = status === 'abgeschlossen' ? '#4a8a5a' : '#4a7a9b';
          input.addEventListener('input', () => {
            const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(input.value);
            input.style.borderColor = valid ? borderOk : '#cc4444';
            saveBtn.disabled = !valid;
          });
        }
      },

      async saveStatusPopup(terminId, status, zeitValue) {
        const termin = this.termineById[terminId];
        const updatePayload = { status };
    
        if (status === 'in_arbeit' && zeitValue) {
          updatePayload.startzeit = zeitValue;
        } else if (status === 'abgeschlossen' && zeitValue) {
          const datum = termin ? termin.datum : new Date().toISOString().slice(0, 10);
          const iso   = new Date(`${datum}T${zeitValue}:00`);
          updatePayload.fertigstellung_zeit = isNaN(iso.getTime()) ? zeitValue : iso.toISOString();
        }
    
        try {
          const result = await TermineService.update(terminId, updatePayload);
    
          // Cache aktualisieren
          if (this.termineById[terminId]) {
            this.termineById[terminId].status = status;
            if (updatePayload.startzeit)           this.termineById[terminId].startzeit           = updatePayload.startzeit;
            if (updatePayload.fertigstellung_zeit) this.termineById[terminId].fertigstellung_zeit = updatePayload.fertigstellung_zeit;
            if (result && result.berechneteZeit)   this.termineById[terminId].tatsaechliche_zeit  = result.berechneteZeit;
          }
    
          const statusLabel = {
            wartend: 'Wartend', geplant: 'Geplant', in_arbeit: 'In Arbeit',
            abgeschlossen: 'Abgeschlossen', abgesagt: 'Abgesagt'
          }[status] || status;
          this.showToast(`✅ Status: ${statusLabel}`, 'success');
    
          // Tabelle + Seiteneffekte
          await this.loadTermine();
          if (status === 'in_arbeit' || status === 'abgeschlossen') {
            if (termin) this._nachrueckenFuerTermin(termin).catch(e => console.warn('Nachrücken fehlgeschlagen:', e));
          }
          this.updateTimelineBlockStatus(terminId, status);
          this.loadDashboard();
          await this.loadHeuteTermine();
    
        } catch (e) {
          console.error('[saveStatusPopup] Fehler:', e);
          this.showToast('Fehler beim Speichern des Status', 'error');
        }
      },

      handleHeuteViewSwitch(viewType) {
        const tabellenContainer = document.getElementById('heuteTabellenContainer');
        const kartenContainer = document.getElementById('heuteKartenContainer');
        const tabellenBtn = document.getElementById('heuteTabellenAnsicht');
        const kartenBtn = document.getElementById('heuteKartenAnsicht');
    
        if (viewType === 'tabelle') {
          if (tabellenContainer) tabellenContainer.style.display = 'block';
          if (kartenContainer) kartenContainer.style.display = 'none';
          if (tabellenBtn) {
            tabellenBtn.classList.remove('btn-secondary');
            tabellenBtn.classList.add('btn-primary');
          }
          if (kartenBtn) {
            kartenBtn.classList.remove('btn-primary');
            kartenBtn.classList.add('btn-secondary');
          }
        } else {
          if (tabellenContainer) tabellenContainer.style.display = 'none';
          if (kartenContainer) kartenContainer.style.display = 'block';
          if (tabellenBtn) {
            tabellenBtn.classList.remove('btn-primary');
            tabellenBtn.classList.add('btn-secondary');
          }
          if (kartenBtn) {
            kartenBtn.classList.remove('btn-secondary');
            kartenBtn.classList.add('btn-primary');
          }
        }
      },

      async quickStatusChange(terminId, neuerStatus) {
        try {
          await this.updateTerminStatus(terminId, neuerStatus);
        } catch (e) {
          this.showToast('Fehler beim Statuswechsel', 'error');
        }
      }
  });
}
