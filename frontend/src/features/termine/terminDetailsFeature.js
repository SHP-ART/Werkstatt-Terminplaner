export function installTerminDetailsFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async showTerminDetails(terminId) {
      let termin = this.termineById[terminId];
      
      // Falls Termin nicht im Cache ist, lade ihn vom Server
      if (!termin) {
        try {
          termin = await TermineService.getById(terminId);
          if (!termin) {
            alert('Termin nicht gefunden');
            return;
          }
          this.termineById[terminId] = termin;
        } catch (error) {
          console.error('Fehler beim Laden des Termins:', error);
          alert('Fehler beim Laden des Termins');
          return;
        }
      }

      // Speichere aktuelle Termin-ID für Split/Schwebend-Funktionen
      this.currentDetailTerminId = terminId;

      // Prüfe ob Mitarbeiter/Lehrling zugeordnet ist (aus arbeitszeiten_details)
      let zugeordneteLehrlingId = null;
      let zugeordneteMitarbeiterId = null;
      if (termin.arbeitszeiten_details) {
        try {
          const details = JSON.parse(termin.arbeitszeiten_details);
          if (details._gesamt_mitarbeiter_id && typeof details._gesamt_mitarbeiter_id === 'object') {
            if (details._gesamt_mitarbeiter_id.type === 'lehrling') {
              zugeordneteLehrlingId = details._gesamt_mitarbeiter_id.id;
            } else if (details._gesamt_mitarbeiter_id.type === 'mitarbeiter') {
              zugeordneteMitarbeiterId = details._gesamt_mitarbeiter_id.id;
            }
          }
        } catch (e) {
          // Ignoriere Parse-Fehler
        }
      }

      // Lade aktive Mitarbeiter und Lehrlinge für Dropdown
      let mitarbeiterOptions = '<option value="">-- Niemand zugeordnet --</option>';
      try {
        const mitarbeiter = await MitarbeiterService.getAktive();
        const lehrlinge = await LehrlingeService.getAktive();
        
        // Lade Abwesenheiten für das Datum des Termins
        let abwesendeMitarbeiterIds = new Set();
        let abwesendeLehrlingeIds = new Set();
        
        if (termin.datum && termin.datum !== '9999-12-31') {
          try {
            const abwesenheiten = await EinstellungenService.getAbwesenheitenByDateRange(termin.datum, termin.datum);
            if (abwesenheiten && Array.isArray(abwesenheiten)) {
              abwesenheiten.forEach(a => {
                // API gibt mitarbeiter_id oder lehrling_id zurück
                if (a.mitarbeiter_id) {
                  abwesendeMitarbeiterIds.add(a.mitarbeiter_id);
                }
                if (a.lehrling_id) {
                  abwesendeLehrlingeIds.add(a.lehrling_id);
                }
              });
            }
          } catch (e) {
            console.warn('Konnte Abwesenheiten nicht laden:', e);
          }
        }

        // Erstelle Optgroups für bessere Übersicht - nur verfügbare Personen
        const verfuegbareMitarbeiter = mitarbeiter.filter(m => !abwesendeMitarbeiterIds.has(m.id));
        const abwesendeMitarbeiter = mitarbeiter.filter(m => abwesendeMitarbeiterIds.has(m.id));
        
        if (verfuegbareMitarbeiter.length > 0) {
          mitarbeiterOptions += '<optgroup label="Mitarbeiter">';
          mitarbeiterOptions += verfuegbareMitarbeiter.map(m =>
            `<option value="ma_${m.id}" ${(zugeordneteMitarbeiterId === m.id || termin.mitarbeiter_id === m.id) ? 'selected' : ''}>${m.name}</option>`
          ).join('');
          mitarbeiterOptions += '</optgroup>';
        }
        
        // Abwesende Mitarbeiter separat anzeigen (ausgegraut)
        if (abwesendeMitarbeiter.length > 0) {
          mitarbeiterOptions += '<optgroup label="⛔ Abwesend">';
          mitarbeiterOptions += abwesendeMitarbeiter.map(m =>
            `<option value="ma_${m.id}" disabled style="color: #999;">${m.name} (abwesend)</option>`
          ).join('');
          mitarbeiterOptions += '</optgroup>';
        }

        // Trenne Lehrlinge: verfügbar, abwesend (Urlaub/Krank), Berufsschule
        const berufsschulLehrlinge = [];
        const verfuegbareLehrlinge = lehrlinge.filter(l => {
          if (abwesendeLehrlingeIds.has(l.id)) return false;
          // Prüfe Berufsschule
          const schule = this.isLehrlingInBerufsschule(l, termin.datum);
          if (schule.inSchule) {
            berufsschulLehrlinge.push({ ...l, kw: schule.kw });
            return false;
          }
          return true;
        });
        const abwesendeLehrlinge = lehrlinge.filter(l => abwesendeLehrlingeIds.has(l.id));
        
        if (verfuegbareLehrlinge.length > 0) {
          mitarbeiterOptions += '<optgroup label="Lehrlinge">';
          mitarbeiterOptions += verfuegbareLehrlinge.map(l =>
            `<option value="l_${l.id}" ${zugeordneteLehrlingId === l.id ? 'selected' : ''}>${l.name}</option>`
          ).join('');
          mitarbeiterOptions += '</optgroup>';
        }
        
        // Lehrlinge in Berufsschule separat anzeigen (ausgegraut)
        if (berufsschulLehrlinge.length > 0) {
          mitarbeiterOptions += '<optgroup label="📚 Berufsschule">';
          mitarbeiterOptions += berufsschulLehrlinge.map(l =>
            `<option value="l_${l.id}" disabled style="color: #666;">📚 ${l.name} (KW ${l.kw} - Berufsschule)</option>`
          ).join('');
          mitarbeiterOptions += '</optgroup>';
        }
        
        // Abwesende Lehrlinge separat anzeigen (ausgegraut)
        if (abwesendeLehrlinge.length > 0) {
          mitarbeiterOptions += '<optgroup label="⛔ Lehrlinge abwesend">';
          mitarbeiterOptions += abwesendeLehrlinge.map(l =>
            `<option value="l_${l.id}" disabled style="color: #999;">${l.name} (abwesend)</option>`
          ).join('');
          mitarbeiterOptions += '</optgroup>';
        }
      } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge:', error);
      }

      const body = document.getElementById('terminDetailsBody');
      const kontaktText = termin.kontakt_option || '-';
      const abholungText = termin.abholung_typ || '-';

      // Dringlichkeit für Details
      const dringlichkeitText = {
        'dringend': '🔴 Dringend',
        'heute': '🟠 Heute',
        'woche': '🟡 Laufe der Woche'
      }[termin.dringlichkeit] || '-';

      // Schwebend-Status anzeigen
      const schwebendBadge = termin.ist_schwebend 
        ? '<span style="background: #ff9800; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px;">⏸️ Schwebend</span>'
        : '';
      
      // Verknüpfungs-Badge (Erweiterungen) anzeigen
      const erweiterungenCount = Object.values(this.termineById).filter(
        t => t.erweiterung_von_id === termin.id && !t.ist_geloescht
      ).length;
      const istErweiterung = termin.ist_erweiterung === 1 || termin.ist_erweiterung === true;
      
      let verknuepfungsBadge = '';
      if (erweiterungenCount > 0) {
        verknuepfungsBadge = `<span style="background: #1976d2; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px; cursor: pointer;" onclick="app.showVerknuepfteTermine(${termin.id})">🔗 ${erweiterungenCount} Erweiterung(en)</span>`;
      } else if (istErweiterung) {
        verknuepfungsBadge = `<span style="background: #0d47a1; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em; margin-left: 10px; cursor: pointer;" onclick="app.showVerknuepfteTermine(${termin.id})">🔗 Erweiterung</span>`;
      }
      
      // Split-Info anzeigen wenn vorhanden
      const splitInfo = termin.split_teil 
        ? `<p><strong>Aufgeteilter Termin:</strong> Teil ${termin.split_teil} ${termin.parent_termin_id ? '(Fortsetzung)' : ''}</p>`
        : '';

      // Status-Badge formatieren
      const statusBadge = {
        'geplant': '<span class="detail-status-badge status-geplant">📅 Geplant</span>',
        'in_bearbeitung': '<span class="detail-status-badge status-bearbeitung">🔧 In Bearbeitung</span>',
        'erledigt': '<span class="detail-status-badge status-erledigt">✅ Erledigt</span>',
        'abgebrochen': '<span class="detail-status-badge status-abgebrochen">❌ Abgebrochen</span>'
      }[termin.status] || `<span class="detail-status-badge">${termin.status}</span>`;

      // Ersatzauto-Badge
      const ersatzautoBadge = termin.ersatzauto 
        ? '<span class="detail-badge badge-ja">✓ Ja</span>' 
        : '<span class="detail-badge badge-nein">✗ Nein</span>';

      // Datum formatieren (mit Wochentag)
      const datumObj = new Date(termin.datum + 'T00:00:00');
      const wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
      const datumFormatiert = `${wochentage[datumObj.getDay()]}, ${termin.datum.split('-').reverse().join('.')}`;

      // Berechne Gesamtzeit aus arbeitszeiten_details wenn vorhanden
      let gesamtzeitBerechnet = null;
      let gesamtzeitMinuten = 0;
      let fruehesteStartzeit = null;
      
      // Lade globale Werkstatt-Einstellungen (Nebenzeit %)
      let globaleNebenzeitProzent = 0;
      try {
        const werkstattEinstellungen = await EinstellungenService.getWerkstatt();
        globaleNebenzeitProzent = werkstattEinstellungen.nebenzeit_prozent || 0;
      } catch (e) {
        console.warn('Konnte Werkstatt-Einstellungen nicht laden:', e);
      }
      
      // Lade Mitarbeiter und Lehrlinge für individuelle Nebenzeit/Aufgabenbewältigung
      let mitarbeiterMap = {};
      let lehrlingeMap = {};
      try {
        const mitarbeiter = await MitarbeiterService.getAll();
        const lehrlinge = await LehrlingeService.getAll();
        mitarbeiter.forEach(m => mitarbeiterMap[m.id] = m);
        lehrlinge.forEach(l => lehrlingeMap[l.id] = l);
      } catch (e) {
        console.warn('Konnte Mitarbeiter/Lehrlinge nicht laden:', e);
      }
      
      if (termin.arbeitszeiten_details) {
        try {
          const arbeitszeitenDetails = JSON.parse(termin.arbeitszeiten_details);
          let summeMinuten = 0;
          
          // Iteriere über ALLE Einträge in arbeitszeiten_details (inkl. Erweiterungen)
          for (const [key, value] of Object.entries(arbeitszeitenDetails)) {
            // Überspringe Meta-Felder
            if (key.startsWith('_')) {
              if (key === '_startzeit' && value) {
                fruehesteStartzeit = value;
              }
              continue;
            }
            
            let zeitMinuten = typeof value === 'object' ? (value.zeit || 0) : value;
            
            // Wende Nebenzeit/Aufgabenbewältigung an
            if (typeof value === 'object' && zeitMinuten > 0) {
              // Globale Nebenzeit immer anwenden
              if (globaleNebenzeitProzent > 0) {
                zeitMinuten = zeitMinuten * (1 + globaleNebenzeitProzent / 100);
              }
              
              // Zusätzlich individuelle Faktoren
              if (value.type === 'mitarbeiter' && value.mitarbeiter_id) {
                const ma = mitarbeiterMap[value.mitarbeiter_id];
                if (ma && ma.nebenzeit_prozent > 0) {
                  zeitMinuten = zeitMinuten * (1 + ma.nebenzeit_prozent / 100);
                }
              } else if (value.type === 'lehrling' && value.mitarbeiter_id) {
                const lehr = lehrlingeMap[value.mitarbeiter_id];
                if (lehr) {
                  // Individuelle Nebenzeit hinzufügen
                  if (lehr.nebenzeit_prozent > 0) {
                    zeitMinuten = zeitMinuten * (1 + lehr.nebenzeit_prozent / 100);
                  }
                  // Aufgabenbewältigung anwenden (z.B. 150% = braucht 1.5x so lange)
                  if (lehr.aufgabenbewaeltigung_prozent && lehr.aufgabenbewaeltigung_prozent !== 100) {
                    zeitMinuten = zeitMinuten * (lehr.aufgabenbewaeltigung_prozent / 100);
                  }
                }
              }
            }
            
            summeMinuten += zeitMinuten;
            
            // Früheste Startzeit finden
            if (typeof value === 'object' && value.startzeit && value.startzeit !== '') {
              if (!fruehesteStartzeit || value.startzeit < fruehesteStartzeit) {
                fruehesteStartzeit = value.startzeit;
              }
            }
          }
          
          if (summeMinuten > 0) {
            gesamtzeitBerechnet = this.formatMinutesToHours(Math.round(summeMinuten));
            gesamtzeitMinuten = Math.round(summeMinuten);
          }
        } catch (e) {
          console.error('Fehler beim Berechnen der Gesamtzeit:', e);
        }
      }
      
      // Fallback auf geschätzte Zeit wenn keine Details vorhanden
      if (gesamtzeitMinuten === 0 && termin.geschaetzte_zeit) {
        gesamtzeitMinuten = termin.geschaetzte_zeit;
        // Auch für Fallback globale Nebenzeit anwenden
        if (globaleNebenzeitProzent > 0) {
          gesamtzeitMinuten = Math.round(gesamtzeitMinuten * (1 + globaleNebenzeitProzent / 100));
        }
      }
      
      // Prüfe ob es separate Erweiterungs-Termine gibt
      let erweiterungen = [];
      let erweiterungenZeitMinuten = 0;
      try {
        const alleTermine = await TermineService.getAll();
        erweiterungen = alleTermine.filter(
          t => t.erweiterung_von_id === termin.id && !t.ist_geloescht
        );
        
        // Prüfe ob Haupttermin bereits [Erweiterung]-Einträge in arbeitszeiten_details hat
        const haupttermineArbeitenKeys = termin.arbeitszeiten_details 
          ? Object.keys(JSON.parse(termin.arbeitszeiten_details))
          : [];
        const hatErweiterungenInDetails = haupttermineArbeitenKeys.some(k => k.startsWith('[Erweiterung]'));
        
        // Nur zusätzliche Zeit berechnen, wenn KEINE Erweiterungen in arbeitszeiten_details sind
        // (sonst wurden sie dort bereits erfasst)
        if (!hatErweiterungenInDetails) {
          erweiterungen.forEach(erw => {
            let erwZeit = 0;
            
            if (erw.arbeitszeiten_details) {
              try {
                const details = JSON.parse(erw.arbeitszeiten_details);
                for (const [key, value] of Object.entries(details)) {
                  if (!key.startsWith('_')) {
                    let zeit = typeof value === 'object' ? (value.zeit || 0) : value;
                    // Globale Nebenzeit anwenden
                    if (globaleNebenzeitProzent > 0) {
                      zeit = zeit * (1 + globaleNebenzeitProzent / 100);
                    }
                    // Individuelle Faktoren anwenden
                    if (typeof value === 'object') {
                      if (value.type === 'lehrling' && value.mitarbeiter_id) {
                        const lehr = lehrlingeMap[value.mitarbeiter_id];
                        if (lehr && lehr.aufgabenbewaeltigung_prozent && lehr.aufgabenbewaeltigung_prozent !== 100) {
                          zeit = zeit * (lehr.aufgabenbewaeltigung_prozent / 100);
                        }
                      }
                    }
                    erwZeit += zeit;
                  }
                }
              } catch (e) {}
            } else if (erw.geschaetzte_zeit) {
              erwZeit = erw.geschaetzte_zeit;
              // Globale Nebenzeit auch auf geschätzte Zeit anwenden
              if (globaleNebenzeitProzent > 0) {
                erwZeit = erwZeit * (1 + globaleNebenzeitProzent / 100);
              }
            }
            
            erweiterungenZeitMinuten += erwZeit;
          });
        }
        
        erweiterungenZeitMinuten = Math.round(erweiterungenZeitMinuten);
      } catch (e) {
        console.error('Fehler beim Laden der Erweiterungen:', e);
      }
      
      // Endzeit: Verwende gespeicherte endzeit_berechnet wenn vorhanden
      let endzeitFormatiert = '-';
      
      // Für Erweiterungs-Termine: Hole endzeit_berechnet vom Haupttermin
      let effektiveEndzeit = termin.endzeit_berechnet;
      if (!effektiveEndzeit && termin.erweiterung_von_id) {
        // Dies ist eine Erweiterung - hole Endzeit vom Haupttermin
        try {
          const hauptTermin = await TermineService.getById(termin.erweiterung_von_id);
          if (hauptTermin && hauptTermin.endzeit_berechnet) {
            effektiveEndzeit = hauptTermin.endzeit_berechnet;
          }
        } catch (e) {
          console.error('Fehler beim Laden des Haupttermins:', e);
        }
      }
      
      if (effektiveEndzeit) {
        // Gespeicherte berechnete Endzeit verwenden
        endzeitFormatiert = effektiveEndzeit;
        if (erweiterungen.length > 0) {
          endzeitFormatiert += ` (inkl. ${erweiterungen.length} Erw.)`;
        }
      } else {
        // Fallback: Berechne lokal
        const startzeit = fruehesteStartzeit || termin.startzeit || termin.bring_zeit;
        const gesamtMinutenInklErw = gesamtzeitMinuten + erweiterungenZeitMinuten;
        
        if (startzeit && gesamtMinutenInklErw > 0) {
          const [startH, startM] = startzeit.split(':').map(Number);
          const startInMinuten = startH * 60 + startM;
          const endInMinuten = startInMinuten + gesamtMinutenInklErw;
          const endH = Math.floor(endInMinuten / 60);
          const endM = endInMinuten % 60;
          endzeitFormatiert = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
          if (erweiterungen.length > 0) {
            endzeitFormatiert += ` (inkl. ${erweiterungen.length} Erw.)`;
          }
        }
      }

      const heuteDatum = new Date().toISOString().slice(0, 10);
      const zeigeWeiterfuehrenBtn = termin.datum <= heuteDatum && termin.datum !== '9999-12-31' && !['abgeschlossen', 'storniert'].includes(termin.status);

      body.innerHTML = `
        <!-- Header-Bereich mit Termin-Nr und Status -->
        <div class="detail-header">
          <div class="detail-header-left">
            <span class="detail-termin-nr">🎫 ${termin.termin_nr || '-'}</span>
            ${schwebendBadge}
            ${verknuepfungsBadge}
          </div>
          <div class="detail-header-right">
            ${statusBadge}
          </div>
        </div>
        ${splitInfo ? `<div class="detail-split-info">${splitInfo}</div>` : ''}

        <!-- Kunde & Fahrzeug -->
        <div class="detail-section">
          <div class="detail-section-title">👤 Kunde & Fahrzeug</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Kunde</span>
              <span class="detail-value">${termin.kunde_name || '-'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Telefon</span>
              <span class="detail-value">${termin.kunde_telefon || '-'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Kennzeichen</span>
              <span class="detail-value detail-value-highlight">${termin.kennzeichen || '-'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Kilometerstand</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <input type="number" id="detailKilometerstand" value="${termin.kilometerstand || ''}"
                  placeholder="km" min="0"
                  style="padding:5px 8px; border:1px solid #ddd; border-radius:4px; width:130px; font-size:0.95em;">
                <span style="color:#666; font-size:0.9em;">km</span>
              </div>
            </div>
            <div class="detail-item">
              <span class="detail-label">Fahrgestellnr. (VIN)</span>
              <input type="text" id="detailVin" value="${termin.vin || ''}"
                placeholder="17-stellige VIN" maxlength="17"
                style="padding:5px 8px; border:1px solid #ddd; border-radius:4px; width:100%; font-family:'Courier New',monospace; font-size:0.9em; text-transform:uppercase;">
            </div>
            <div class="detail-item" style="display:flex; align-items:flex-end;">
              <button onclick="app.detailKmVinSpeichern(${termin.id})" 
                style="padding:6px 14px; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer; font-size:0.9em;">
                💾 KM / VIN speichern
              </button>
            </div>
          </div>
        </div>

        <!-- Arbeitsdetails -->
        <div class="detail-section">
          <div class="detail-section-title">🔧 Arbeitsdetails</div>
          <div class="detail-grid">
            <div class="detail-item detail-item-full">
              <span class="detail-label">Arbeiten</span>
              <span class="detail-value">${termin.arbeit || '-'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Geschätzte Zeit</span>
              <span class="detail-value detail-value-highlight">${this.formatMinutesToHours(termin.geschaetzte_zeit || 0)}</span>
            </div>
            ${gesamtzeitBerechnet ? `
            <div class="detail-item">
              <span class="detail-label">Berechnete Arbeitszeit</span>
              <span class="detail-value detail-value-highlight">⏱️ ${gesamtzeitBerechnet}</span>
            </div>` : ''}
            <div class="detail-item">
              <span class="detail-label">Interne Auftragsnr.</span>
              <input type="text" 
                     id="terminInterneAuftragsnummer"
                     value="${termin.interne_auftragsnummer || ''}"
                     placeholder="z.B. A-2026-123"
                     style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-family: 'Courier New', monospace; width: 100%;"
                     title="Interne Auftragsnummer">
            </div>
            ${termin.dringlichkeit ? `
            <div class="detail-item">
              <span class="detail-label">Dringlichkeit</span>
              <span class="detail-value">${dringlichkeitText}</span>
            </div>` : ''}
            <div class="detail-item detail-item-full">
              <span class="detail-label">Details/Wünsche</span>
              <span class="detail-value detail-value-notes">${termin.umfang || '-'}</span>
            </div>
          </div>
        </div>

        <!-- Termin & Abholung -->
        <div class="detail-section">
          <div class="detail-section-title">📆 Termin & Abholung</div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">Datum</span>
              <span class="detail-value detail-value-highlight">${datumFormatiert}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Abholung/Bringen</span>
              <span class="detail-value">${abholungText}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Bringzeit</span>
              <div class="detail-zeit-input-row">
                <input type="time" id="detailBringzeit" value="${termin.bring_zeit || ''}" class="detail-zeit-input" placeholder="--:--">
                <button class="btn-detail-zeit-save" onclick="app.updateTerminZeiten(${termin.id})" title="Speichern">💾</button>
              </div>
            </div>
            <div class="detail-item">
              <span class="detail-label">Fertig ca.</span>
              <span class="detail-value detail-value-highlight">${endzeitFormatiert}</span>
            </div>
            ${termin.fertigstellung_zeit ? `
            <div class="detail-item">
              <span class="detail-label">✅ Fertiggestellt um</span>
              <span class="detail-value detail-value-highlight" style="color: var(--success, #4caf50); font-weight: bold;">${(() => { const d = new Date(termin.fertigstellung_zeit); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); })()}</span>
            </div>` : ''}
            <div class="detail-item">
              <span class="detail-label">Abholzeit</span>
              <div class="detail-zeit-input-row">
                <input type="time" id="detailAbholzeit" value="${termin.abholung_zeit || ''}" class="detail-zeit-input" placeholder="--:--">
                <button class="btn-detail-zeit-save" onclick="app.updateTerminZeiten(${termin.id})" title="Speichern">💾</button>
              </div>
            </div>
            <div class="detail-item">
              <span class="detail-label">Kontakt</span>
              <span class="detail-value">${kontaktText}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Ersatzauto</span>
              ${ersatzautoBadge}
            </div>
            <div class="detail-item detail-item-full">
              <span class="detail-label">Abhol-Details</span>
              <span class="detail-value detail-value-notes">${termin.abholung_details || '-'}</span>
            </div>
          </div>
        </div>

        <!-- Mitarbeiter-Zuordnung -->
        <div class="detail-section detail-section-action">
          <div class="detail-section-title">👷 Mitarbeiter-Zuordnung</div>
          <select id="terminMitarbeiterSelect" class="detail-select">
            ${mitarbeiterOptions}
          </select>
          <button class="btn btn-primary detail-action-btn" onclick="app.updateTerminMitarbeiter(${termin.id})">
            💾 Zuordnung speichern
          </button>
        </div>

        <!-- Zeiten für einzelne Arbeiten -->
        <div class="detail-section detail-section-action">
          <button class="btn btn-secondary detail-action-btn" style="width: 100%;" onclick="app.closeTerminDetails(); app.openArbeitszeitenModal(${termin.id});">
            ⏱️ Zeiten für einzelne Arbeiten festlegen
          </button>
        </div>

        ${zeigeWeiterfuehrenBtn ? `
        <!-- Weiterführen am nächsten Arbeitstag -->
        <div class="detail-section detail-section-action">
          <button class="btn btn-primary detail-action-btn" style="width: 100%; background: #ff9800; border-color: #e65100;" onclick="app.weiterfuehrenTermin()">
            📅 Am nächsten Arbeitstag weiterführen
          </button>
        </div>` : ''}
      `;

      // Schwebend-Button aktualisieren
      this.updateSchwebendButton(termin.ist_schwebend);

      document.getElementById('terminDetailsModal').style.display = 'block';
    },

    closeTerminDetails() {
      document.getElementById('terminDetailsModal').style.display = 'none';
    },
  });
}
