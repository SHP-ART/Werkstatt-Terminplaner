export function installShiftTemplatesFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadSchichtTemplates() {
        try {
          const templates = await SchichtTemplateService.getAll();
          const container = document.getElementById('schichtTemplateButtons');
          
          if (templates.length === 0) {
            container.innerHTML = '<span style="color: #999;">Keine Schicht-Vorlagen vorhanden</span>';
            return;
          }
          
          container.innerHTML = templates.map(t => `
            <button class="btn btn-sm" 
                    style="background: ${t.farbe}; color: white; border: none;" 
                    onclick="app.applySchichtTemplate(${t.id}, '${t.name}', '${t.arbeitszeit_start}', '${t.arbeitszeit_ende}')"
                    title="${t.beschreibung || ''}">
              ${t.name}
            </button>
          `).join('');
        } catch (error) {
          console.error('Fehler beim Laden der Schicht-Templates:', error);
          this.showToast('Fehler beim Laden der Schicht-Vorlagen', 'error');
        }
      },

      async applySchichtTemplate(id, name, start, ende) {
        const select = document.getElementById('arbeitszeitenPersonSelect');
        if (!select || !select.value) {
          this.showToast('Bitte wählen Sie zuerst eine Person aus', 'warning');
          return;
        }
        
        if (!confirm(`Wollen Sie die Schicht "${name}" (${start} - ${ende}) auf Montag bis Freitag anwenden?`)) {
          return;
        }
        
        // Lade globale Pausenzeit
        let pause = 30;
        try {
          const einstellungen = await EinstellungenService.getWerkstatt();
          pause = einstellungen?.mittagspause_minuten || 30;
        } catch (error) {
          console.warn('Pausenzeit fallback: 30 Min');
        }
        
        // Wende auf Mo-Fr an (Wochentag 1-5)
        for (let wochentag = 1; wochentag <= 5; wochentag++) {
          const startInput = document.getElementById(`wochentag_${wochentag}_start`);
          const endeInput = document.getElementById(`wochentag_${wochentag}_ende`);
          const stundenInput = document.getElementById(`wochentag_${wochentag}_stunden`);
          const freiCheckbox = document.getElementById(`wochentag_${wochentag}_frei`);
          
          startInput.value = start;
          endeInput.value = ende;
          freiCheckbox.checked = false;
          
          // Berechne Stunden
          const [startHours, startMinutes] = start.split(':').map(Number);
          const [endHours, endMinutes] = ende.split(':').map(Number);
          
          const startTotal = startHours * 60 + startMinutes;
          const endTotal = endHours * 60 + endMinutes;
          
          let diffMinutes = endTotal - startTotal;
          if (diffMinutes < 0) diffMinutes += 24 * 60;
          
          diffMinutes -= pause;
          if (diffMinutes < 0) diffMinutes = 0;
          
          stundenInput.value = (diffMinutes / 60).toFixed(2);
          
          this.updateWochentagStundenStatus(wochentag);
        }
        
        this.showToast(`✅ Schicht "${name}" auf Mo-Fr angewendet!`, 'success');
      },

      async loadSchichtTemplatesAdmin() {
        try {
          const templates = await SchichtTemplateService.getAll();
          const tbody = document.getElementById('schichtTemplateTableBody');
          
          if (!tbody) return;
          
          if (templates.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #999;">Keine Schicht-Vorlagen vorhanden</td></tr>';
            return;
          }
          
          tbody.innerHTML = templates.map(t => `
            <tr>
              <td>${t.sortierung}</td>
              <td><strong>${t.name}</strong></td>
              <td>${t.beschreibung || '-'}</td>
              <td>${t.arbeitszeit_start}</td>
              <td>${t.arbeitszeit_ende}</td>
              <td>
                <div style="display: inline-block; width: 40px; height: 25px; background: ${t.farbe}; border-radius: 4px; border: 1px solid #ddd;"></div>
                <code style="margin-left: 5px; font-size: 0.9em;">${t.farbe}</code>
              </td>
              <td>${t.sortierung}</td>
              <td>
                <button class="btn btn-sm btn-primary" onclick="app.editSchichtTemplate(${t.id})" title="Bearbeiten">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="app.deleteSchichtTemplate(${t.id}, '${t.name}')" title="Löschen">🗑️</button>
              </td>
            </tr>
          `).join('');
        } catch (error) {
          console.error('Fehler beim Laden der Schicht-Templates:', error);
          this.showToast('Fehler beim Laden der Schicht-Vorlagen', 'error');
        }
      },

      async handleSchichtTemplateSubmit(e) {
        e.preventDefault();
        
        const name = document.getElementById('schichtName').value.trim();
        const beschreibung = document.getElementById('schichtBeschreibung').value.trim();
        const arbeitszeit_start = document.getElementById('schichtStart').value;
        const arbeitszeit_ende = document.getElementById('schichtEnde').value;
        const farbe = document.getElementById('schichtFarbe').value;
        const sortierung = parseInt(document.getElementById('schichtSortierung').value);
        
        if (!name || !arbeitszeit_start || !arbeitszeit_ende) {
          this.showToast('Bitte füllen Sie alle Pflichtfelder aus', 'warning');
          return;
        }
        
        const data = { name, beschreibung, arbeitszeit_start, arbeitszeit_ende, farbe, sortierung };
        
        try {
          if (this.currentEditSchichtId) {
            await SchichtTemplateService.update(this.currentEditSchichtId, data);
            this.showToast(`✅ Schicht "${name}" aktualisiert`, 'success');
          } else {
            await SchichtTemplateService.create(data);
            this.showToast(`✅ Schicht "${name}" erstellt`, 'success');
          }
          
          this.resetSchichtTemplateForm();
          await this.loadSchichtTemplatesAdmin();
        } catch (error) {
          console.error('Fehler beim Speichern:', error);
          this.showToast('Fehler beim Speichern der Schicht-Vorlage', 'error');
        }
      },

      async editSchichtTemplate(id) {
        try {
          const template = await SchichtTemplateService.getById(id);
          
          document.getElementById('schichtName').value = template.name;
          document.getElementById('schichtBeschreibung').value = template.beschreibung || '';
          document.getElementById('schichtStart').value = template.arbeitszeit_start;
          document.getElementById('schichtEnde').value = template.arbeitszeit_ende;
          document.getElementById('schichtFarbe').value = template.farbe;
          document.getElementById('schichtSortierung').value = template.sortierung;
          
          this.currentEditSchichtId = id;
          document.getElementById('schichtFormButtonText').textContent = '💾 Aktualisieren';
          document.getElementById('schichtFormCancel').style.display = 'inline-block';
          
          // Scroll zum Formular
          document.getElementById('schichtTemplateForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
          console.error('Fehler beim Laden:', error);
          this.showToast('Fehler beim Laden der Schicht-Vorlage', 'error');
        }
      },

      async deleteSchichtTemplate(id, name) {
        if (!confirm(`Wollen Sie die Schicht-Vorlage "${name}" wirklich löschen?`)) {
          return;
        }
        
        try {
          await SchichtTemplateService.delete(id);
          this.showToast(`🗑️ Schicht "${name}" gelöscht`, 'success');
          await this.loadSchichtTemplatesAdmin();
        } catch (error) {
          console.error('Fehler beim Löschen:', error);
          this.showToast('Fehler beim Löschen der Schicht-Vorlage', 'error');
        }
      },

      cancelSchichtTemplateEdit() {
        this.resetSchichtTemplateForm();
      },

      resetSchichtTemplateForm() {
        document.getElementById('schichtTemplateForm').reset();
        document.getElementById('schichtStart').value = '08:00';
        document.getElementById('schichtEnde').value = '16:30';
        document.getElementById('schichtFarbe').value = '#10b981';
        document.getElementById('schichtSortierung').value = '1';
        
        this.currentEditSchichtId = null;
        document.getElementById('schichtFormButtonText').textContent = '➕ Erstellen';
        document.getElementById('schichtFormCancel').style.display = 'none';
      }
  });
}
