export function installStaffFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadMitarbeiter() {
        try {
          const mitarbeiter = await MitarbeiterService.getAll();
          const tbody = document.getElementById('mitarbeiterTable').getElementsByTagName('tbody')[0];
          tbody.innerHTML = '';
    
          if (mitarbeiter.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">Keine Mitarbeiter vorhanden</td></tr>';
            return;
          }
    
          mitarbeiter.forEach(ma => {
            const row = tbody.insertRow();
            row.innerHTML = `
              <td><input type="text" id="mitarbeiter_name_${ma.id}" value="${ma.name || ''}" style="width: 150px; padding: 5px;"></td>
              <td><input type="text" id="mitarbeiter_mittagspause_${ma.id}" value="${ma.mittagspause_start || '12:00'}" style="width: 70px; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
              <td><input type="checkbox" id="mitarbeiter_nur_service_${ma.id}" ${ma.nur_service === 1 || ma.nur_service === true ? 'checked' : ''} title="Nur Service (Annahme/Rechnung)"></td>
              <td><input type="checkbox" id="mitarbeiter_aktiv_${ma.id}" ${ma.aktiv !== 0 ? 'checked' : ''}></td>
              <td>
                <button class="btn btn-primary" onclick="app.saveMitarbeiter(${ma.id})" style="padding: 5px 10px;">💾</button>
                <button class="btn btn-danger" onclick="app.deleteMitarbeiter(${ma.id})" style="padding: 5px 10px;">🗑️</button>
              </td>
            `;
          });
        } catch (error) {
          console.error('Fehler beim Laden der Mitarbeiter:', error);
        }
      },

      async loadLehrlinge() {
        try {
          const lehrlinge = await LehrlingeService.getAll();
          const tbody = document.getElementById('lehrlingeTable').getElementsByTagName('tbody')[0];
          tbody.innerHTML = '';
    
          if (lehrlinge.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Keine Lehrlinge vorhanden</td></tr>';
            return;
          }
    
          // Aktuelle KW berechnen für Anzeige
          const aktuelleKW = this.getKalenderwoche(new Date());
    
          lehrlinge.forEach(l => {
            const row = tbody.insertRow();
            // Berufsschul-Anzeige: nur lesend mit Status
            const schulwochen = l.berufsschul_wochen || '';
            const schulwochenArray = schulwochen.split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
            const istInSchule = schulwochenArray.includes(aktuelleKW);
            let schulAnzeige = schulwochen ? schulwochen : '<span style="color: #999;">-</span>';
            if (istInSchule) {
              schulAnzeige = `<span style="color: #1565c0; font-weight: bold;">📚 ${schulwochen}</span>`;
            }
            
            row.innerHTML = `
              <td><input type="text" id="lehrling_name_${l.id}" value="${l.name || ''}" style="width: 150px; padding: 5px;"></td>
              <td><input type="number" id="lehrling_aufgabe_${l.id}" value="${l.aufgabenbewaeltigung_prozent || 100}" min="0" max="500" step="1" style="width: 70px; padding: 5px;"></td>
              <td><input type="text" id="lehrling_mittagspause_${l.id}" value="${l.mittagspause_start || '12:00'}" style="width: 70px; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
              <td style="text-align: center; cursor: pointer;" onclick="app.showSubTab('berufsschuleAbwesenheit')" title="Zum Bearbeiten: Klicken Sie hier oder gehen Sie zu Abwesenheiten → Berufsschule">${schulAnzeige}</td>
              <td><input type="checkbox" id="lehrling_aktiv_${l.id}" ${l.aktiv !== 0 ? 'checked' : ''}></td>
              <td>
                <button class="btn btn-primary" onclick="app.saveLehrling(${l.id})" style="padding: 5px 10px;">💾</button>
                <button class="btn btn-danger" onclick="app.deleteLehrling(${l.id})" style="padding: 5px 10px;">🗑️</button>
              </td>
            `;
          });
        } catch (error) {
          console.error('Fehler beim Laden der Lehrlinge:', error);
        }
      },

      addMitarbeiter() {
        const tbody = document.getElementById('mitarbeiterTable').getElementsByTagName('tbody')[0];
        const row = tbody.insertRow();
        row.className = 'new-mitarbeiter-row';
        row.innerHTML = `
          <td><input type="text" id="new_mitarbeiter_name" placeholder="Name" style="width: 100%; padding: 5px;"></td>
          <td><input type="text" id="new_mitarbeiter_mittagspause" value="12:00" style="width: 100%; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
          <td><input type="checkbox" id="new_mitarbeiter_nur_service" title="Nur Service (Annahme/Rechnung)"></td>
          <td><input type="checkbox" id="new_mitarbeiter_aktiv" checked></td>
          <td>
            <button class="btn btn-primary" onclick="app.saveNewMitarbeiter()">💾</button>
            <button class="btn btn-secondary" onclick="app.cancelNewMitarbeiter()">❌</button>
          </td>
        `;
      },

      cancelNewMitarbeiter() {
        const tbody = document.getElementById('mitarbeiterTable').getElementsByTagName('tbody')[0];
        const newRow = tbody.querySelector('tr.new-mitarbeiter-row');
        if (newRow) {
          newRow.remove();
        }
      },

      async saveNewMitarbeiter() {
        const name = document.getElementById('new_mitarbeiter_name').value.trim();
        const mittagspause = document.getElementById('new_mitarbeiter_mittagspause').value || '12:00';
        const nurService = document.getElementById('new_mitarbeiter_nur_service').checked;
        const aktiv = document.getElementById('new_mitarbeiter_aktiv').checked;
    
        if (!name) {
          alert('Bitte einen Namen eingeben.');
          return;
        }
    
        try {
          await MitarbeiterService.create({
            name,
            arbeitsstunden_pro_tag: 8,
            mittagspause_start: mittagspause,
            nur_service: nurService,
            aktiv: aktiv ? 1 : 0
          });
          await this.loadMitarbeiter();
          alert('Mitarbeiter hinzugefügt!');
        } catch (error) {
          console.error('Fehler beim Hinzufügen:', error);
          alert('Fehler beim Hinzufügen des Mitarbeiters.');
        }
      },

      async saveMitarbeiter(id) {
        const name = document.getElementById(`mitarbeiter_name_${id}`).value.trim();
        const mittagspause = document.getElementById(`mitarbeiter_mittagspause_${id}`).value || '12:00';
        const nurService = document.getElementById(`mitarbeiter_nur_service_${id}`).checked;
        const aktiv = document.getElementById(`mitarbeiter_aktiv_${id}`).checked;
    
        if (!name) {
          alert('Bitte einen Namen eingeben.');
          return;
        }
    
        try {
          await MitarbeiterService.update(id, {
            name,
            arbeitsstunden_pro_tag: 8,
            wochenarbeitszeit_stunden: 40,
            arbeitstage_pro_woche: 5,
            pausenzeit_minuten: 30,
            mittagspause_start: mittagspause,
            nur_service: nurService,
            aktiv: aktiv ? 1 : 0
          });
          await this.loadMitarbeiter();
          this.showToast('Mitarbeiter aktualisiert!', 'success');
          this.loadAuslastung();
        } catch (error) {
          console.error('Fehler beim Aktualisieren:', error);
          this.showToast('Fehler beim Aktualisieren des Mitarbeiters.', 'error');
        }
      },

      toggleSamstagFelder(id) {
        const checkbox = document.getElementById(`mitarbeiter_samstag_aktiv_${id}`);
        const isChecked = checkbox.checked;
        document.getElementById(`mitarbeiter_samstag_start_${id}`).disabled = !isChecked;
        document.getElementById(`mitarbeiter_samstag_ende_${id}`).disabled = !isChecked;
        document.getElementById(`mitarbeiter_samstag_pause_${id}`).disabled = !isChecked;
      },

      toggleSamstagFelderLehrling(id) {
        const checkbox = document.getElementById(`lehrling_samstag_aktiv_${id}`);
        const isChecked = checkbox.checked;
        document.getElementById(`lehrling_samstag_start_${id}`).disabled = !isChecked;
        document.getElementById(`lehrling_samstag_ende_${id}`).disabled = !isChecked;
        document.getElementById(`lehrling_samstag_pause_${id}`).disabled = !isChecked;
      },

      async deleteMitarbeiter(id) {
        if (!confirm('Mitarbeiter wirklich löschen?')) {
          return;
        }
    
        try {
          await MitarbeiterService.delete(id);
          await this.loadMitarbeiter();
          alert('Mitarbeiter gelöscht!');
          this.loadAuslastung();
        } catch (error) {
          console.error('Fehler beim Löschen:', error);
          alert('Fehler beim Löschen des Mitarbeiters.');
        }
      },

      addLehrling() {
        const tbody = document.getElementById('lehrlingeTable').getElementsByTagName('tbody')[0];
        const row = tbody.insertRow();
        row.className = 'new-lehrling-row';
        row.innerHTML = `
          <td><input type="text" id="new_lehrling_name" placeholder="Name" style="width: 100%; padding: 5px;"></td>
          <td><input type="number" id="new_lehrling_aufgabe" value="100" min="0" max="500" step="1" style="width: 100%; padding: 5px;"></td>
          <td><input type="text" id="new_lehrling_mittagspause" value="12:00" style="width: 100%; padding: 5px; text-align: center;" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" title="24h-Format (z.B. 12:00)" oninput="this.value = this.value.replace(/[^0-9:]/g, ''); if(this.value.length === 2 && !this.value.includes(':')) this.value += ':';"></td>
          <td style="text-align: center; color: #999;">-</td>
          <td><input type="checkbox" id="new_lehrling_aktiv" checked></td>
          <td>
            <button class="btn btn-primary" onclick="app.saveNewLehrling()">💾</button>
            <button class="btn btn-secondary" onclick="app.cancelNewLehrling()">❌</button>
          </td>
        `;
      },

      cancelNewLehrling() {
        const tbody = document.getElementById('lehrlingeTable').getElementsByTagName('tbody')[0];
        const newRow = tbody.querySelector('tr.new-lehrling-row');
        if (newRow) {
          newRow.remove();
        }
      },

      async saveNewLehrling() {
        const name = document.getElementById('new_lehrling_name').value.trim();
        const aufgabe = parseFloat(document.getElementById('new_lehrling_aufgabe').value);
        const mittagspause = document.getElementById('new_lehrling_mittagspause').value || '12:00';
        // berufsschul_wochen wird später über den Abwesenheits-Tab gepflegt
        const aktiv = document.getElementById('new_lehrling_aktiv').checked;
    
        if (!name) {
          alert('Bitte einen Namen eingeben.');
          return;
        }
    
        try {
          await LehrlingeService.create({
            name,
            aufgabenbewaeltigung_prozent: aufgabe || 100,
            mittagspause_start: mittagspause,
            aktiv: aktiv ? 1 : 0
          });
          await this.loadLehrlinge();
          alert('Lehrling hinzugefügt!');
        } catch (error) {
          console.error('Fehler beim Hinzufügen:', error);
          alert('Fehler beim Hinzufügen des Lehrlings.');
        }
      },

      async saveLehrling(id) {
        const name = document.getElementById(`lehrling_name_${id}`).value.trim();
        const aufgabe = parseFloat(document.getElementById(`lehrling_aufgabe_${id}`).value);
        const mittagspause = document.getElementById(`lehrling_mittagspause_${id}`).value || '12:00';
        // berufsschul_wochen wird über den Abwesenheits-Tab gepflegt, nicht hier ändern
        const aktiv = document.getElementById(`lehrling_aktiv_${id}`).checked;
    
        if (!name) {
          alert('Bitte einen Namen eingeben.');
          return;
        }
    
        try {
          await LehrlingeService.update(id, {
            name,
            aufgabenbewaeltigung_prozent: aufgabe || 100,
            wochenarbeitszeit_stunden: 40,
            arbeitstage_pro_woche: 5,
            pausenzeit_minuten: 30,
            mittagspause_start: mittagspause,
            aktiv: aktiv ? 1 : 0
          });
          await this.loadLehrlinge();
          this.showToast('Lehrling aktualisiert!', 'success');
          this.loadAuslastung();
        } catch (error) {
          console.error('Fehler beim Aktualisieren:', error);
          this.showToast('Fehler beim Aktualisieren des Lehrlings.', 'error');
        }
      },

      async deleteLehrling(id) {
        if (!confirm('Lehrling wirklich löschen?')) {
          return;
        }
    
        try {
          await LehrlingeService.delete(id);
          await this.loadLehrlinge();
          alert('Lehrling gelöscht!');
          this.loadAuslastung();
        } catch (error) {
          console.error('Fehler beim Löschen:', error);
          alert('Fehler beim Löschen des Lehrlings.');
        }
      }
  });
}
