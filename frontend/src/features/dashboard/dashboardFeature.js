export function installDashboardFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadDashboard() {
        await this.loadDashboardStats();
        await this.loadDashboardTermineHeute();
        await this.loadWochenUebersicht();
        await this.loadMonatsUebersicht();
        await this.loadErsatzautoRueckgaben();
        this.loadDashboardKPIs().catch(() => {}); // KPIs asynchron nachladen
      },

      async loadDashboardStats() {
        try {
          const today = this.formatDateLocal(this.getToday());
    
          const termineHeute = await TermineService.getAll(today);
          const allKunden = await KundenService.getAll();
          const auslastungHeute = await AuslastungService.getByDatum(today);
    
          const weekStart = this.getWeekStart();
          const weekEnd = this.getWeekEnd();
          const allTermine = await TermineService.getAll();
          const termineWoche = allTermine.filter(t => t.datum >= weekStart && t.datum <= weekEnd);
    
          document.getElementById('termineHeute').textContent = termineHeute.length;
          const geplant = termineHeute.filter(t => t.status === 'geplant' || t.status === 'offen').length;
          const inArbeit = termineHeute.filter(t => t.status === 'in_arbeit').length;
          document.getElementById('termineHeuteStatus').textContent =
            `${geplant} geplant, ${inArbeit} in Arbeit`;
    
          document.getElementById('auslastungHeute').textContent = `${auslastungHeute.auslastung_prozent}%`;
          const auslastungText = auslastungHeute.auslastung_prozent <= 80 ? 'Gut' :
                                 auslastungHeute.auslastung_prozent <= 100 ? 'Voll' : 'Überlastet';
          document.getElementById('auslastungHeuteStatus').textContent = auslastungText;
    
          document.getElementById('kundenGesamt').textContent = allKunden.length;
    
          // Lade Fahrzeuganzahl
          try {
            const fahrzeugeStats = await KundenService.countFahrzeuge();
            document.getElementById('fahrzeugeGesamt').textContent = fahrzeugeStats.anzahl || 0;
          } catch (e) {
            document.getElementById('fahrzeugeGesamt').textContent = '-';
          }
    
          document.getElementById('termineWoche').textContent = termineWoche.length;
    
          // Dashboard Auslastungsbalken aktualisieren
          this.updateDashboardAuslastung(auslastungHeute);
    
        } catch (error) {
          console.error('Fehler beim Laden der Dashboard-Statistiken:', error);
        }
      },

      async loadDashboardTermineHeute() {
        try {
          const today = this.formatDateLocal(this.getToday());
          const termine = await TermineService.getAll(today);
          termine.forEach(t => {
            this.termineById[t.id] = t;
          });
    
          const table = document.getElementById('dashboardTermineTable');
          const tbody = table.getElementsByTagName('tbody')[0];
          tbody.innerHTML = '';
    
          if (termine.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">Keine Termine für heute</td></tr>';
            return;
          }
    
          const renderRows = (list) => {
            tbody.innerHTML = '';
            list.forEach(termin => {
              const row = tbody.insertRow();
              const statusClass = `status-${termin.status}`;
              const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
              
              // Folgetermin-Badge für Dashboard
              const folgeterminBadge = this.getFolgeterminBadge(termin.arbeit);
              const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);
              
              // Teile-Status Badge
              const teileStatusBadge = this.getTerminTeileStatusBadge(termin);
    
              row.innerHTML = `
                <td><strong>${termin.termin_nr || '-'}</strong>${folgeterminBadge}${teileStatusBadge}</td>
                <td>${termin.abholung_typ === 'warten' ? 'Ja' : 'Nein'}</td>
                <td>${termin.bring_zeit || '-'}</td>
                <td>${termin.abholung_zeit || '-'}</td>
                <td>${termin.kunde_name}</td>
                <td>${termin.kennzeichen}</td>
                <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
                <td>${this.formatZeit(zeitAnzeige)}</td>
                <td class="dashboard-action-cell">
                  <div class="dashboard-action-grid">
                    <span class="status-badge ${statusClass}">${termin.status}</span>
                    <button class="btn btn-edit" onclick="app.showTerminDetails(${termin.id})">Details</button>
                  </div>
                </td>
              `;
            });
          };
    
          renderRows(termine);
    
          const headers = table.querySelectorAll('th');
          const sortConfig = { index: null, asc: true };
    
          const sortData = (index) => {
            const sorted = [...termine].sort((a, b) => {
              const getValue = (t) => {
                switch (index) {
                  case 0: return t.termin_nr || '';
                  case 1: return t.abholung_typ === 'warten' ? 1 : 0;
                  case 2: return t.bring_zeit || '';
                  case 3: return t.abholung_zeit || '';
                  case 4: return t.kunde_name || '';
                  case 5: return t.kennzeichen || '';
                  case 6: return t.arbeit || '';
                  case 7: return t.tatsaechliche_zeit || t.geschaetzte_zeit || 0;
                  default: return '';
                }
              };
    
              const va = getValue(a);
              const vb = getValue(b);
    
              if (typeof va === 'number' && typeof vb === 'number') {
                return sortConfig.asc ? va - vb : vb - va;
              }
              return sortConfig.asc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
            renderRows(sorted);
          };
    
          headers.forEach((th, idx) => {
            th.style.cursor = 'pointer';
            th.onclick = () => {
              if (sortConfig.index === idx) {
                sortConfig.asc = !sortConfig.asc;
              } else {
                sortConfig.index = idx;
                sortConfig.asc = true;
              }
              sortData(idx);
            };
          });
        } catch (error) {
          console.error('Fehler beim Laden der heutigen Termine:', error);
        }
      },

      async loadDashboardKPIs() {
        const kpiGrid = document.getElementById('kpiGrid');
        if (!kpiGrid) return;
        kpiGrid.style.opacity = '0.5';
        try {
          const heute = new Date();
          const von = new Date(heute.getFullYear(), heute.getMonth(), 1).toISOString().slice(0, 10);
          const bis = heute.toISOString().slice(0, 10);
          const response = await window.ReportingService.getKPIs(von, bis);
          const kpis = response.kpis || response;
    
          const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    
          const auslMin = Math.round(kpis.avg_durchlaufzeit_minuten || 0);
          set('kpiAuslastungWert', auslMin >= 60 ? `${Math.floor(auslMin/60)}h ${auslMin%60}m` : `${auslMin}m`);
          set('kpiAuslastungSub', 'Ø Durchlaufzeit');
    
          const gen = kpis.schaetzgenauigkeit != null ? Math.round(kpis.schaetzgenauigkeit) : null;
          set('kpiGenauigkeitWert', gen != null ? `${gen}%` : '—');
          const genCard = document.getElementById('kpiGenauigkeit');
          if (genCard && gen != null) {
            genCard.classList.toggle('kpi-gut', gen >= 80);
            genCard.classList.toggle('kpi-schlecht', gen < 60);
          }
    
          set('kpiAbgeschlossenWert', kpis.abgeschlossene_termine ?? '—');
    
          set('kpiSchwebendWert', kpis.schwebende_anzahl ?? '—');
          const avg = kpis.avg_wartezeit_tage != null ? Math.round(kpis.avg_wartezeit_tage) : null;
          set('kpiSchwebendSub', avg != null ? `Ø ${avg} Tage Wartezeit` : 'Termine');
    
          set('kpiTeileWert', kpis.teile_offen ?? '—');
          set('kpiTeileDringend', kpis.teile_dringend ?? '—');
    
          const nq = kpis.nacharbeitsquote != null ? Math.round(kpis.nacharbeitsquote) : null;
          set('kpiNacharbeitWert', nq != null ? `${nq}%` : '—');
    
          const wdh = kpis.wiederholungen_anzahl ?? 0;
          const wdhQuote = kpis.wiederholungen_quote != null ? Math.round(kpis.wiederholungen_quote * 100) : 0;
          set('kpiWiederholungWert', wdh);
          set('kpiWiederholungSub', `${wdhQuote}% der Termine`);
          const wdhCard = document.getElementById('kpiWiederholung');
          if (wdhCard) {
            wdhCard.classList.toggle('kpi-schlecht', wdh > 0);
            wdhCard.classList.toggle('kpi-gut', wdh === 0);
          }
    
          const ueberfaellig = kpis.ueberfaellige_termine ?? 0;
          set('kpiUeberfaelligWert', ueberfaellig);
          const ueberfaelligCard = document.getElementById('kpiUeberfaellig');
          if (ueberfaelligCard) {
            ueberfaelligCard.classList.toggle('kpi-schlecht', ueberfaellig > 0);
            ueberfaelligCard.classList.toggle('kpi-gut', ueberfaellig === 0);
          }
          set('kpiUeberfaelligSub', ueberfaellig === 0 ? 'Alles im Plan ✓' : 'Datum vergangen');
        } catch (err) {
          console.warn('KPI-Ladung fehlgeschlagen:', err);
        } finally {
          kpiGrid.style.opacity = '1';
        }
      },

      updateDashboardAuslastung(data) {
        // Zeige die Zeiten nach Status
        document.getElementById('dashboardGeplant').textContent = this.formatMinutesToHours(data.geplant_minuten || 0);
        document.getElementById('dashboardInArbeit').textContent = this.formatMinutesToHours(data.in_arbeit_minuten || 0);
        document.getElementById('dashboardAbgeschlossen').textContent = this.formatMinutesToHours(data.abgeschlossen_minuten || 0);
        document.getElementById('dashboardVerfuegbar').textContent = this.formatMinutesToHours(data.verfuegbar_minuten);
    
        if (data.gesamt_minuten) {
          document.getElementById('dashboardVerfuegbar').textContent =
            `${this.formatMinutesToHours(data.verfuegbar_minuten)} (${this.formatMinutesToHours(data.gesamt_minuten)} gesamt)`;
        }
    
        // Berechne Prozentanteile für die Segmente
        // Wenn keine Kapazität, nutze belegte Zeit als Referenz für den Balken
        const belegteZeit = (data.geplant_minuten || 0) + (data.in_arbeit_minuten || 0) + (data.abgeschlossen_minuten || 0);
        const referenzMinuten = data.gesamt_minuten > 0 ? data.gesamt_minuten : (belegteZeit > 0 ? belegteZeit : 1);
        const geplantProzent = ((data.geplant_minuten || 0) / referenzMinuten) * 100;
        const inArbeitProzent = ((data.in_arbeit_minuten || 0) / referenzMinuten) * 100;
        const abgeschlossenProzent = ((data.abgeschlossen_minuten || 0) / referenzMinuten) * 100;
    
        // Setze die Breite der Segmente
        const geplantSegment = document.getElementById('dashboardProgressGeplant');
        const inArbeitSegment = document.getElementById('dashboardProgressInArbeit');
        const abgeschlossenSegment = document.getElementById('dashboardProgressAbgeschlossen');
    
        if (geplantSegment && inArbeitSegment && abgeschlossenSegment) {
          geplantSegment.style.width = `${Math.min(geplantProzent, 100)}%`;
          inArbeitSegment.style.width = `${Math.min(inArbeitProzent, 100)}%`;
          abgeschlossenSegment.style.width = `${Math.min(abgeschlossenProzent, 100)}%`;
    
          // Zeige oder verstecke den "Keine Termine" Text
          const emptyText = document.getElementById('dashboardProgressEmpty');
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
        }
      },

      updateAktuelleUhrzeit() {
        const now = new Date();
        const uhrzeitEl = document.getElementById('aktuelleUhrzeit');
        const datumEl = document.getElementById('aktuelleUhrzeitDatum');
        
        if (uhrzeitEl) {
          const stunden = String(now.getHours()).padStart(2, '0');
          const minuten = String(now.getMinutes()).padStart(2, '0');
          uhrzeitEl.textContent = `${stunden}:${minuten}`;
        }
        
        if (datumEl) {
          datumEl.textContent = now.toLocaleDateString('de-DE', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit'
          });
        }
      },

      updateNaechsterKunde(termine) {
        const jetzt = new Date();
        const aktuelleStunde = jetzt.getHours();
        const aktuelleMinute = jetzt.getMinutes();
        const aktuelleZeitMinuten = aktuelleStunde * 60 + aktuelleMinute;
        
        const zeitEl = document.getElementById('naechsterKundeZeit');
        const infoEl = document.getElementById('naechsterKundeInfo');
        
        if (!zeitEl || !infoEl) return;
        
        // Finde den nächsten Termin mit Bringzeit, der noch nicht vorbei ist
        let naechsterTermin = null;
        let minDiff = Infinity;
        
        termine.forEach(termin => {
          if (!termin.bring_zeit) return;
          // Bereits laufende, abgeschlossene oder stornierte Termine nicht als "Nächster Kunde" zeigen
          if (termin.status === 'in_arbeit' || termin.status === 'abgeschlossen' || termin.status === 'storniert') return;
          
          const [stunden, minuten] = termin.bring_zeit.split(':').map(Number);
          const terminZeitMinuten = stunden * 60 + minuten;
          
          // Nur Termine in der Zukunft oder jetzt
          if (terminZeitMinuten >= aktuelleZeitMinuten) {
            const diff = terminZeitMinuten - aktuelleZeitMinuten;
            if (diff < minDiff) {
              minDiff = diff;
              naechsterTermin = termin;
            }
          }
        });
        
        if (naechsterTermin && minDiff < Infinity) {
          const [stunden, minuten] = naechsterTermin.bring_zeit.split(':').map(Number);
          const terminZeitMinuten = stunden * 60 + minuten;
          const diffMinuten = terminZeitMinuten - aktuelleZeitMinuten;
          
          if (diffMinuten <= 0) {
            zeitEl.textContent = 'JETZT';
            zeitEl.style.color = 'var(--accent)';
            infoEl.textContent = `${naechsterTermin.kunde_name || 'Kunde'} - ${naechsterTermin.kennzeichen || ''}`;
          } else {
            const diffStunden = Math.floor(diffMinuten / 60);
            const diffMin = diffMinuten % 60;
            
            const countdown = diffStunden > 0 
              ? `${String(diffStunden).padStart(2, '0')}:${String(diffMin).padStart(2, '0')}`
              : `00:${String(diffMin).padStart(2, '0')}`;
            
            zeitEl.textContent = `in: ${countdown} um: ${naechsterTermin.bring_zeit}`;
            zeitEl.style.color = diffMinuten <= 15 ? 'var(--accent)' : 'inherit';
            infoEl.textContent = `${naechsterTermin.kunde_name || 'Kunde'} - ${naechsterTermin.kennzeichen || ''}`;
          }
        } else {
          zeitEl.textContent = 'in: --:-- um: --:--';
          zeitEl.style.color = 'inherit';
          infoEl.textContent = 'Keine weiteren Termine heute';
        }
      },

      async loadWochenUebersicht() {
        try {
          const allTermine = await TermineService.getAll();
          const weekDays = this.getWeekDays();
          const today = this.formatDateLocal(this.getToday());
    
          for (const [index, day] of weekDays.entries()) {
            const dayName = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'][index];
            const card = document.getElementById(dayName);
    
            if (!card) continue;
    
            const termineForDay = allTermine.filter(t => t.datum === day.datum);
            const auslastung = await AuslastungService.getByDatum(day.datum);
    
            card.querySelector('.wochentag-datum').textContent = day.formatted;
            card.querySelector('.wochentag-termine').textContent = `${termineForDay.length} Termine`;
    
            const progressFill = card.querySelector('.mini-progress-fill');
            progressFill.style.width = `${Math.min(auslastung.auslastung_prozent, 100)}%`;
    
            if (day.datum === today) {
              card.classList.add('heute');
            } else {
              card.classList.remove('heute');
            }
    
            // Click-Event für Tagesübersicht-Popup
            card.dataset.datum = day.datum;
            card.onclick = () => this.openTagesUebersichtModal(day.datum);
          }
        } catch (error) {
          console.error('Fehler beim Laden der Wochenübersicht:', error);
        }
      },

      getNextDays(count = 30) {
        const days = [];
        const start = new Date();
        start.setHours(12, 0, 0, 0); // stabil gegen Zeitzonen/DST
        // Starte ab dem nächsten/aktuellen Montag (nicht in der Vergangenheit)
        while (start.getDay() !== 1) {
          start.setDate(start.getDate() + 1);
        }
        let offset = 0;
    
        while (days.length < count && offset < 90) {
          const day = new Date(start);
          day.setDate(start.getDate() + offset);
          offset += 1;
    
          // Überspringe Sonntag
          if (day.getDay() === 0) {
            continue;
          }
    
          days.push({
            datum: this.formatDateLocal(day),
            formatted: day.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
            weekday: day.toLocaleDateString('de-DE', { weekday: 'short' })
          });
        }
        return days;
      },

      getWeeksForMonthView() {
        const weeks = [];
        const today = new Date(this.getToday());
        today.setHours(12, 0, 0, 0);
        
        // Finde den Montag der aktuellen Woche
        const currentDay = today.getDay();
        const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay; // Sonntag = 0 -> gehe 6 Tage zurück
        const startMonday = new Date(today);
        startMonday.setDate(today.getDate() + mondayOffset);
        
        // 5 Wochen generieren (Mo-Sa = 6 Tage pro Woche = 30 Arbeitstage)
        for (let weekNum = 0; weekNum < 5; weekNum++) {
          const week = [];
          for (let dayNum = 0; dayNum < 6; dayNum++) { // Mo=0 bis Sa=5
            const day = new Date(startMonday);
            day.setDate(startMonday.getDate() + (weekNum * 7) + dayNum);
            
            const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
            
            week.push({
              datum: this.formatDateLocal(day),
              dayNum: day.getDate(),
              monthShort: monthNames[day.getMonth()],
              dayOfWeek: day.getDay() // 1=Mo, 2=Di, ..., 6=Sa
            });
          }
          weeks.push(week);
        }
        return weeks;
      },

      async loadMonatsUebersicht() {
        const container = document.getElementById('monatsUebersicht');
        if (!container) return;
    
        container.innerHTML = '<div class="loading">Monatsübersicht wird geladen...</div>';
    
        try {
          const allTermine = await TermineService.getAll();
          const weeks = this.getWeeksForMonthView();
          const today = this.formatDateLocal(this.getToday());
    
          // Sammle alle Tage für Auslastungsabfrage
          const allDays = weeks.flat();
          const auslastungPromises = allDays.map(day =>
            AuslastungService.getByDatum(day.datum).catch(() => ({ auslastung_prozent: 0 }))
          );
          const auslastungen = await Promise.all(auslastungPromises);
          
          // Erstelle Map für schnellen Zugriff
          const auslastungMap = {};
          allDays.forEach((day, index) => {
            auslastungMap[day.datum] = auslastungen[index] || { auslastung_prozent: 0 };
          });
    
          // Erstelle Kalender-Layout
          container.innerHTML = '';
          
          // Header mit Wochentagen
          const header = document.createElement('div');
          header.className = 'monats-header';
          header.innerHTML = `
            <div class="monats-header-cell">Mo</div>
            <div class="monats-header-cell">Di</div>
            <div class="monats-header-cell">Mi</div>
            <div class="monats-header-cell">Do</div>
            <div class="monats-header-cell">Fr</div>
            <div class="monats-header-cell">Sa</div>
          `;
          container.appendChild(header);
    
          // Wochen als Zeilen
          weeks.forEach(week => {
            const weekRow = document.createElement('div');
            weekRow.className = 'monats-week';
    
            week.forEach(day => {
              const termineForDay = allTermine.filter(t => t.datum === day.datum);
              const auslastung = auslastungMap[day.datum] || { auslastung_prozent: 0 };
              const isPast = day.datum < today;
    
              const card = document.createElement('div');
              card.className = 'monats-card';
              if (day.datum === today) {
                card.classList.add('heute');
              }
              if (isPast) {
                card.classList.add('vergangen');
              }
              if (day.dayOfWeek === 6) {
                card.classList.add('samstag');
              }
    
              card.innerHTML = `
                <div class="monats-datum">
                  <span class="monats-tag">${day.dayNum}</span>
                  <span class="monats-monat">${day.monthShort}</span>
                </div>
                <div class="monats-termine">${termineForDay.length}</div>
                <div class="mini-progress-bar">
                  <div class="mini-progress-fill" style="width:${Math.min(auslastung.auslastung_prozent, 100)}%"></div>
                </div>
              `;
    
              // Click-Event für Tagesübersicht-Popup
              card.dataset.datum = day.datum;
              card.addEventListener('click', () => this.openTagesUebersichtModal(day.datum));
    
              weekRow.appendChild(card);
            });
    
            container.appendChild(weekRow);
          });
        } catch (error) {
          console.error('Fehler beim Laden der Monatsübersicht:', error);
          container.innerHTML = '<div class="loading">Monatsübersicht konnte nicht geladen werden</div>';
        }
      },

      async loadErsatzautoRueckgaben() {
        const section = document.getElementById('ersatzautoRueckgabenSection');
        const container = document.getElementById('ersatzautoRueckgabenListe');
        if (!section || !container) return;
    
        try {
          const rueckgaben = await ErsatzautosService.getHeuteRueckgaben();
          
          if (!rueckgaben || rueckgaben.length === 0) {
            section.style.display = 'none';
            return;
          }
    
          section.style.display = 'block';
          
          container.innerHTML = rueckgaben.map(r => {
            const rueckgabeZeit = r.rueckgabe_zeit || r.abholung_zeit || r.ersatzauto_bis_zeit || '18:00';
            const jetzt = new Date();
            const [h, m] = rueckgabeZeit.split(':').map(Number);
            const rueckgabeDate = new Date();
            rueckgabeDate.setHours(h, m, 0, 0);
            
            const istUeberfaellig = jetzt > rueckgabeDate;
            const statusClass = istUeberfaellig ? 'ueberfaellig' : 'erwartet';
            const statusIcon = istUeberfaellig ? '⚠️' : '🕐';
            const statusText = istUeberfaellig ? 'Überfällig!' : 'Erwartet';
            
            return `
              <div class="rueckgabe-karte ${statusClass}">
                <div class="rueckgabe-header">
                  <span class="rueckgabe-zeit">${statusIcon} ${rueckgabeZeit} Uhr</span>
                  <span class="rueckgabe-status">${statusText}</span>
                </div>
                <div class="rueckgabe-kunde">
                  <strong>${r.kunde_name || 'Unbekannt'}</strong>
                </div>
                <div class="rueckgabe-details">
                  <span class="rueckgabe-kennzeichen">🚗 ${r.kennzeichen || '-'}</span>
                  ${r.kunde_telefon ? `<span class="rueckgabe-telefon">📞 ${r.kunde_telefon}</span>` : ''}
                </div>
                <div class="rueckgabe-termin">
                  <small>Termin: ${r.termin_nr || '-'} | Seit: ${this.formatDate(r.datum)}</small>
                </div>
              </div>
            `;
          }).join('');
          
        } catch (error) {
          console.error('Fehler beim Laden der Ersatzauto-Rückgaben:', error);
          section.style.display = 'none';
        }
      }
  });
}
