export function installWorkSchedulesFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadArbeitszeitenPersonSelect() {
        const select = document.getElementById('arbeitszeitenPersonSelect');
        if (!select) return;
    
        try {
          const [mitarbeiter, lehrlinge] = await Promise.all([
            MitarbeiterService.getAll(),
            LehrlingeService.getAll()
          ]);
    
          select.innerHTML = '<option value="">-- Person wählen --</option>';
    
          // Mitarbeiter hinzufügen
          mitarbeiter.forEach(ma => {
            const option = document.createElement('option');
            option.value = `mitarbeiter_${ma.id}`;
            option.textContent = `👤 ${ma.name}`;
            select.appendChild(option);
          });
    
          // Lehrlinge hinzufügen
          lehrlinge.forEach(l => {
            const option = document.createElement('option');
            option.value = `lehrling_${l.id}`;
            option.textContent = `🎓 ${l.name}`;
            select.appendChild(option);
          });
        } catch (error) {
          console.error('Fehler beim Laden der Personen:', error);
          this.showToast('Fehler beim Laden der Personen', 'error');
        }
      },

      async loadArbeitszeitenForPerson() {
        const select = document.getElementById('arbeitszeitenPersonSelect');
        const selectedValue = select?.value;
    
        const wochenGrid = document.getElementById('arbeitszeitenWochenGrid');
        const dateForm = document.getElementById('arbeitszeitenDateForm');
    
        if (!selectedValue) {
          wochenGrid.style.display = 'none';
          dateForm.style.display = 'none';
          return;
        }
    
        // Person-ID extrahieren
        const [personType, personId] = selectedValue.split('_');
        const queryParam = personType === 'mitarbeiter' 
          ? `mitarbeiter_id=${personId}` 
          : `lehrling_id=${personId}`;
    
        try {
          // Lade Schicht-Templates
          await this.loadSchichtTemplates();
          
          // Lade Wochenmuster
          const response = await fetch(`${CONFIG.API_URL}/arbeitszeiten-plan?${queryParam}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const arbeitszeiten = await response.json();
    
          // Setze Standard-Werte (8h Mo-Fr, 0h Sa+So)
          for (let wochentag = 1; wochentag <= 7; wochentag++) {
            const entry = arbeitszeiten.find(az => az.wochentag === wochentag && !az.datum_von);
            
            const stundenInput = document.getElementById(`wochentag_${wochentag}_stunden`);
            const startInput = document.getElementById(`wochentag_${wochentag}_start`);
            const endeInput = document.getElementById(`wochentag_${wochentag}_ende`);
            const freiCheckbox = document.getElementById(`wochentag_${wochentag}_frei`);
    
            if (entry) {
              stundenInput.value = entry.arbeitsstunden || 0;
              startInput.value = entry.arbeitszeit_start || '08:00';
              endeInput.value = entry.arbeitszeit_ende || '16:30';
              freiCheckbox.checked = entry.ist_frei === 1;
            } else {
              // Fallback zu Standard-Wochenarbeitszeit
              stundenInput.value = wochentag <= 5 ? 8 : 0;
              startInput.value = '08:00';
              endeInput.value = wochentag <= 5 ? '16:30' : '08:00';
              freiCheckbox.checked = wochentag > 5;
            }
    
            this.updateWochentagStundenStatus(wochentag);
          }
    
          // Lade Datum-spezifische Einträge
          await this.loadArbeitszeitenDateList(personType, personId);
    
          // Zeige UI
          wochenGrid.style.display = 'block';
          dateForm.style.display = 'block';
    
          // Setze Mindestdatum auf heute
          const heute = new Date().toISOString().split('T')[0];
          document.getElementById('arbeitszeitenDatumVon').min = heute;
          document.getElementById('arbeitszeitenDatumBis').min = heute;
    
        } catch (error) {
          console.error('Fehler beim Laden der Arbeitszeiten:', error);
          this.showToast('Fehler beim Laden der Arbeitszeiten', 'error');
        }
      },

      async loadArbeitszeitenDateList(personType, personId) {
        const queryParam = personType === 'mitarbeiter' 
          ? `mitarbeiter_id=${personId}` 
          : `lehrling_id=${personId}`;
    
        try {
          // Lade alle zukünftigen Datums-Einträge (ab heute bis weit in die Zukunft)
          const heute = new Date().toISOString().split('T')[0];
          const bis = '2099-12-31';
          const response = await fetch(`${CONFIG.API_URL}/arbeitszeiten-plan/range?${queryParam}&datum_von=${heute}&datum_bis=${bis}`);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const entries = await response.json();
    
          const tbody = document.querySelector('#arbeitszeitenDateTable tbody');
          tbody.innerHTML = '';
    
          if (!entries || entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">Keine spezifischen Zeiträume definiert</td></tr>';
            return;
          }
    
          entries.forEach(entry => {
            const row = tbody.insertRow();
            const istFrei = entry.ist_frei === 1;
            
            row.innerHTML = `
              <td>${this.formatDatum(entry.datum_von)}</td>
              <td>${entry.datum_bis ? this.formatDatum(entry.datum_bis) : '-'}</td>
              <td>${istFrei ? '-' : entry.arbeitsstunden + ' h'}</td>
              <td class="${istFrei ? 'arbeitszeiten-status-frei' : 'arbeitszeiten-status-arbeitszeit'}">
                ${istFrei ? '🚫 Frei' : '✅ Arbeitszeit'}
              </td>
              <td>${entry.beschreibung || '-'}</td>
              <td>
                <button class="btn btn-danger btn-sm" onclick="app.deleteArbeitszeitenEntry(${entry.id})" title="Löschen">🗑️</button>
              </td>
            `;
          });
        } catch (error) {
          console.error('Fehler beim Laden der Datumsliste:', error);
        }
      },

      async saveWochenMuster() {
        const select = document.getElementById('arbeitszeitenPersonSelect');
        const selectedValue = select?.value;
    
        if (!selectedValue) {
          this.showToast('Bitte wählen Sie eine Person aus', 'warning');
          return;
        }
    
        const [personType, personId] = selectedValue.split('_');
        
        // Lade globale Werkstatt-Einstellungen für Pausenzeit
        let globalePausenzeit = 30; // Standard
        try {
          const einstellungen = await EinstellungenService.getWerkstatt();
          globalePausenzeit = einstellungen?.mittagspause_minuten || 30;
        } catch (error) {
          console.warn('Konnte Werkstatt-Einstellungen nicht laden, verwende Standard-Pausenzeit 30 Min');
        }
        
        const updates = [];
    
        // Sammle alle Wochentag-Einträge
        for (let wochentag = 1; wochentag <= 7; wochentag++) {
          const stunden = parseFloat(document.getElementById(`wochentag_${wochentag}_stunden`).value) || 0;
          const start = document.getElementById(`wochentag_${wochentag}_start`).value;
          const ende = document.getElementById(`wochentag_${wochentag}_ende`).value;
          const istFrei = document.getElementById(`wochentag_${wochentag}_frei`).checked;
    
          updates.push({
            [personType === 'mitarbeiter' ? 'mitarbeiter_id' : 'lehrling_id']: parseInt(personId),
            wochentag,
            arbeitsstunden: istFrei ? 0 : stunden,
            pausenzeit_minuten: istFrei ? 0 : globalePausenzeit,
            arbeitszeit_start: start || '08:00',
            arbeitszeit_ende: ende || '16:30',
            ist_frei: istFrei ? 1 : 0
          });
        }
    
        try {
          // Speichere alle Wochenmuster
          const promises = updates.map(data => 
            fetch(`${CONFIG.API_URL}/arbeitszeiten-plan/wochentag`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            }).then(res => res.json())
          );
    
          await Promise.all(promises);
          this.showToast('✅ Wochenmuster erfolgreich gespeichert!', 'success');
          
          // Refresh Timeline wenn geöffnet
          if (this.currentView === 'timeline') {
            this.loadPersonenWocheOverview();
          }
        } catch (error) {
          console.error('Fehler beim Speichern des Wochenmusters:', error);
          this.showToast('Fehler beim Speichern', 'error');
        }
      },

      async saveArbeitszeitenDateRange(event) {
        event.preventDefault();
    
        const select = document.getElementById('arbeitszeitenPersonSelect');
        const selectedValue = select?.value;
    
        if (!selectedValue) {
          this.showToast('Bitte wählen Sie eine Person aus', 'warning');
          return;
        }
    
        const [personType, personId] = selectedValue.split('_');
        
        const datumVon = document.getElementById('arbeitszeitenDatumVon').value;
        const datumBis = document.getElementById('arbeitszeitenDatumBis').value;
        const stunden = parseFloat(document.getElementById('arbeitszeitenDateStunden').value) || 0;
        const istFrei = document.getElementById('arbeitszeitenDateFrei').checked;
        const beschreibung = document.getElementById('arbeitszeitenDateBeschreibung').value.trim();
        
        // Lade globale Werkstatt-Einstellungen für Pausenzeit
        let globalePausenzeit = 30; // Standard
        try {
          const einstellungen = await EinstellungenService.getWerkstatt();
          globalePausenzeit = einstellungen?.mittagspause_minuten || 30;
        } catch (error) {
          console.warn('Konnte Werkstatt-Einstellungen nicht laden, verwende Standard-Pausenzeit 30 Min');
        }
    
        if (!datumVon || !datumBis) {
          this.showToast('Bitte füllen Sie beide Datumsfelder aus', 'warning');
          return;
        }
    
        if (new Date(datumBis) < new Date(datumVon)) {
          this.showToast('End-Datum muss nach Start-Datum liegen', 'warning');
          return;
        }
    
        const data = {
          [personType === 'mitarbeiter' ? 'mitarbeiter_id' : 'lehrling_id']: parseInt(personId),
          datum_von: datumVon,
          datum_bis: datumBis,
          arbeitsstunden: istFrei ? 0 : stunden,
          pausenzeit_minuten: istFrei ? 0 : globalePausenzeit,
          ist_frei: istFrei ? 1 : 0,
          beschreibung: beschreibung || null
        };
    
        try {
          await fetch(`${CONFIG.API_URL}/arbeitszeiten-plan/date`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }).then(res => res.json());
    
          this.showToast('✅ Zeitraum erfolgreich hinzugefügt!', 'success');
          
          // Reset Form
          document.getElementById('arbeitszeitenDateRangeForm').reset();
          
          // Reload Liste
          await this.loadArbeitszeitenDateList(personType, personId);
          
          // Refresh Timeline wenn geöffnet
          if (this.currentView === 'timeline') {
            this.loadPersonenWocheOverview();
          }
        } catch (error) {
          console.error('Fehler beim Speichern des Zeitraums:', error);
          this.showToast('Fehler beim Speichern', 'error');
        }
      },

      async deleteArbeitszeitenEntry(id) {
        if (!confirm('Wollen Sie diesen Zeitraum wirklich löschen?')) {
          return;
        }
    
        try {
          await fetch(`${CONFIG.API_URL}/arbeitszeiten-plan/${id}`, {
            method: 'DELETE'
          }).then(res => res.json());
    
          this.showToast('✅ Zeitraum gelöscht', 'success');
          
          // Reload aktuelle Ansicht
          await this.loadArbeitszeitenForPerson();
          
          // Refresh Timeline wenn geöffnet
          if (this.currentView === 'timeline') {
            this.loadPersonenWocheOverview();
          }
        } catch (error) {
          console.error('Fehler beim Löschen:', error);
          this.showToast('Fehler beim Löschen', 'error');
        }
      },

      async resetArbeitszeitenToStandard() {
        const select = document.getElementById('arbeitszeitenPersonSelect');
        const selectedValue = select?.value;
    
        if (!selectedValue) {
          this.showToast('Bitte wählen Sie eine Person aus', 'warning');
          return;
        }
    
        if (!confirm('Wollen Sie die Wochenmuster wirklich auf die Standard-Wochenarbeitszeit zurücksetzen?\n\nAlle individuellen Wochentag-Einstellungen gehen verloren.')) {
          return;
        }
    
        const [personType, personId] = selectedValue.split('_');
        const queryParam = personType === 'mitarbeiter' 
          ? `mitarbeiter_id=${personId}` 
          : `lehrling_id=${personId}`;
    
        try {
          await fetch(`${CONFIG.API_URL}/arbeitszeiten-plan/reset?${queryParam}`, {
            method: 'POST'
          }).then(res => res.json());
    
          this.showToast('✅ Auf Standard zurückgesetzt', 'success');
          
          // Reload
          await this.loadArbeitszeitenForPerson();
          
          // Refresh Timeline wenn geöffnet
          if (this.currentView === 'timeline') {
            this.loadPersonenWocheOverview();
          }
        } catch (error) {
          console.error('Fehler beim Zurücksetzen:', error);
          this.showToast('Fehler beim Zurücksetzen', 'error');
        }
      },

      updateWochentagStundenStatus(wochentag) {
        const freiCheckbox = document.getElementById(`wochentag_${wochentag}_frei`);
        const stundenInput = document.getElementById(`wochentag_${wochentag}_stunden`);
        const startInput = document.getElementById(`wochentag_${wochentag}_start`);
        const endeInput = document.getElementById(`wochentag_${wochentag}_ende`);
        const row = document.querySelector(`[data-wochentag="${wochentag}"]`);
    
        const istFrei = freiCheckbox.checked;
    
        stundenInput.disabled = istFrei;
        startInput.disabled = istFrei;
        endeInput.disabled = istFrei;
    
        if (istFrei) {
          row.classList.add('ist-frei');
          stundenInput.value = 0;
        } else {
          row.classList.remove('ist-frei');
        }
      },

      async updateWochentagEndzeit(wochentag) {
        const startInput = document.getElementById(`wochentag_${wochentag}_start`);
        const stundenInput = document.getElementById(`wochentag_${wochentag}_stunden`);
        const endeInput = document.getElementById(`wochentag_${wochentag}_ende`);
        
        const start = startInput.value;
        const stunden = parseFloat(stundenInput.value) || 0;
        
        if (!start || stunden === 0) return;
        
        // Lade globale Pausenzeit
        let pause = 30;
        try {
          const einstellungen = await EinstellungenService.getWerkstatt();
          pause = einstellungen?.mittagspause_minuten || 30;
        } catch (error) {
          console.warn('Pausenzeit fallback: 30 Min');
        }
        
        // Berechne Endzeit: Start + Stunden + Pause
        const [startHours, startMinutes] = start.split(':').map(Number);
        const totalMinutes = startMinutes + (stunden * 60) + pause;
        const endHours = startHours + Math.floor(totalMinutes / 60);
        const endMinutes = totalMinutes % 60;
        
        endeInput.value = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
      },

      async updateWochentagStunden(wochentag) {
        const startInput = document.getElementById(`wochentag_${wochentag}_start`);
        const endeInput = document.getElementById(`wochentag_${wochentag}_ende`);
        const stundenInput = document.getElementById(`wochentag_${wochentag}_stunden`);
        
        const start = startInput.value;
        const ende = endeInput.value;
        
        if (!start || !ende) return;
        
        // Lade globale Pausenzeit
        let pause = 30;
        try {
          const einstellungen = await EinstellungenService.getWerkstatt();
          pause = einstellungen?.mittagspause_minuten || 30;
        } catch (error) {
          console.warn('Pausenzeit fallback: 30 Min');
        }
        
        // Berechne Differenz
        const [startHours, startMinutes] = start.split(':').map(Number);
        const [endHours, endMinutes] = ende.split(':').map(Number);
        
        const startTotal = startHours * 60 + startMinutes;
        const endTotal = endHours * 60 + endMinutes;
        
        let diffMinutes = endTotal - startTotal;
        if (diffMinutes < 0) diffMinutes += 24 * 60; // Über Mitternacht
        
        // Ziehe Pause ab
        diffMinutes -= pause;
        if (diffMinutes < 0) diffMinutes = 0;
        
        stundenInput.value = (diffMinutes / 60).toFixed(2);
      },

      updateWochentagFreiStatus(wochentag) {
        const stundenInput = document.getElementById(`wochentag_${wochentag}_stunden`);
        const freiCheckbox = document.getElementById(`wochentag_${wochentag}_frei`);
    
        if (parseFloat(stundenInput.value) > 0) {
          freiCheckbox.checked = false;
          this.updateWochentagStundenStatus(wochentag);
        }
      },

      toggleDateRangeFreiStatus() {
        const freiCheckbox = document.getElementById('arbeitszeitenDateFrei');
        const stundenInput = document.getElementById('arbeitszeitenDateStunden');
        const pauseInput = document.getElementById('arbeitszeitenDatePause');
    
        const istFrei = freiCheckbox.checked;
    
        stundenInput.disabled = istFrei;
        pauseInput.disabled = istFrei;
    
        if (istFrei) {
          stundenInput.value = 0;
          pauseInput.value = 0;
        } else {
          stundenInput.value = 8;
          pauseInput.value = 30;
        }
      }
  });
}
