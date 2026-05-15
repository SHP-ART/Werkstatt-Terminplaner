export function installTimeTrackingFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      navigateZeitverwaltung(days, type) {
        const filterDatum = document.getElementById('filterDatum');
        let currentDate;
        
        if (filterDatum.value) {
          currentDate = new Date(filterDatum.value);
        } else {
          currentDate = new Date();
        }
        
        currentDate.setDate(currentDate.getDate() + days);
        
        // Überspringe Sonntage (0 = Sonntag)
        if (currentDate.getDay() === 0) {
          // Bei Vorwärts-Navigation: gehe zum Montag
          // Bei Rückwärts-Navigation: gehe zum Samstag
          if (days > 0) {
            currentDate.setDate(currentDate.getDate() + 1); // Montag
          } else {
            currentDate.setDate(currentDate.getDate() - 1); // Samstag
          }
        }
        
        filterDatum.value = this.formatDateLocal(currentDate);
        this.loadTermine();
        this.updateZeitverwaltungDatumAnzeige();
      },

      goToToday() {
        const filterDatum = document.getElementById('filterDatum');
        let today = new Date();
        
        // Falls heute Sonntag ist, zeige Montag
        if (today.getDay() === 0) {
          today.setDate(today.getDate() + 1);
        }
        
        filterDatum.value = this.formatDateLocal(today);
        this.loadTermine();
        this.updateZeitverwaltungDatumAnzeige();
      },

      goToMorgen() {
        const filterDatum = document.getElementById('filterDatum');
        let morgen = new Date();
        morgen.setDate(morgen.getDate() + 1);
        
        // Falls morgen Sonntag ist, überspringe zu Montag
        if (morgen.getDay() === 0) {
          morgen.setDate(morgen.getDate() + 1);
        }
        
        filterDatum.value = this.formatDateLocal(morgen);
        this.loadTermine();
        this.updateZeitverwaltungDatumAnzeige();
      },

      async showWocheTermine() {
        // Zeige alle Termine der aktuellen Woche (Mo-Sa, ohne Sonntag)
        document.getElementById('filterDatum').value = '';
        
        try {
          const termine = await TermineService.getAll(null);
          
          // Berechne Montag und Samstag der aktuellen Woche
          const heute = new Date();
          const tag = heute.getDay();
          const diffToMontag = tag === 0 ? -6 : 1 - tag; // Sonntag = -6, sonst 1 - aktueller Tag
          
          const montag = new Date(heute);
          montag.setDate(heute.getDate() + diffToMontag);
          montag.setHours(0, 0, 0, 0);
          
          const samstag = new Date(montag);
          samstag.setDate(montag.getDate() + 5);
          samstag.setHours(23, 59, 59, 999);
          
          // Filtere Termine der Woche (Mo-Sa)
          const wochenTermine = termine.filter(t => {
            if (!t.datum) return false;
            const terminDatum = new Date(t.datum);
            terminDatum.setHours(12, 0, 0, 0);
            return terminDatum >= montag && terminDatum <= samstag;
          });
          
          // Sortiere nach Datum
          wochenTermine.sort((a, b) => new Date(a.datum) - new Date(b.datum));
          
          this.termineCache = termine;
          this.updateTerminSuchliste();
          this.termineById = {};
    
          const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
          tbody.innerHTML = '';
    
          if (wochenTermine.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="13" style="text-align: center; padding: 30px; color: #666;">📭 Keine Termine in dieser Woche (Mo-Sa)</td>';
          } else {
            wochenTermine.forEach(termin => {
              this.termineById[termin.id] = termin;
              const row = tbody.insertRow();
              const statusClass = `status-${termin.status}`;
              const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
    
              // Zeit-Status Icon
              let zeitStatusIcon = '⚪';
              if (termin.tatsaechliche_zeit && termin.tatsaechliche_zeit > 0) {
                zeitStatusIcon = '✅';
              } else if (termin.muss_bearbeitet_werden) {
                zeitStatusIcon = '🔴';
              }
    
              // Dringlichkeit-Badge
              const terminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
              
              // Folgetermin-Badge
              const terminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
              
              // Arbeit-Anzeige formatieren
              const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);
              
              // Datum formatieren für Anzeige
              const datumObj = new Date(termin.datum);
              const wochentag = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][datumObj.getDay()];
              const datumAnzeige = `${wochentag}, ${termin.datum}`;
    
              row.innerHTML = `
                <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
                <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}</td>
                <td><strong>${datumAnzeige}</strong></td>
                <td>${termin.kunde_name}</td>
                <td>${termin.kennzeichen}</td>
                <td>${termin.kilometerstand || '-'}</td>
                <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
                <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
                <td>${this.formatZeit(zeitAnzeige)}</td>
                <td>${termin.mitarbeiter_name || '-'}</td>
                <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
                <td class="action-buttons-grid">
                  <button class="btn btn-edit action-btn-details" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
                    📄 Details
                  </button>
                  <button class="btn btn-delete-icon" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" title="Löschen">
                    🗑️
                  </button>
                </td>
              `;
    
              row.style.cursor = 'pointer';
              row.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                  return;
                }
                this.openArbeitszeitenModal(termin.id);
              };
            });
          }
          
          // Aktualisiere die Datum-Anzeige
          const datumAnzeige = document.getElementById('zeitverwaltungDatumText');
          if (datumAnzeige) {
            const montagStr = this.formatDateLocal(montag);
            const samstagStr = this.formatDateLocal(samstag);
            datumAnzeige.textContent = `🗓️ Woche: ${montagStr} - ${samstagStr} (${wochenTermine.length} Termine)`;
            datumAnzeige.parentElement.style.borderLeftColor = '#17a2b8';
          }
        } catch (error) {
          console.error('Fehler beim Laden der Wochentermine:', error);
        }
      },

      async showOffeneTermine() {
        // Zeige alle Termine ohne tatsächliche Zeit ODER mit "muss bearbeitet werden" Markierung
        document.getElementById('filterDatum').value = '';
        
        try {
          const termine = await TermineService.getAll(null);
          
          // Filtere Termine: ohne tatsächliche Zeit ODER mit "muss noch bearbeitet werden" Markierung
          const offeneTermine = termine.filter(t => 
            (!t.tatsaechliche_zeit || t.tatsaechliche_zeit <= 0) || t.muss_bearbeitet_werden
          );
          
          this.termineCache = termine;
          this.updateTerminSuchliste();
          this.termineById = {};
    
          const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
          tbody.innerHTML = '';
    
          if (offeneTermine.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="13" style="text-align: center; padding: 30px; color: #27ae60;">✅ Keine offenen Termine - alle Zeiten sind erfasst!</td>';
          } else {
            offeneTermine.forEach(termin => {
              this.termineById[termin.id] = termin;
              const row = tbody.insertRow();
              const statusClass = `status-${termin.status}`;
              const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
    
              const zeitStatusIcon = '🔴';
    
              // Dringlichkeit-Badge
              const offeneTerminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
              
              // Folgetermin-Badge
              const offeneTerminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
              
              // Arbeit-Anzeige formatieren
              const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);
    
              row.innerHTML = `
                <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
                <td><strong>${termin.termin_nr || '-'}</strong>${offeneTerminDringlichkeit}${offeneTerminFolgetermin}</td>
                <td>${termin.datum}</td>
                <td>${termin.kunde_name}</td>
                <td>${termin.kennzeichen}</td>
                <td>${termin.kilometerstand || '-'}</td>
                <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
                <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
                <td>${this.formatZeit(zeitAnzeige)}</td>
                <td>${termin.mitarbeiter_name || '-'}</td>
                <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
                <td class="action-buttons-grid">
                  <button class="btn btn-edit action-btn-details" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
                    📄 Details
                  </button>
                  <button class="btn btn-delete-icon" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" title="Löschen">
                    🗑️
                  </button>
                </td>
              `;
    
              row.style.cursor = 'pointer';
              row.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                  return;
                }
                this.openArbeitszeitenModal(termin.id);
              };
            });
          }
          
          // Aktualisiere die Datum-Anzeige
          const datumAnzeige = document.getElementById('zeitverwaltungDatumText');
          if (datumAnzeige) {
            datumAnzeige.textContent = `🔴 Offene Termine (${offeneTermine.length})`;
            datumAnzeige.parentElement.style.borderLeftColor = '#e67e22';
          }
        } catch (error) {
          console.error('Fehler beim Laden der offenen Termine:', error);
        }
      },

      async showSchwebendeTermine() {
        // Zeige alle schwebenden Termine (ist_schwebend = 1)
        
        // Wechsle zum Zeitverwaltung-Tab
        this.switchToTab('zeitverwaltung');
        
        document.getElementById('filterDatum').value = '';
        
        try {
          const termine = await TermineService.getAll(null);
          
          // Filtere nur schwebende Termine
          const schwebendeTermine = termine.filter(t => t.ist_schwebend);
          
          this.termineCache = termine;
          this.updateTerminSuchliste();
          this.termineById = {};
    
          const tbody = document.getElementById('termineTable').getElementsByTagName('tbody')[0];
          tbody.innerHTML = '';
    
          if (schwebendeTermine.length === 0) {
            const row = tbody.insertRow();
            row.innerHTML = '<td colspan="13" style="text-align: center; padding: 30px; color: #27ae60;">✅ Keine schwebenden Termine vorhanden</td>';
          } else {
            schwebendeTermine.forEach(termin => {
              this.termineById[termin.id] = termin;
              const row = tbody.insertRow();
              const statusClass = `status-${termin.status}`;
              const zeitAnzeige = termin.tatsaechliche_zeit || termin.geschaetzte_zeit;
    
              const zeitStatusIcon = '⏳';
    
              // Dringlichkeit-Badge
              const terminDringlichkeit = this.getDringlichkeitBadge(termin.dringlichkeit);
              
              // Folgetermin-Badge
              const terminFolgetermin = this.getFolgeterminBadge(termin.arbeit);
              
              // Arbeit-Anzeige formatieren
              const arbeitAnzeige = this.formatArbeitAnzeige(termin.arbeit);
    
              row.innerHTML = `
                <td style="text-align: center; font-size: 20px;">${zeitStatusIcon}</td>
                <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}</td>
                <td>${termin.datum}</td>
                <td>${termin.kunde_name}</td>
                <td>${termin.kennzeichen}</td>
                <td>${termin.kilometerstand || '-'}</td>
                <td>${termin.ersatzauto ? 'Ja' : 'Nein'}</td>
                <td title="${termin.arbeit || ''}">${arbeitAnzeige}</td>
                <td>${this.formatZeit(zeitAnzeige)}</td>
                <td>${termin.mitarbeiter_name || '-'}</td>
                <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
                <td class="action-buttons-grid">
                  <button class="btn btn-edit action-btn-details" onclick="event.stopPropagation(); app.showTerminDetails(${termin.id})">
                    📄 Details
                  </button>
                  <button class="btn btn-delete-icon" onclick="event.stopPropagation(); app.deleteTermin(${termin.id})" title="Löschen">
                    🗑️
                  </button>
                </td>
              `;
    
              row.style.cursor = 'pointer';
              row.onclick = (e) => {
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                  return;
                }
                this.openArbeitszeitenModal(termin.id);
              };
            });
          }
          
          // Aktualisiere die Datum-Anzeige
          const datumAnzeige = document.getElementById('zeitverwaltungDatumText');
          if (datumAnzeige) {
            datumAnzeige.textContent = `⏳ Schwebende Termine (${schwebendeTermine.length})`;
            datumAnzeige.parentElement.style.borderLeftColor = '#ff9800';
          }
        } catch (error) {
          console.error('Fehler beim Laden der schwebenden Termine:', error);
        }
      },

      updateZeitverwaltungDatumAnzeige() {
        const filterDatum = document.getElementById('filterDatum');
        const datumAnzeige = document.getElementById('zeitverwaltungDatumText');
        
        if (!datumAnzeige || !filterDatum) return;
        
        if (!filterDatum.value) {
          datumAnzeige.textContent = '📋 Alle Termine';
          datumAnzeige.parentElement.style.borderLeftColor = '#4a90e2';
        } else {
          const datum = new Date(filterDatum.value);
          const heute = new Date();
          heute.setHours(0, 0, 0, 0);
          datum.setHours(0, 0, 0, 0);
          
          const wochentage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
          const wochentag = wochentage[datum.getDay()];
          
          const formatiertesDatum = datum.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
          
          let prefix = '';
          let color = '#4a90e2';
          
          if (datum.getTime() === heute.getTime()) {
            prefix = '📅 Heute - ';
            color = '#27ae60';
          } else if (datum.getTime() === heute.getTime() - 86400000) {
            prefix = '⏪ Gestern - ';
            color = '#95a5a6';
          } else if (datum.getTime() === heute.getTime() + 86400000) {
            prefix = '⏩ Morgen - ';
            color = '#3498db';
          }
          
          datumAnzeige.textContent = `${prefix}${wochentag}, ${formatiertesDatum}`;
          datumAnzeige.parentElement.style.borderLeftColor = color;
        }
      },

      async stempelSetzen(terminId, arbeitName, typ) {
        const jetzt = new Date();
        const zeit = `${String(jetzt.getHours()).padStart(2,'0')}:${String(jetzt.getMinutes()).padStart(2,'0')}`;
        const body = { termin_id: terminId, arbeit_name: arbeitName };
        if (typ === 'start') body.stempel_start = zeit;
        else body.stempel_ende = zeit;
        try {
          await ApiService.put('/stempelzeiten/stempel', body);
        } catch (err) {
          console.error('[Stempel] Fehler:', err);
          alert('Fehler beim Stempeln.');
        }
      },

      async stempelManuellSetzen(terminId, arbeitName, typ, zeitWert) {
        if (!zeitWert) return;
        const body = { termin_id: terminId, arbeit_name: arbeitName };
        if (typ === 'start') body.stempel_start = zeitWert;
        else body.stempel_ende = zeitWert;
        try {
          await ApiService.put('/stempelzeiten/stempel', body);
        } catch (err) {
          console.error('[Stempel manuell] Fehler:', err);
          alert('Fehler beim Speichern der Zeit.');
        }
      },

      async loadZeitkonto() {
        const von = document.getElementById('zeitkontoVon')?.value;
        const bis = document.getElementById('zeitkontoBis')?.value;
        const container = document.getElementById('zeitkontoContainer');
        if (!container) return;
        if (!von || !bis) {
          container.innerHTML = '<p style="color:#aaa;font-size:13px;">Zeitraum wählen…</p>';
          return;
        }
        container.innerHTML = '<p class="loading-text" style="font-size:13px;">Lade Zeitkonto…</p>';
        try {
          const daten = await ApiService.get(`/zeitkonto?von=${von}&bis=${bis}`);
          this.renderZeitkonto(daten, von, bis);
        } catch (err) {
          container.innerHTML = `<p style="color:#e55;font-size:13px;">Fehler: ${err.message}</p>`;
        }
      },

      renderZeitkonto(daten, von, bis) {
        const container = document.getElementById('zeitkontoContainer');
        if (!container) return;
    
        const minToStr = m => {
          if (m === 0) return '0:00';
          const neg = m < 0;
          const abs = Math.abs(m);
          return (neg ? '−' : '') + Math.floor(abs / 60) + ':' + String(abs % 60).padStart(2, '0');
        };
    
        const saldoStyle = saldo => {
          if (saldo > 0) return 'color:#1a7f37;font-weight:600;';
          if (saldo < 0) return 'color:#cf222e;font-weight:600;';
          return 'color:#666;';
        };
    
        const abwLabel = { urlaub: '🏖️ Urlaub', krank: '🤒 Krank', berufsschule: '🏫 Berufsschule', lehrgang: '📚 Lehrgang' };
    
        const STATUS_FARBEN = {
          gruen:  '#22c55e',
          gelb:   '#eab308',
          orange: '#f97316',
          rot:    '#ef4444',
          blau:   '#3b82f6'
        };
        const STATUS_TOOLTIP = {
          gruen:  'Alles gestempelt',
          gelb:   'Mittag fehlt',
          orange: 'Kommen oder Feierabend fehlt',
          rot:    'Nicht gestempelt',
          blau:   'Abwesenheit (Urlaub/Krank/Lehrgang)'
        };
    
        const zeitZuMin = s => {
          if (!s) return null;
          let hh, mm;
          if (s.length > 5) { const d = new Date(s); hh = d.getHours(); mm = d.getMinutes(); }
          else { [hh, mm] = s.substring(0, 5).split(':').map(Number); }
          return hh * 60 + mm;
        };
        const minZuHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    
        const stempelZeitHtml = (zeitStr, sollZeitStr) => {
          if (!zeitStr) return '<span style="color:#bbb;">—</span>';
          const istMin = zeitZuMin(zeitStr);
          const label = minZuHHMM(istMin);
          if (!sollZeitStr) return `<span>${label}</span>`;
          const sollMin = zeitZuMin(sollZeitStr);
          const diff = istMin - sollMin;
          const ok = Math.abs(diff) <= 10;
          const color = ok ? '#1a7f37' : '#cf222e';
          const sign = diff > 0 ? '+' : '';
          const hint = diff !== 0 ? ` <span style="font-size:10px;">(${sign}${diff}′)</span>` : '';
          return `<span style="color:${color};font-weight:600;">${label}</span>${hint}`;
        };
    
        if (!daten || daten.length === 0) {
          container.innerHTML = '<p style="color:#aaa;font-size:13px;">Keine Daten im gewählten Zeitraum.</p>';
          return;
        }
    
        const rows = daten.map((p, idx) => {
          const g = p.gesamt;
          const saldo = g.saldo_min;
          const balkenBreite = g.soll_min > 0 ? Math.min(100, Math.round((g.ist_min / g.soll_min) * 100)) : 0;
          const balkenFarbe = saldo >= 0 ? '#1a7f37' : '#cf222e';
    
          const tageHtml = p.tage.map(t => {
            const d = new Date(t.datum + 'T00:00:00');
            const wt = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
            const dStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            const abwHtml = t.abwesenheit ? `<span style="background:#fff3cd;color:#856404;border-radius:4px;padding:1px 5px;font-size:11px;">${abwLabel[t.abwesenheit] || t.abwesenheit}</span>` : '';
            const nichtGestempelt = t.soll_min > 0 && t.ist_min === 0 && !t.abwesenheit;
            const tagSaldo = t.ist_min - t.soll_min;
            const kommenHtml = t.abwesenheit ? '<span style="color:#bbb;">—</span>' : stempelZeitHtml(t.kommen_zeit, t.soll_start);
            const gehenHtml = t.abwesenheit ? '<span style="color:#bbb;">—</span>' : stempelZeitHtml(t.gehen_zeit, t.soll_ende);
    
            // Unterbrechungen
            const ubs = t.unterbrechungen || [];
            let ubHtml = '';
            if (ubs.length > 0) {
              const ubDetails = ubs.map(u => {
                const startStr = u.start ? minZuHHMM(zeitZuMin(u.start)) : '?';
                const endeStr = u.ende ? minZuHHMM(zeitZuMin(u.ende)) : '?';
                const typLabel = u.typ === 'termin_pause' ? ' 🔧Auftrag' : '';
                return `${startStr}–${endeStr} (${u.dauer_min}′)${typLabel}`;
              }).join(', ');
              ubHtml = `<span style="color:#e57c00;font-size:11px;margin-left:4px;" title="${ubDetails}">⏸ ${ubs.length}× ${minToStr(t.ub_gesamt_min)}</span>`;
            }
    
            const statusDotHtml = (t.status && t.status !== 'kein_punkt' && STATUS_FARBEN[t.status])
              ? `<span class="status-dot" data-datum="${t.datum}" data-pidx="${idx}" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${STATUS_FARBEN[t.status]};cursor:${(t.status === 'gelb' || t.status === 'orange' || t.status === 'rot') ? 'pointer' : 'default'};" title="${STATUS_TOOLTIP[t.status]}"></span>`
              : '';
    
            return `<tr style="font-size:12px;${nichtGestempelt ? 'opacity:0.6;' : ''}">
              <td style="padding:3px 4px;text-align:center;">${statusDotHtml}</td>
              <td style="padding:3px 8px;white-space:nowrap;color:#888;">${wt} ${dStr}</td>
              <td style="padding:3px 8px;text-align:right;">${kommenHtml}</td>
              <td style="padding:3px 8px;text-align:right;">${gehenHtml}</td>
              <td style="padding:3px 8px;text-align:right;">${minToStr(t.soll_min)}</td>
              <td style="padding:3px 8px;text-align:right;">${t.abwesenheit ? minToStr(t.soll_min) : minToStr(t.ist_min)}</td>
              <td style="padding:3px 8px;text-align:right;${saldoStyle(tagSaldo)}">${minToStr(tagSaldo)}</td>
              <td style="padding:3px 8px;">${abwHtml}${nichtGestempelt ? '<span style="color:#aaa;font-size:11px;">nicht gestempelt</span>' : ''}${ubHtml}</td>
            </tr>`;
          }).join('');
    
          return `
            <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden;">
              <div class="zeitkonto-row" data-idx="${idx}" style="display:flex;align-items:center;padding:10px 14px;cursor:pointer;background:#fafafa;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:120px;">
                  <span style="font-weight:600;font-size:14px;">${p.name}</span>
                  <span style="font-size:11px;color:#888;margin-left:6px;">${p.typ === 'lehrling' ? 'Lehrling' : 'Mitarbeiter'}</span>
                </div>
                <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
                  <span style="font-size:12px;color:#666;">Soll: <b>${minToStr(g.soll_min)}</b></span>
                  <span style="font-size:12px;color:#666;">Ist: <b>${minToStr(g.ist_min)}</b></span>
                  <span style="font-size:13px;${saldoStyle(saldo)}">Saldo: ${saldo >= 0 ? '+' : ''}${minToStr(saldo)}</span>
                </div>
                <div style="width:80px;">
                  <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${balkenBreite}%;background:${balkenFarbe};border-radius:3px;transition:width 0.3s;"></div>
                  </div>
                </div>
                <span style="color:#aaa;font-size:12px;">▼</span>
              </div>
              <div id="zeitkonto-detail-${idx}" style="display:none;border-top:1px solid #f3f4f6;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead>
                    <tr style="font-size:11px;color:#888;background:#f9fafb;">
                      <th style="padding:4px 4px;text-align:center;width:22px;"></th>
                      <th style="padding:4px 8px;text-align:left;">Tag</th>
                      <th style="padding:4px 8px;text-align:right;">↑ Kommen</th>
                      <th style="padding:4px 8px;text-align:right;">↓ Gehen</th>
                      <th style="padding:4px 8px;text-align:right;">Soll</th>
                      <th style="padding:4px 8px;text-align:right;">Ist</th>
                      <th style="padding:4px 8px;text-align:right;">Saldo</th>
                      <th style="padding:4px 8px;"></th>
                    </tr>
                  </thead>
                  <tbody>${tageHtml}</tbody>
                </table>
              </div>
            </div>`;
        }).join('');
    
        container.innerHTML = rows;
    
        container.querySelectorAll('.zeitkonto-row').forEach(el => {
          el.addEventListener('click', () => {
            const detail = document.getElementById(`zeitkonto-detail-${el.dataset.idx}`);
            if (!detail) return;
            const arrow = el.querySelector('span:last-child');
            if (detail.style.display === 'none') {
              detail.style.display = 'block';
              if (arrow) arrow.textContent = '▲';
            } else {
              detail.style.display = 'none';
              if (arrow) arrow.textContent = '▼';
            }
          });
        });
    
        container.querySelectorAll('.status-dot').forEach(dot => {
          dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const datum = dot.dataset.datum;
            const pidx = Number(dot.dataset.pidx);
            const person = daten[pidx];
            if (!person || !datum) return;
            this.openNachstempelPanel(dot, person, datum);
          });
        });
      },

      openNachstempelPanel(dotEl, person, datum) {
        document.querySelectorAll('.nachstempel-panel').forEach(p => p.remove());
    
        const row = dotEl.closest('tr');
        if (!row) return;
    
        const tag = person.tage.find(t => t.datum === datum);
        if (!tag) return;
    
        const personId = person.id;
        const typ = person.typ; // 'mitarbeiter' | 'lehrling'
    
        const kommenDefault = (tag.soll_start || '07:00').substring(0, 5);
        const gehenDefault  = (tag.soll_ende  || '16:00').substring(0, 5);
        const kommenWert = tag.kommen_zeit ? tag.kommen_zeit.substring(0, 5) : kommenDefault;
        const gehenWert  = tag.gehen_zeit  ? tag.gehen_zeit.substring(0, 5)  : gehenDefault;
    
        // Mittag-Checkbox: angeklickt wenn Mittag NICHT fehlt (also schon vorhanden ODER nicht erforderlich)
        const mittagFehlt = !!(tag.fehlt && tag.fehlt.mittag);
        const mittagChecked = !mittagFehlt;
    
        // Anzahl der Spalten der Tagestabelle (mit Status-Punkt-Spalte = 8)
        const colspan = 8;
    
        const panel = document.createElement('tr');
        panel.className = 'nachstempel-panel';
        panel.innerHTML = `
          <td colspan="${colspan}" style="background:#fef9c3;padding:10px 14px;border-top:1px solid #fcd34d;">
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:end;font-size:12px;">
              <div><label style="display:block;color:#78350f;font-weight:600;margin-bottom:2px;">Kommen:</label>
                <input type="time" class="np-kommen" value="${kommenWert}" style="padding:4px 6px;font-size:13px;">
              </div>
              <div><label style="display:block;color:#78350f;font-weight:600;margin-bottom:2px;">Gehen:</label>
                <input type="time" class="np-gehen" value="${gehenWert}" style="padding:4px 6px;font-size:13px;">
              </div>
              <div style="align-self:center;">
                <label style="color:#78350f;font-weight:600;">
                  <input type="checkbox" class="np-mittag" ${mittagChecked ? 'checked' : ''} style="vertical-align:middle;"> Mittag gemacht
                </label>
              </div>
              <button class="np-speichern" style="padding:6px 14px;background:#22c55e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;">Speichern</button>
              <button class="np-abbrechen" style="padding:6px 14px;background:#e5e7eb;border:none;border-radius:4px;cursor:pointer;">Abbrechen</button>
            </div>
          </td>
        `;
        row.parentNode.insertBefore(panel, row.nextSibling);
    
        panel.querySelector('.np-abbrechen').addEventListener('click', () => panel.remove());
    
        panel.querySelector('.np-speichern').addEventListener('click', async () => {
          const kommen = panel.querySelector('.np-kommen').value;
          const gehen  = panel.querySelector('.np-gehen').value;
          const mittag = panel.querySelector('.np-mittag').checked;
          try {
            const body = {
              datum,
              antwort: 'anwesend',
              mittag_gemacht: mittag,
              kommen_zeit: kommen || null,
              gehen_zeit: gehen || null
            };
            body[typ === 'mitarbeiter' ? 'mitarbeiter_id' : 'lehrling_id'] = personId;
            await ApiService.post('/tagesstempel/nachstempel', body);
            panel.remove();
            if (typeof this.loadZeitkonto === 'function') this.loadZeitkonto();
          } catch (err) {
            console.error('[Nachstempel-Inline] Fehler:', err);
            alert('Speichern fehlgeschlagen: ' + (err.message || 'unbekannt'));
          }
        });
      },

      async loadKorrekturen() {
        const von = document.getElementById('korrekturenVon')?.value;
        const bis = document.getElementById('korrekturenBis')?.value;
        const container = document.getElementById('korrekturenContainer');
        if (!container) return;
        if (!von || !bis) {
          container.innerHTML = '<p style="color:#aaa;font-size:13px;">Zeitraum wählen und auf „Laden" klicken…</p>';
          return;
        }
        const nurProbleme = document.getElementById('korrekturenNurProbleme')?.checked ?? true;
        const filter = document.getElementById('korrekturenFilter')?.value || '';
        container.innerHTML = '<p class="loading-text" style="font-size:13px;">Lade Daten…</p>';
        try {
          // Zeitkonto-Daten als Basis laden (enthält tagesstempel + Status)
          const daten = await ApiService.get(`/zeitkonto?von=${von}&bis=${bis}`);
          if (!daten || daten.length === 0) {
            container.innerHTML = '<p style="color:#aaa;font-size:13px;">Keine Daten im gewählten Zeitraum.</p>';
            return;
          }
    
          const _z2m = z => {
            if (!z) return null;
            const s = z.substring(0, 5);
            const [h, m] = s.split(':').map(Number);
            return h * 60 + m;
          };
          const _m2hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    
          // Alle Tage mit Problem-Klassifizierung aufbauen
          const zeilen = [];
          for (const person of daten) {
            for (const tag of person.tage) {
              if (tag.soll_min === 0) continue; // Kein Arbeitstag (Wochenende ohne Soll)
              if (tag.abwesenheit) continue;    // Urlaub/Krank etc. – kein Stempel nötig
    
              const kommenMin = _z2m(tag.kommen_zeit);
              const gehenMin  = _z2m(tag.gehen_zeit);
              const sollStart = _z2m(tag.soll_start);
              const sollEnde  = _z2m(tag.soll_ende);
    
              const probleme = [];
              if (!tag.kommen_zeit) probleme.push({ typ: 'fehlt_kommen', label: 'Kommen fehlt', farbe: '#ef4444' });
              if (!tag.gehen_zeit && tag.kommen_zeit) probleme.push({ typ: 'fehlt_gehen', label: 'Gehen fehlt', farbe: '#f97316' });
              if (kommenMin !== null && sollStart !== null && Math.abs(kommenMin - sollStart) > 30) {
                const diff = kommenMin - sollStart;
                probleme.push({ typ: 'abweichung', label: `Kommen ${diff > 0 ? '+' : ''}${diff} min`, farbe: '#eab308' });
              }
              if (gehenMin !== null && sollEnde !== null && Math.abs(gehenMin - sollEnde) > 30) {
                const diff = gehenMin - sollEnde;
                probleme.push({ typ: 'abweichung', label: `Gehen ${diff > 0 ? '+' : ''}${diff} min`, farbe: '#eab308' });
              }
    
              if (nurProbleme && probleme.length === 0) continue;
              if (filter && !probleme.some(p => p.typ === filter)) continue;
    
              zeilen.push({ person, tag, probleme });
            }
          }
    
          if (zeilen.length === 0) {
            container.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;color:#aaa;font-size:14px;gap:8px;">
              <span style="font-size:32px;">✅</span>
              <span>Keine Probleme im gewählten Zeitraum gefunden.</span>
            </div>`;
            return;
          }
    
          const rows = zeilen.map(({ person, tag, probleme }) => {
            const d = new Date(tag.datum + 'T00:00:00');
            const wt = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
            const dStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    
            const kommenVal = tag.kommen_zeit ? tag.kommen_zeit.substring(0, 5) : '';
            const gehenVal  = tag.gehen_zeit  ? tag.gehen_zeit.substring(0, 5)  : '';
            const sollStartStr = tag.soll_start ? tag.soll_start.substring(0, 5) : '—';
            const sollEndeStr  = tag.soll_ende  ? tag.soll_ende.substring(0, 5)  : '—';
    
            const rowId = `korr-${person.id}-${person.typ}-${tag.datum}`;
            const midArg = person.typ === 'mitarbeiter' ? person.id : 'null';
            const lidArg = person.typ === 'lehrling'    ? person.id : 'null';
    
            const problemBadges = probleme.map(p =>
              `<span style="background:${p.farbe}18;color:${p.farbe};border:1px solid ${p.farbe}40;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;white-space:nowrap;">${p.label}</span>`
            ).join(' ');
    
            const inputStyle = 'width:54px;font-size:13px;border:1px solid #ccc;border-radius:3px;padding:2px 4px;text-align:center;font-family:monospace;';
    
            return `<tr id="${rowId}" style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:7px 10px;white-space:nowrap;font-size:12px;color:#888;">${wt} ${dStr}</td>
              <td style="padding:7px 10px;font-weight:600;font-size:13px;">${this._escapeHtml(person.name)}</td>
              <td style="padding:7px 10px;font-size:12px;color:#888;">${sollStartStr} – ${sollEndeStr}</td>
              <td style="padding:7px 10px;">
                <input type="text" value="${kommenVal}" placeholder="HH:MM" maxlength="5"
                  style="${inputStyle}${!kommenVal ? 'border-color:#ef4444;background:#fff5f5;' : ''}"
                  data-field="kommen" data-rowid="${rowId}"
                  onchange="window.app._korrekturZeitChange(this, ${midArg}, ${lidArg}, '${tag.datum}', 'kommen_zeit')">
              </td>
              <td style="padding:7px 10px;">
                <input type="text" value="${gehenVal}" placeholder="HH:MM" maxlength="5"
                  style="${inputStyle}${!gehenVal && kommenVal ? 'border-color:#f97316;background:#fff8f0;' : ''}"
                  data-field="gehen" data-rowid="${rowId}"
                  onchange="window.app._korrekturZeitChange(this, ${midArg}, ${lidArg}, '${tag.datum}', 'gehen_zeit')">
              </td>
              <td style="padding:7px 10px;">${problemBadges}</td>
              <td style="padding:7px 10px;">
                <button id="${rowId}-speichern" onclick="window.app._korrekturSpeichern('${rowId}', ${midArg}, ${lidArg}, '${tag.datum}')"
                  style="display:none;padding:3px 10px;background:#22c55e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">
                  ✓ Speichern
                </button>
              </td>
            </tr>`;
          }).join('');
    
          container.innerHTML = `
            <div style="font-size:12px;color:#666;margin-bottom:8px;">${zeilen.length} Eintr${zeilen.length === 1 ? 'ag' : 'äge'}${nurProbleme ? ' mit Problemen' : ''} gefunden</div>
            <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px;">
              <table style="width:100%;border-collapse:collapse;">
                <thead style="background:#f9fafb;">
                  <tr>
                    <th style="padding:7px 10px;text-align:left;font-size:11px;color:#666;white-space:nowrap;">Datum</th>
                    <th style="padding:7px 10px;text-align:left;font-size:11px;color:#666;">Person</th>
                    <th style="padding:7px 10px;text-align:left;font-size:11px;color:#666;white-space:nowrap;">Soll</th>
                    <th style="padding:7px 10px;text-align:left;font-size:11px;color:#666;">↑ Kommen</th>
                    <th style="padding:7px 10px;text-align:left;font-size:11px;color:#666;">↓ Gehen</th>
                    <th style="padding:7px 10px;text-align:left;font-size:11px;color:#666;">Problem</th>
                    <th style="padding:7px 10px;"></th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
    
          // Änderungen merken pro Zeile
          this._korrekturenPending = {};
    
        } catch (err) {
          container.innerHTML = `<p style="color:#e55;font-size:13px;">Fehler: ${err.message}</p>`;
        }
      },

      _korrekturZeitChange(inputEl, mitarbeiterId, lehrlingId, datum, feld) {
        const rowId = inputEl.dataset.rowid;
        if (!this._korrekturenPending) this._korrekturenPending = {};
        if (!this._korrekturenPending[rowId]) this._korrekturenPending[rowId] = {};
        this._korrekturenPending[rowId][feld] = inputEl.value || null;
        // Speichern-Button einblenden
        const btn = document.getElementById(`${rowId}-speichern`);
        if (btn) btn.style.display = 'inline-block';
        // Input-Stil aktualisieren
        inputEl.style.borderColor = '#3b82f6';
        inputEl.style.background = '#eff6ff';
      },

      async _korrekturSpeichern(rowId, mitarbeiterId, lehrlingId, datum) {
        const btn = document.getElementById(`${rowId}-speichern`);
        const aenderungen = this._korrekturenPending?.[rowId] || {};
        if (Object.keys(aenderungen).length === 0) return;
    
        if (btn) { btn.textContent = '…'; btn.disabled = true; }
    
        try {
          const body = { datum };
          if (mitarbeiterId) body.mitarbeiter_id = mitarbeiterId;
          if (lehrlingId)    body.lehrling_id    = lehrlingId;
          if ('kommen_zeit' in aenderungen) body.kommen_zeit = aenderungen.kommen_zeit;
          if ('gehen_zeit'  in aenderungen) body.gehen_zeit  = aenderungen.gehen_zeit;
    
          await ApiService.patch('/tagesstempel/zeiten', body);
    
          // Row visuell als gespeichert markieren
          const row = document.getElementById(rowId);
          if (row) {
            row.style.background = '#f0fdf4';
            row.querySelectorAll('input[type="text"]').forEach(inp => {
              inp.style.borderColor = '#22c55e';
              inp.style.background = '#f0fdf4';
            });
          }
          if (btn) { btn.textContent = '✓ Gespeichert'; btn.style.background = '#86efac'; btn.style.color = '#166534'; }
          delete this._korrekturenPending[rowId];
    
        } catch (err) {
          if (btn) { btn.textContent = '✓ Speichern'; btn.disabled = false; }
          this.showToast('Fehler beim Speichern: ' + (err.message || 'unbekannt'), 'error');
        }
      },

      async loadPausenReport() {
        const von = document.getElementById('pausenReportVon')?.value;
        const bis = document.getElementById('pausenReportBis')?.value;
        const container = document.getElementById('pausenReportContainer');
        if (!container) return;
        if (!von || !bis) {
          container.innerHTML = '<p style="color:#aaa;font-size:13px;">Zeitraum wählen…</p>';
          return;
        }
        container.innerHTML = '<p class="loading-text" style="font-size:13px;">Lade Pausen-Report…</p>';
        try {
          const res = await ApiService.get(`/reports/pausen?von=${von}&bis=${bis}`);
          const eintraege = res?.eintraege || [];
          this._pausenReportData = { von, bis, eintraege };
          this.renderPausenReport(eintraege);
        } catch (err) {
          container.innerHTML = `<p style="color:#e55;font-size:13px;">Fehler: ${err.message}</p>`;
        }
      },

      renderPausenReport(eintraege) {
        const container = document.getElementById('pausenReportContainer');
        if (!container) return;
        if (!eintraege || eintraege.length === 0) {
          container.innerHTML = '<p style="color:#aaa;font-size:13px;">Keine Pausen im gewählten Zeitraum.</p>';
          return;
        }
        const fmtDatum = d => {
          const dt = new Date(d + 'T00:00:00');
          return dt.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
        };
        const minToStr = m => {
          if (!m) return '0:00';
          return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
        };
    
        const rows = eintraege.map((e, idx) => {
          const mpListe = (e.mittagspausen || []).map(p => {
            const ref = p.aktueller_termin_nr ? ` <span style="color:#888;">(${p.aktueller_termin_nr}${p.aktueller_kennzeichen ? ' / ' + p.aktueller_kennzeichen : ''})</span>` : '';
            const status = p.abgeschlossen ? '' : ' <span style="color:#b48a00;">[läuft]</span>';
            return `<div style="font-size:11.5px;color:#555;">☕ ${p.start || '?'}–${p.ende || '?'} <b>${p.dauer_min} min</b>${ref}${status}</div>`;
          }).join('');
          const ubListe = (e.unterbrechungen || []).map(u => {
            const ref = u.termin_nr ? ` <span style="color:#888;">(${u.termin_nr}${u.kennzeichen ? ' / ' + u.kennzeichen : ''})</span>` : '';
            const grund = u.grund ? ` – ${this.escapeHtml(u.grund)}` : '';
            const status = u.ende ? '' : ' <span style="color:#b48a00;">[läuft]</span>';
            return `<div style="font-size:11.5px;color:#555;">⏸ ${u.start || '?'}–${u.ende || '?'} <b>${u.dauer_min} min</b>${grund}${ref}${status}</div>`;
          }).join('');
    
          return `
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:6px 8px;white-space:nowrap;font-size:12px;color:#666;">${fmtDatum(e.datum)}</td>
              <td style="padding:6px 8px;font-size:13px;font-weight:600;">${this.escapeHtml(e.person_name || '')} <span style="font-size:11px;color:#999;font-weight:normal;">${e.person_typ === 'lehrling' ? 'L' : 'M'}</span></td>
              <td style="padding:6px 8px;text-align:right;font-size:13px;color:#444;">${minToStr(e.mittagspause_min)}</td>
              <td style="padding:6px 8px;text-align:right;font-size:13px;color:#444;">${minToStr(e.unterbrechung_min)}</td>
              <td style="padding:6px 8px;text-align:right;font-size:13px;font-weight:600;">${minToStr(e.gesamt_min)}</td>
              <td style="padding:6px 8px;">${mpListe}${ubListe}</td>
            </tr>`;
        }).join('');
    
        // Summen
        const sumMp = eintraege.reduce((s, e) => s + (e.mittagspause_min || 0), 0);
        const sumUb = eintraege.reduce((s, e) => s + (e.unterbrechung_min || 0), 0);
        const sumG = sumMp + sumUb;
    
        container.innerHTML = `
          <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead style="background:#f9fafb;">
                <tr>
                  <th style="padding:8px;text-align:left;font-size:11px;color:#666;">Datum</th>
                  <th style="padding:8px;text-align:left;font-size:11px;color:#666;">Person</th>
                  <th style="padding:8px;text-align:right;font-size:11px;color:#666;">☕ Mittag</th>
                  <th style="padding:8px;text-align:right;font-size:11px;color:#666;">⏸ Unterbr.</th>
                  <th style="padding:8px;text-align:right;font-size:11px;color:#666;">Σ Gesamt</th>
                  <th style="padding:8px;text-align:left;font-size:11px;color:#666;">Details</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr style="background:#f3f4f6;font-weight:600;">
                  <td colspan="2" style="padding:8px;font-size:12px;">Summe (${eintraege.length} Einträge)</td>
                  <td style="padding:8px;text-align:right;font-size:12px;">${minToStr(sumMp)}</td>
                  <td style="padding:8px;text-align:right;font-size:12px;">${minToStr(sumUb)}</td>
                  <td style="padding:8px;text-align:right;font-size:12px;">${minToStr(sumG)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>`;
      },

      exportPausenReportCsv() {
        const data = this._pausenReportData;
        if (!data || !data.eintraege || data.eintraege.length === 0) {
          alert('Keine Daten zum Exportieren. Bitte zuerst Report laden.');
          return;
        }
        const csvEscape = v => {
          if (v == null) return '';
          const s = String(v);
          if (s.includes(';') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        };
        const lines = [];
        lines.push(['Datum', 'Person', 'Typ', 'Mittagspause_min', 'Unterbrechung_min', 'Gesamt_min', 'Details'].join(';'));
        for (const e of data.eintraege) {
          const details = [];
          (e.mittagspausen || []).forEach(p => {
            details.push(`Mittag ${p.start || '?'}-${p.ende || '?'} ${p.dauer_min}min` + (p.aktueller_termin_nr ? ` (Termin ${p.aktueller_termin_nr})` : ''));
          });
          (e.unterbrechungen || []).forEach(u => {
            details.push(`Unterbr ${u.start || '?'}-${u.ende || '?'} ${u.dauer_min}min` + (u.grund ? ` [${u.grund}]` : '') + (u.termin_nr ? ` (Termin ${u.termin_nr})` : ''));
          });
          lines.push([
            e.datum,
            e.person_name || '',
            e.person_typ === 'lehrling' ? 'Lehrling' : 'Mitarbeiter',
            e.mittagspause_min || 0,
            e.unterbrechung_min || 0,
            e.gesamt_min || 0,
            details.join(' | ')
          ].map(csvEscape).join(';'));
        }
        const csv = '\uFEFF' + lines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pausen-report_${data.von}_${data.bis}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },

      async loadZeitstempelung() {
        const container = document.getElementById('zeitstempelungContainer');
        const datumInput = document.getElementById('zeitstempelungDatum');
        if (!container || !datumInput) return;
    
        const datum = datumInput.value || this.formatDateLocal(this.getToday());
        const istHeute = datum === this.formatDateLocal(this.getToday());
        container.innerHTML = '<p class="loading-text">Lade Stempelzeiten…</p>';
    
        try {
          const [gruppen, tagesstempelRaw, mitarbeiterListe, lehrlingsListe] = await Promise.all([
            ApiService.get(`/stempelzeiten?datum=${datum}`).catch(() => []),
            ApiService.get(`/tagesstempel?datum=${datum}`).catch(() => null),
            ApiService.get('/mitarbeiter').catch(() => []),
            ApiService.get('/lehrlinge').catch(() => [])
          ]);
    
          // Maps aufbauen: key = "m_<id>" oder "l_<id>"
          const tagesstempelMap = {};
          const unterbrechungenMap = {};
          const pausenMap = {};
          const mittagspauseMap = {};  // geplante Mittagspause je Person
          const { stempel: tsStempel = [], unterbrechungen: tsUnterbrechungen = [], pausen: tsPausen = [] } = tagesstempelRaw || {};
          tsStempel.forEach(s => {
            const key = s.mitarbeiter_id ? `m_${s.mitarbeiter_id}` : `l_${s.lehrling_id}`;
            tagesstempelMap[key] = s;
          });
          tsUnterbrechungen.forEach(u => {
            const key = u.mitarbeiter_id ? `m_${u.mitarbeiter_id}` : `l_${u.lehrling_id}`;
            if (!unterbrechungenMap[key]) unterbrechungenMap[key] = [];
            unterbrechungenMap[key].push(u);
          });
          tsPausen.forEach(p => {
            const key = p.mitarbeiter_id ? `m_${p.mitarbeiter_id}` : `l_${p.lehrling_id}`;
            if (!pausenMap[key]) pausenMap[key] = [];
            pausenMap[key].push(p);
          });
    
          // Alle bekannten Keys aus Terminen + Tagesstempeln
          const gruppenMap = new Map();
          (gruppen || []).forEach(g => {
            const key = g.person_typ === 'lehrling' ? `l_${g.person_id}` : `m_${g.person_id}`;
            gruppenMap.set(key, g);
          });
    
          // Aktive Mitarbeiter und Lehrlinge die noch nicht in der Liste sind → leere Gruppe
          const mListe = Array.isArray(mitarbeiterListe) ? mitarbeiterListe : (mitarbeiterListe?.mitarbeiter || []);
          const lListe = Array.isArray(lehrlingsListe) ? lehrlingsListe : (lehrlingsListe?.lehrlinge || []);
          mListe.filter(m => m.aktiv !== 0 && m.aktiv !== false).forEach(m => {
            const key = `m_${m.id}`;
            mittagspauseMap[key] = m.mittagspause_start || null;
            if (!gruppenMap.has(key)) gruppenMap.set(key, { key, person_typ: 'mitarbeiter', person_id: m.id, person_name: m.name, arbeiten: [] });
          });
          lListe.filter(l => l.aktiv !== 0 && l.aktiv !== false).forEach(l => {
            const key = `l_${l.id}`;
            mittagspauseMap[key] = l.mittagspause_start || null;
            if (!gruppenMap.has(key)) gruppenMap.set(key, { key, person_typ: 'lehrling', person_id: l.id, person_name: l.name, arbeiten: [] });
          });
    
          const alleGruppen = [...gruppenMap.values()];
    
          if (alleGruppen.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Keine aktiven Mitarbeiter gefunden.</p></div>';
            return;
          }
    
          container.innerHTML = alleGruppen.map(g => {
            const key = g.person_typ === 'lehrling' ? `l_${g.person_id}` : `m_${g.person_id}`;
            return this.renderZeitstempelungGruppe(
              g,
              tagesstempelMap[key] || null,
              unterbrechungenMap[key] || [],
              istHeute,
              pausenMap[key] || [],
              mittagspauseMap[key] || null
            );
          }).join('');
    
          // Warn-Banner: noch aktiv gestempelte Personen (nur wenn Datum = heute)
          if (istHeute) {
            const offenePersonen = alleGruppen.filter(g => {
              const key = g.person_typ === 'lehrling' ? `l_${g.person_id}` : `m_${g.person_id}`;
              const ts = tagesstempelMap[key];
              return ts && ts.kommen_zeit && !ts.gehen_zeit;
            }).map(g => g.person_name);
            if (offenePersonen.length > 0) {
              const banner = `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;">
                <span style="font-size:18px;">⚠️</span>
                <div>
                  <strong style="color:#856404;">Noch aktiv gestempelt:</strong>
                  <span style="color:#856404;margin-left:6px;">${offenePersonen.join(', ')}</span>
                  <span style="color:#a07010;font-size:12px;margin-left:8px;">— Automatische Abstempelung um 18:30 Uhr</span>
                </div>
              </div>`;
              container.innerHTML = banner + container.innerHTML;
            }
          }
        } catch (err) {
          console.error('[Zeitstempelung] Ladefehler:', err);
          container.innerHTML = '<div class="error-state"><p>Fehler beim Laden der Stempelzeiten.</p></div>';
        }
      },

      renderZeitstempelungGruppe(gruppe, tagesstempel = null, unterbrechungen = [], istHeute = false, pausen = [], mittagspauseGeplant = null) {
        const gesamtRichtzeit = gruppe.arbeiten.reduce((s, a) => s + (a.richtwert_min || a.geschaetzte_min || 0), 0);
        const gesamtIst = gruppe.arbeiten.reduce((s, a) => s + (a.ist_min || 0), 0);
        const icon = gruppe.person_typ === 'lehrling' ? '🎓' : '👷';
        const mid = gruppe.person_typ === 'lehrling' ? null : gruppe.person_id;
        const lid = gruppe.person_typ === 'lehrling' ? gruppe.person_id : null;
        const midArg = mid !== null ? mid : 'null';
        const lidArg = lid !== null ? lid : 'null';
    
        // Mehrere Einträge ohne eigene Stempelzeit für denselben Termin → eine Zeile
        const _groupedArbeiten = [];
        const _seenTermin = new Map();
        gruppe.arbeiten.forEach(a => {
          const noStempel = !a.stempel_start && !a.stempel_ende;
          if (noStempel && _seenTermin.has(a.termin_id)) {
            const m = _groupedArbeiten[_seenTermin.get(a.termin_id)];
            m.arbeit = m.arbeit + '\n' + a.arbeit;
            m.richtwert_min = (m.richtwert_min || 0) + (a.richtwert_min || 0);
            m.geschaetzte_min = (m.geschaetzte_min || 0) + (a.geschaetzte_min || 0);
            if (a.ist_min !== null) m.ist_min = (m.ist_min || 0) + a.ist_min;
            if (!m.stempel_start_anzeige && a.stempel_start_anzeige) m.stempel_start_anzeige = a.stempel_start_anzeige;
            if (!m.stempel_ende_anzeige && a.stempel_ende_anzeige) m.stempel_ende_anzeige = a.stempel_ende_anzeige;
            m.stempel_ist_fallback = m.stempel_ist_fallback || a.stempel_ist_fallback;
          } else {
            _seenTermin.set(a.termin_id, _groupedArbeiten.length);
            _groupedArbeiten.push({ ...a });
          }
        });

        const rows = _groupedArbeiten.map(a => {
          const vortagsMin = a.vortags_min || 0;
          const istMinHeute = a.ist_min;
          const istMin = istMinHeute !== null ? istMinHeute + vortagsMin : (vortagsMin > 0 ? vortagsMin : null);
          const richtwertMin = a.richtwert_min || a.geschaetzte_min || 0;
          const ueberschritten = istMin !== null && richtwertMin > 0 && istMin > richtwertMin * 1.1;
          const istLaufend = (a.stempel_start && !a.stempel_ende) || (!a.stempel_start && a.termin_status === 'in_arbeit');
          const istText = istLaufend
            ? `<span class="badge badge-info">laufend…</span>${vortagsMin > 0 ? ` <span class="text-muted" style="font-size:11px;">(+${vortagsMin} Min Vortag)</span>` : ''}`
            : istMin !== null
              ? `<span class="${ueberschritten ? 'text-warning' : 'text-success'}">${istMin} Min${ueberschritten ? ' ⚠️' : ''}</span>${vortagsMin > 0 ? ` <span class="text-muted" style="font-size:11px;">(davon ${vortagsMin} Vortag)</span>` : ''}`
              : '<span class="text-muted">—</span>';
    
          // Pause-Badge: zeigt Pausen die in dieser Arbeit (Stempel-Bereich) liegen
          const pauseDetails = Array.isArray(a.pause_details) ? a.pause_details : [];
          const pauseAbzug = a.pause_abzug_min || 0;
          const istBrutto = a.ist_brutto_min;
          let pauseBadge = '';
          let pauseTooltipHtml = '';
          const pausiertAktiv = pauseDetails.some(d => d.aktiv);
          if (pauseDetails.length > 0) {
            const tooltipLines = pauseDetails.map(d => {
              const ico = d.typ === 'mittagspause' ? '☕' : d.typ === 'termin_pause' ? '🔧' : '⏸';
              const typLabel = d.typ === 'mittagspause' ? 'Mittagspause' : d.typ === 'termin_pause' ? 'Auftragsunterbrechung' : 'Unterbrechung';
              const grundTxt = d.grund ? ` – ${this.escapeHtml(d.grund)}` : '';
              const aktivTxt = d.aktiv ? ' (läuft…)' : '';
              return `${ico} ${d.start}–${d.ende} ${typLabel}${grundTxt}: −${d.abzug_min} min${aktivTxt}`;
            }).join('\n');
            const bruttoTxt = (istBrutto != null && pauseAbzug > 0)
              ? `\nBrutto ${istBrutto} min − Pause ${pauseAbzug} min = Netto ${istMin} min`
              : '';
            const tooltipText = (tooltipLines + bruttoTxt).replace(/"/g, '&quot;');
            const hatTerminPause = pauseDetails.some(d => d.typ === 'termin_pause');
            const badgeColor = pausiertAktiv ? '#ffc107' : hatTerminPause ? '#fd7e14' : '#6c757d';
            const badgeBg = pausiertAktiv ? '#fff3cd' : hatTerminPause ? '#fff3e0' : '#f1f3f5';
            const badgeLabel = pausiertAktiv ? '⏸ pausiert' : hatTerminPause ? '🔧 −' + pauseAbzug + ' min' : '☕ −' + pauseAbzug + ' min';
            pauseBadge = ` <span title="${tooltipText}" style="display:inline-block;margin-left:4px;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeColor};border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;cursor:help;">${badgeLabel}</span>`;
          }
    
          // Stempelzeiten-Tab im Web ist reine Anzeige — Stempeln läuft über die Tablet-App.
          const planStartCell = a.plan_start
            ? `<span style="color:#6c757d;">${a.plan_start}</span>`
            : '<span class="text-muted">—</span>';
          const planEndeCell = a.plan_ende
            ? `<span style="color:#6c757d;">${a.plan_ende}</span>`
            : '<span class="text-muted">—</span>';
          const displayStart = a.stempel_start || a.stempel_start_anzeige;
          const displayEnde = a.stempel_ende || a.stempel_ende_anzeige;
          const fallbackTitle = a.stempel_ist_fallback ? ' title="Aus Termin-Start und Fertigstellung abgeleitet"' : '';
          const fallbackMarker = a.stempel_ist_fallback ? ' <span style="font-size:10px;color:#6c757d;">*</span>' : '';
          let startCell = displayStart
            ? `<span style="color:var(--success,#28a745);font-weight:600;">▶ ${a.stempel_start}</span>`
            : '<span class="text-muted">—</span>';
          let endeCell = displayEnde
            ? `<span style="color:var(--danger,#dc3545);font-weight:600;">■ ${a.stempel_ende}</span>`
            : '<span class="text-muted">—</span>';
    
          if (displayStart) {
            startCell = `<span${fallbackTitle} style="color:var(--success,#28a745);font-weight:600;">▶ ${displayStart}${fallbackMarker}</span>`;
          }
          if (displayEnde) {
            endeCell = `<span${fallbackTitle} style="color:var(--danger,#dc3545);font-weight:600;">■ ${displayEnde}${fallbackMarker}</span>`;
          }

          const rowStyle = pausiertAktiv ? ' style="background:#fffbe6;"' : (a.status === 'unterbrochen' ? ' style="background:#fff3e0;"' : '');
          // Tagesübergreifend laufender Termin (z.B. gestern gestartet)?
          const _heuteIso = new Date().toISOString().slice(0,10);
          let terminNrZelle = this.escapeHtml(a.termin_nr || '');
          // Unterbrochener Termin (Teil 1 nach Split) – Badge anzeigen
          if (a.status === 'unterbrochen') {
            terminNrZelle += ` <span title="Auftrag unterbrochen – Teil 2 wartet in der Planung" style="display:inline-block;margin-left:4px;background:#fff3e0;color:#e65100;border:1px solid #ffb74d;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;">⏸ Teil 1</span>`;
          }
          // Variante 1: Termin selbst hat ein anderes Datum als heute (echte tagesübergreifende Termine)
          // Variante 2: Folgetermin (parent_datum gesetzt) – ursprünglicher Beginn am Vortag
          const seitDatum = a.parent_datum || (a.termin_datum && a.termin_datum !== _heuteIso ? a.termin_datum : null);
          const seitZeit = a.parent_startzeit || null;
          if (seitDatum) {
            const d = new Date(seitDatum);
            const dStr = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.`;
            const titleTxt = `Auftrag l\u00e4uft seit ${dStr}${seitZeit ? ' ' + seitZeit : ''}` + (a.vortags_min ? ` (+${a.vortags_min} Min am Vortag gearbeitet)` : '');
            terminNrZelle += ` <span title="${titleTxt}" style="display:inline-block;margin-left:4px;background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;">⏳ seit ${dStr}${seitZeit ? ' ' + seitZeit : ''}</span>`;
          }
          // Task 9: Zeitkorrektur-Button für unterbrochene Teil-1-Termine
          const korrekturBtn = a.termin_status === 'unterbrochen'
            ? ` <button onclick="window.app.zeitkorrekturPauseSplit(${a.termin_id}, ${a.ist_min || 0})"
                        title="Gearbeitete Zeit korrigieren"
                        style="border:none;background:none;cursor:pointer;color:#888;font-size:11px;padding:0 2px;margin-left:3px;">✏️</button>`
            : '';
    
          const hauptZeile = `
            <tr${rowStyle}>
              <td>${terminNrZelle}</td>
              <td>${this.escapeHtml(a.interne_auftragsnummer || '')}</td>
              <td>${this.escapeHtml(a.kunde_name || '')}</td>
              <td>${this.escapeHtml(a.kennzeichen || '')}</td>
              <td>${this.escapeHtml(a.arbeit)}</td>
              <td>${planStartCell}</td>
              <td>${planEndeCell}</td>
              <td class="text-success">${startCell}</td>
              <td class="text-danger">${endeCell}</td>
              <td class="text-warning">${richtwertMin ? richtwertMin + ' Min' : '—'}</td>
              <td>${istText}${pauseBadge}${korrekturBtn}</td>
            </tr>
          `;
    
          // Task 8: Split-Partner als eingerückte Folgezeile
          let partnerZeile = '';
          if (a.split_partner) {
            const sp = a.split_partner;
            const spDatumStr = sp.datum ? (() => {
              const d = new Date(sp.datum);
              return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
            })() : null;
            const spDatumBadge = spDatumStr
              ? `<span style="background:#e8f5e9;color:#388e3c;border:1px solid #a5d6a7;border-radius:10px;padding:1px 7px;font-size:11px;">📅 ${spDatumStr}</span>`
              : `<span style="background:#fce4ec;color:#c62828;border:1px solid #ef9a9a;border-radius:10px;padding:1px 7px;font-size:11px;">📅 noch offen</span>`;
            partnerZeile = `
              <tr style="background:#fff8f0;border-left:3px solid #ff9800;">
                <td style="padding-left:20px;color:#888;font-size:12px;">${this.escapeHtml(sp.termin_nr || '')} ✂️</td>
                <td></td>
                <td></td>
                <td></td>
                <td style="color:#888;font-size:12px;">${this.escapeHtml(sp.arbeit || '')} ${spDatumBadge}</td>
                <td><span class="text-muted">—</span></td>
                <td><span class="text-muted">—</span></td>
                <td><span class="text-muted">—</span></td>
                <td><span class="text-muted">—</span></td>
                <td style="color:#e65100;">
                  ${sp.geschaetzte_zeit ? sp.geschaetzte_zeit + ' Min' : '—'}
                  <button onclick="window.app.unterbrocheneRichtzeitAnpassen(${sp.id}, ${sp.geschaetzte_zeit || 30})"
                          title="Richtzeit anpassen"
                          style="border:none;background:none;cursor:pointer;color:#888;font-size:11px;padding:0 2px;margin-left:2px;">✏️</button>
                </td>
                <td><span class="text-muted">—</span></td>
              </tr>
            `;
          }
    
          return hauptZeile + partnerZeile;
        }).join('');
    
        // Tagesstempel-Info: editierbare Zeitfelder (24h), immer sichtbar
        const _z2m = z => { if (!z) return 0; const [h, m] = z.substring(0, 5).split(':').map(Number); return h * 60 + m; };
        const _m2s = m => (m < 0 ? 0 : m) + 'min';
        // ISO-Timestamp → lokale HH:MM (Zeitzone korrekt berücksichtigt)
        const isoToLocal = s => {
          if (!s) return '';
          if (s.length <= 5) return s.substring(0, 5);
          const d = new Date(s);
          return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        };
        const kommenVal = tagesstempel && tagesstempel.kommen_zeit ? tagesstempel.kommen_zeit.substring(0,5) : '';
        const gehenVal  = tagesstempel && tagesstempel.gehen_zeit  ? tagesstempel.gehen_zeit.substring(0,5)  : '';
    
        // Abgeschlossene Unterbrechungen (mit Start + Ende) → werden abgezogen
        const abgeschlosseneUb = (unterbrechungen || []).filter(u => u.start_zeit && u.ende_zeit);
        const ubMinGesamt = abgeschlosseneUb.reduce((sum, u) => sum + (_z2m(u.ende_zeit) - _z2m(u.start_zeit)), 0);
    
        // Abgeschlossene Mittagspausen aus pause_tracking → werden ebenfalls abgezogen
        const abgeschlossenePausen = (pausen || []).filter(p => p.pause_start_zeit && p.pause_ende_zeit);
        const pauseMinGesamt = abgeschlossenePausen.reduce((sum, p) => {
          const start = isoToLocal(p.pause_start_zeit);
          const ende  = isoToLocal(p.pause_ende_zeit);
          return sum + (_z2m(ende) - _z2m(start));
        }, 0);
    
        // Netto berechnen (Arbeitsunterbrechungen + Mittagspausen abgezogen)
        let nettoHtml = '<span style="color:#aaa;font-size:13px;">⏱ —</span>';
        if (kommenVal && gehenVal) {
          const nettoMin = _z2m(gehenVal) - _z2m(kommenVal) - ubMinGesamt - pauseMinGesamt;
          if (nettoMin > 0) {
            const h = Math.floor(nettoMin / 60), m = nettoMin % 60;
            nettoHtml = `<span style="color:#555;font-size:13px;">⏱ ${h > 0 ? h + 'h ' : ''}${m}min</span>`;
          }
        }
    
        // Mittagspausen aus pause_tracking – gestempelte als Text, fehlende als Eingabe zum Nachtragen
        const raw = s => isoToLocal(s);
        const inputStylePause = 'width:44px;font-size:12px;border:none;background:transparent;outline:none;font-family:monospace;text-align:center;';
        const pausenZeilen = (() => {
          const liste = pausen && pausen.length > 0 ? pausen : [];
          const gestempeltePillen = liste.map((p, pi) => {
            const startVal = raw(p.pause_start_zeit);
            const endeVal  = raw(p.pause_ende_zeit);
            const dauer    = (startVal && endeVal) ? ` (${_m2s(_z2m(endeVal) - _z2m(startVal))})` : '';
            const laeuft   = p.id && !p.abgeschlossen;
            const pilleId  = `pause-pill-${p.id || ('new-' + pi)}`;
            const saveArgs = p.id
              ? `'${pilleId}', ${p.id}, null, null, null`
              : `'${pilleId}', null, ${midArg}, ${lidArg}, '${tagesstempel ? tagesstempel.datum : ''}'`;
            // Anzeigemodus: gestempelte Werte als lesbarer Text + Stift-Button zum Bearbeiten
            const anzeigeHtml = `
              <span data-view="1" style="font-family:monospace;font-size:12px;color:#555;">${startVal || '—'}</span>
              <span data-view="1" style="color:#856404;">–</span>
              <span data-view="1" style="font-family:monospace;font-size:12px;color:#555;">${endeVal || (laeuft ? '<span style="color:#ffc107">läuft…</span>' : '—')}</span>
              ${dauer ? `<span data-view="1" style="color:#997404;">${dauer}</span>` : ''}
              <button data-view="1" onclick="window.app.tagesstempelPauseBearbeiten('${pilleId}')" title="Bearbeiten" style="border:none;background:none;cursor:pointer;color:#aaa;font-size:11px;padding:0 1px;line-height:1;">✏️</button>`;
            // Bearbeitungsmodus (hidden, wird per JS eingeblendet)
            const editHtml = `
              <input data-edit="1" type="text" value="${startVal}" placeholder="HH:MM" maxlength="5" style="${inputStylePause}color:#555;display:none;">
              <span data-edit="1" style="color:#856404;display:none;">–</span>
              <input data-edit="1" type="text" value="${endeVal}" placeholder="HH:MM" maxlength="5" style="${inputStylePause}color:#555;display:none;">
              <button data-edit="1" onclick="window.app.tagesstempelPauseSave(${saveArgs})" title="Speichern" style="border:none;background:none;cursor:pointer;color:#198754;font-size:13px;padding:0 2px;line-height:1;display:none;">✓</button>`;
            return `<span id="${pilleId}" style="display:inline-flex;align-items:center;gap:2px;margin-left:8px;color:#856404;font-size:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:1px 6px;" title="Mittagspause (gestempelt)">
              🍽️${anzeigeHtml}${editHtml}
            </span>`;
          });
          // Pille zum Nachtragen (wenn noch keine Pause vorhanden)
          const pilleIdNeu = `pause-pill-new-${midArg}-${lidArg}`;
          const saveArgsNeu = `'${pilleIdNeu}', null, ${midArg}, ${lidArg}, '${tagesstempel ? tagesstempel.datum : ''}'`;
          const nachtragenPille = `<span id="${pilleIdNeu}" style="display:inline-flex;align-items:center;gap:2px;margin-left:8px;color:#aaa;font-size:12px;background:#fffdf0;border:1px dashed #ffc107;border-radius:4px;padding:1px 6px;" title="Mittagspause nachtragen">
            🍽️
            <input type="text" placeholder="HH:MM" maxlength="5" style="${inputStylePause}color:#555;">
            <span style="color:#ccc;">–</span>
            <input type="text" placeholder="HH:MM" maxlength="5" style="${inputStylePause}color:#555;">
            <button onclick="window.app.tagesstempelPauseSave(${saveArgsNeu})" title="Speichern" style="border:none;background:none;cursor:pointer;color:#198754;font-size:13px;padding:0 2px;line-height:1;">✓</button>
          </span>`;
          return gestempeltePillen.join('') + nachtragenPille;
        })();
    
        // Geplante Mittagspause – immer anzeigen (auch ohne Eintrag)
        const geplantHtml = `<span style="display:inline-flex;align-items:center;gap:3px;margin-left:8px;color:#6c757d;font-size:12px;background:#f8f9fa;border:1px solid #dee2e6;border-radius:4px;padding:1px 6px;" title="Geplante Mittagspause (aus Stammdaten)">
          📅 ${mittagspauseGeplant || '<span style=\'color:#bbb\'>—</span>'}
        </span>`;
    
        // Unterbrechungen: Anzeige der Zeiten + editierbare Inputs
        const ubZeilen = (unterbrechungen || []).map((u, i) => {
          const startVal = u.start_zeit ? u.start_zeit.substring(0,5) : '';
          const endeVal  = u.ende_zeit  ? u.ende_zeit.substring(0,5)  : '';
          const dauer    = (startVal && endeVal) ? ` (${_m2s(_z2m(endeVal) - _z2m(startVal))})` : '';
          return `<span style="display:inline-flex;align-items:center;gap:3px;margin-left:8px;color:#777;font-size:12px;background:#f8f8f8;border:1px solid #ddd;border-radius:4px;padding:1px 6px;">
            <span title="Arbeitsunterbrechung ${i+1}">⏸</span>
            <input type="text" value="${startVal}" placeholder="HH:MM" maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" style="width:44px;font-size:12px;border:none;background:transparent;outline:none;color:#555;font-family:monospace;text-align:center;"
              onchange="window.app.tagesstempelUnterbrechungUpdate(${u.id}, 'start_zeit', this.value)">
            <span>–</span>
            <input type="text" value="${endeVal}" placeholder="HH:MM" maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" style="width:44px;font-size:12px;border:none;background:transparent;outline:none;color:#555;font-family:monospace;text-align:center;"
              onchange="window.app.tagesstempelUnterbrechungUpdate(${u.id}, 'ende_zeit', this.value)">
            ${dauer ? `<span style="color:#999;">${dauer}</span>` : ''}
          </span>`;
        }).join('');
    
        const datumArg = `'${tagesstempel ? tagesstempel.datum : ''}'`;
        const timeInputStyle = 'width:52px;font-size:13px;border:1px solid #ccc;border-radius:3px;padding:1px 4px;text-align:center;font-family:monospace;';
        // Reset-Button: nur wenn Stempel existiert und noch kein Gehen gesetzt
        const resetBtn = (tagesstempel && tagesstempel.id && !tagesstempel.gehen_zeit)
          ? `<button onclick="window.app.tagesstempelReset(${tagesstempel.id})" title="Versehentlich gestarteten Stempel löschen" style="border:none;background:none;cursor:pointer;color:#dc3545;font-size:13px;padding:0 2px;margin-left:4px;" >🗑️</button>`
          : '';
        const _qi = q => q === 'stempel' ? '<span title="Live gestempelt" style="font-size:10px;">🟢</span>' : q === 'manuell' ? '<span title="Manuell korrigiert" style="font-size:10px;">✏️</span>' : q === 'auto' ? '<span title="Automatisch abgestempelt" style="font-size:10px;">🤖</span>' : '';
        // Pseudo-Gruppe "Alle Aufträge" (person_id=0) hat keinen echten Tagesstempel –
        // Eingabefelder dort würden ins Leere zeigen (Backend lehnt person_id=0 ab).
        const istEchtePerson = (gruppe.person_typ === 'mitarbeiter' || gruppe.person_typ === 'lehrling') && gruppe.person_id > 0;
        const stempelZeilenHtml = !istEchtePerson ? '' : `
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:13px;margin-top:4px;">
            <span style="color:#198754;font-weight:600;">▶</span>
            <input type="text" value="${kommenVal}" placeholder="HH:MM" maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" style="${timeInputStyle}"
              onchange="window.app.tagesstempelZeitUpdate(${midArg}, ${lidArg}, ${datumArg}, 'kommen_zeit', this.value)">
            ${tagesstempel ? _qi(tagesstempel.kommen_quelle) : ''}
            <span style="color:#dc3545;font-weight:600;">■</span>
            <input type="text" value="${gehenVal}" placeholder="HH:MM" maxlength="5" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" style="${timeInputStyle}"
              onchange="window.app.tagesstempelZeitUpdate(${midArg}, ${lidArg}, ${datumArg}, 'gehen_zeit', this.value)">
            ${tagesstempel ? _qi(tagesstempel.gehen_quelle) : ''}
            ${resetBtn}
            ${nettoHtml}
            ${ubZeilen}
            ${pausenZeilen}
            ${geplantHtml}
          </div>`;
    
        // Richtwert-Zeile (zweite Zeile)
        const richtwertZeile = `<div style="font-size:12px;color:#6c757d;margin-top:2px;">Richtzeit: ${gesamtRichtzeit} Min${gesamtIst ? ' · Gestempelt: ' + gesamtIst + ' Min' : ''}</div>`;
    
        const leereTabelle = gruppe.arbeiten.length === 0
          ? `<div style="padding:10px 16px;color:#6c757d;font-size:13px;font-style:italic;">Keine Aufträge für diesen Tag.</div>`
          : `<div class="card-body" style="padding:0;">
              <table class="table table-striped" style="margin:0;">
                <thead>
                  <tr>
                    <th>Auftrag</th>
                    <th>Locosoft-Nr.</th>
                    <th>Kunde</th>
                    <th>Kennzeichen</th>
                    <th>Arbeit</th>
                    <th class="text-muted">Plan Start</th>
                    <th class="text-muted">Plan Ende</th>
                    <th class="text-success">Stempel Start ▶</th>
                    <th class="text-danger">Stempel Ende ■</th>
                    <th class="text-warning">Richtzeit</th>
                    <th>Ist-Zeit</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
    
        return `
          <div class="card" style="margin-bottom: 16px;">
            <div class="card-header">
              <div><strong style="font-size:15px;">${icon} ${this.escapeHtml(gruppe.person_name)}</strong></div>
              ${stempelZeilenHtml}
              ${richtwertZeile}
            </div>
            ${leereTabelle}
          </div>
        `;
      },

      async tagesstempelZeitUpdate(mitarbeiter_id, lehrling_id, datum, feld, wert) {
        if (wert && !/^([01]\d|2[0-3]):[0-5]\d$/.test(wert)) {
          this.showToast('Bitte Zeit im Format HH:MM eingeben (z.B. 07:30)', 'warning');
          return;
        }
        if (!mitarbeiter_id && !lehrling_id) {
          this.showToast('Diese Zeile ist nicht einer Person zugeordnet.', 'warning');
          return;
        }
        if (!datum) {
          // kein Tagesstempel-Eintrag vorhanden → Datum aus aktuellem Input lesen
          const datumInput = document.getElementById('zeitstempelungDatum');
          datum = datumInput ? datumInput.value : this.formatDateLocal(this.getToday());
        }
        try {
          await ApiService.patch('/tagesstempel/zeiten', { mitarbeiter_id, lehrling_id, datum, [feld]: wert });
          this.loadZeitstempelung();
        } catch (err) {
          this.showToast('Fehler beim Speichern: ' + (err.message || 'Unbekannt'), 'error');
        }
      },

      async tagesstempelUnterbrechungUpdate(id, feld, wert) {
        try {
          await ApiService.patch(`/tagesstempel/unterbrechung/${id}`, { [feld]: wert });
          this.loadZeitstempelung();
        } catch (err) {
          this.showToast('Fehler beim Speichern: ' + (err.message || 'Unbekannt'), 'error');
        }
      },

      async tagesstempelReset(id) {
        if (!confirm('Stempel wirklich löschen? Dies entfernt den versehentlich gestarteten Arbeitsbeginn.')) return;
        try {
          await ApiService.delete(`/tagesstempel/${id}`);
          this.loadZeitstempelung();
        } catch (err) {
          this.showToast('Fehler: ' + (err.message || 'Unbekannt'), 'error');
        }
      },

      tagesstempelPauseBearbeiten(pilleId) {
        const pille = document.getElementById(pilleId);
        if (!pille) return;
        pille.querySelectorAll('[data-view]').forEach(el => el.style.display = 'none');
        pille.querySelectorAll('[data-edit]').forEach(el => el.style.display = '');
        pille.querySelector('[data-edit] input, input[data-edit]')?.focus();
        const inputs = pille.querySelectorAll('input[data-edit]');
        if (inputs[0]) inputs[0].focus();
      },

      async tagesstempelPauseSave(pilleId, id, mitarbeiter_id, lehrling_id, datum) {
        const pille = document.getElementById(pilleId);
        if (!pille) return;
        const inputs = pille.querySelectorAll('input[type="text"]');
        const start = inputs[0]?.value?.trim() || null;
        const ende  = inputs[1]?.value?.trim() || null;
        const re = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (start && !re.test(start)) { this.showToast('Startzeit: Bitte HH:MM eingeben', 'warning'); return; }
        if (ende  && !re.test(ende))  { this.showToast('Endzeit: Bitte HH:MM eingeben', 'warning'); return; }
        try {
          if (id) {
            await ApiService.patch(`/tagesstempel/pause/${id}`, { pause_start_zeit: start, pause_ende_zeit: ende });
          } else {
            if (!start && !ende) return;
            if (!datum) {
              const inp = document.getElementById('zeitstempelungDatum');
              datum = inp ? inp.value : this.formatDateLocal(this.getToday());
            }
            await ApiService.post('/tagesstempel/pause', { mitarbeiter_id, lehrling_id, datum, pause_start_zeit: start, pause_ende_zeit: ende });
          }
          this.loadZeitstempelung();
        } catch (err) {
          this.showToast('Fehler beim Speichern: ' + (err.message || 'Unbekannt'), 'error');
        }
      },

      async webTagesstempelKommen(mitarbeiter_id, lehrling_id) {
        try {
          await ApiService.post('/tagesstempel/kommen', { mitarbeiter_id, lehrling_id });
          this.showToast('▶ Arbeitsbeginn gestempelt', 'success');
          this.loadZeitstempelung();
        } catch (err) {
          this.showToast('Fehler: ' + (err.message || 'Unbekannt'), 'error');
        }
      },

      async webTagesstempelGehen(mitarbeiter_id, lehrling_id) {
        try {
          const result = await ApiService.post('/tagesstempel/gehen', { mitarbeiter_id, lehrling_id });
          if (result && result.bestaetigung_erforderlich) {
            const anzahl = (result.laufende_termine || []).length;
            const names = (result.laufende_termine || []).map(t => `${t.termin_nr || t.id}${t.arbeit ? ' ('+t.arbeit+')' : ''}`).join('\n  ');
            const ok = confirm(
              `Es gibt noch ${anzahl} laufende${anzahl === 1 ? 'n' : ''} Auftrag${anzahl === 1 ? '' : 'aufträge'}:\n  ${names}\n\n` +
              `Trotzdem Arbeitsende stempeln?\n` +
              `Die laufenden Aufträge werden auf „wartend" gesetzt und ein Folgetermin für morgen angelegt (Restzeit wird automatisch berechnet).`
            );
            if (!ok) return;
            const bestaetigung = await ApiService.post('/tagesstempel/gehen/bestaetigen', { mitarbeiter_id, lehrling_id, termine_verschieben: true });
            if (bestaetigung && bestaetigung.folge_termine && bestaetigung.folge_termine.length > 0) {
              const folgeInfo = bestaetigung.folge_termine.map(f => `${f.folgeNr} (${f.restMin} Min)`).join(', ');
              this.showToast(`■ Arbeitsende gestempelt – Folgetermine für morgen: ${folgeInfo}`, 'success');
            } else {
              this.showToast('■ Arbeitsende gestempelt', 'success');
            }
            this.loadZeitstempelung();
            return;
          }
          this.showToast('■ Arbeitsende gestempelt', 'success');
          this.loadZeitstempelung();
        } catch (err) {
          this.showToast('Fehler: ' + (err.message || 'Unbekannt'), 'error');
        }
      },

      webBeendenSheet(mitarbeiter_id, lehrling_id) {
        const sheet = document.createElement('div');
        sheet.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;flex-direction:column;justify-content:flex-end;z-index:9999;';
        sheet.innerHTML = `
          <style>
            @keyframes intern-bs-slide { from { transform:translateY(100%) } to { transform:translateY(0) } }
          </style>
          <div style="background:#fff;border-radius:18px 18px 0 0;padding:18px 16px 24px;box-shadow:0 -4px 30px rgba(0,0,0,0.25);animation:intern-bs-slide 0.2s ease-out;max-width:520px;margin:0 auto;width:100%;">
            <div style="width:48px;height:5px;background:#dee2e6;border-radius:3px;margin:0 auto 14px;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <strong style="font-size:16px;color:#212529;">🔴 Beenden – Was möchtest du tun?</strong>
              <button data-bs-close style="background:none;border:none;font-size:22px;color:#999;cursor:pointer;padding:2px 8px;">✕</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:9px;">
              <button data-bs-action="ub" style="background:linear-gradient(135deg,#fd7e14 0%,#ffa54a 100%);color:#fff;border:none;border-radius:10px;padding:14px 16px;text-align:left;cursor:pointer;font-size:15px;">
                <span style="font-size:22px;margin-right:8px;">⏸</span>
                <strong>Arbeitsunterbrechung</strong>
                <div style="font-size:12px;font-weight:400;opacity:0.92;margin-top:2px;">Kurze Pause – Arbeitszeit zählt nicht weiter</div>
              </button>
              <button data-bs-action="ende" style="background:linear-gradient(135deg,#dc3545 0%,#ef5350 100%);color:#fff;border:none;border-radius:10px;padding:14px 16px;text-align:left;cursor:pointer;font-size:15px;">
                <span style="font-size:22px;margin-right:8px;">🔴</span>
                <strong>Arbeitsende stempeln</strong>
                <div style="font-size:12px;font-weight:400;opacity:0.92;margin-top:2px;">Heute Feierabend – schließt offene Arbeiten</div>
              </button>
              <button data-bs-close style="background:#f1f3f5;color:#495057;border:none;border-radius:10px;padding:11px;font-size:14px;cursor:pointer;margin-top:4px;">Abbrechen</button>
            </div>
          </div>
        `;
        document.body.appendChild(sheet);
        const close = () => { try { document.body.removeChild(sheet); } catch(_) {} };
        sheet.addEventListener('click', (e) => {
          if (e.target === sheet || e.target.closest('[data-bs-close]')) { close(); return; }
          const btn = e.target.closest('[data-bs-action]');
          if (!btn) return;
          const action = btn.dataset.bsAction;
          close();
          if (action === 'ub')   this.webUnterbrechungStart(mitarbeiter_id, lehrling_id);
          if (action === 'ende') this.webTagesstempelGehen(mitarbeiter_id, lehrling_id);
        });
      },

      async webUnterbrechungStart(mitarbeiter_id, lehrling_id) {
        const grundLabels = {
          raucherpause: '🚬 Raucherpause',
          abwesend: '🚪 Abwesend',
          sonstiges: '📝 Sonstiges'
        };
        const optionsHtml = Object.entries(grundLabels).map(([val, label]) => `
          <label style="display:flex;align-items:center;gap:10px;padding:9px;border:1px solid #e0e0e0;border-radius:6px;cursor:pointer;font-size:13px;">
            <input type="radio" name="webUbGrund" value="${val}" style="accent-color:#fd7e14;">${label}
          </label>`).join('');
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
        modal.innerHTML = `
          <div style="background:white;border-radius:10px;padding:22px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
              <strong style="font-size:15px;">⏸ Arbeitsunterbrechung</strong>
              <span id="webUbClose" style="cursor:pointer;color:#999;font-size:20px;">✕</span>
            </div>
            <p style="font-size:12.5px;color:#666;margin:0 0 12px;">Grund (Arbeitszeit zählt nicht weiter):</p>
            <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;">${optionsHtml}</div>
            <input id="webUbFreitext" type="text" placeholder="optionale Notiz" style="width:100%;padding:8px 10px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;margin-bottom:16px;box-sizing:border-box;">
            <div style="display:flex;gap:8px;">
              <button id="webUbAbbrechen" style="flex:1;padding:9px;background:#f0f0f0;color:#555;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Abbrechen</button>
              <button id="webUbBestaetigen" style="flex:1;padding:9px;background:#fd7e14;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">⏸ Starten</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
        const close = () => document.body.removeChild(modal);
        modal.querySelector('#webUbClose').onclick = close;
        modal.querySelector('#webUbAbbrechen').onclick = close;
        modal.onclick = (e) => { if (e.target === modal) close(); };
        modal.querySelector('#webUbBestaetigen').onclick = async () => {
          const sel = modal.querySelector('input[name="webUbGrund"]:checked');
          if (!sel) { alert('Bitte einen Grund auswählen.'); return; }
          const freitext = (modal.querySelector('#webUbFreitext').value || '').trim();
          const grund = freitext ? `${grundLabels[sel.value]} – ${freitext}` : grundLabels[sel.value];
          try {
            await ApiService.post('/tagesstempel/unterbrechung/start', { mitarbeiter_id, lehrling_id, grund });
            close();
            this.showToast('⏸ Unterbrechung gestartet', 'success');
            this.loadZeitstempelung();
          } catch (err) {
            this.showToast('Fehler: ' + (err.message || 'Unbekannt'), 'error');
          }
        };
      },

      async webUnterbrechungEnde(mitarbeiter_id, lehrling_id) {
        try {
          await ApiService.post('/tagesstempel/unterbrechung/ende', { mitarbeiter_id, lehrling_id });
          this.showToast('▶ Unterbrechung beendet', 'success');
          this.loadZeitstempelung();
        } catch (err) {
          this.showToast('Fehler: ' + (err.message || 'Unbekannt'), 'error');
        }
      }
  });
}
