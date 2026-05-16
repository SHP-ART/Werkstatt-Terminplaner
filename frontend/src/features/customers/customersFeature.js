export function installCustomersFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadKunden() {
        try {
          const kunden = await KundenService.getAll();
          this.kundenCache = kunden;
          this.buildFuzzySearchIndex();
    
          const kundenListe = document.getElementById('kundenListe');
          if (kundenListe) {
            kundenListe.innerHTML = '';
            kunden.forEach(kunde => {
              const option = document.createElement('option');
              option.value = kunde.name;
              option.dataset.id = kunde.id;
              option.label = kunde.telefon ? `${kunde.name} (${kunde.telefon})` : kunde.name;
              kundenListe.appendChild(option);
            });
          }
    
          // Render die gefilterte Liste (oder alle wenn kein Suchbegriff)
          const sucheInput = document.getElementById('kundenListeSuche');
          const suchBegriff = sucheInput ? sucheInput.value.trim() : '';
          this.renderKundenListe(kunden, suchBegriff);
    
          this.updateTerminSuchliste();
        } catch (error) {
          console.error('Fehler beim Laden der Kunden:', error);
          let errorMessage = 'Fehler beim Laden der Kunden.';
          if (error.isNetworkError) {
            errorMessage = `Verbindung zum Server fehlgeschlagen. Bitte prüfen Sie, ob das Backend läuft und erreichbar ist.\n\nFehler: ${error.message}`;
          } else if (error.message) {
            errorMessage = `Fehler beim Laden der Kunden: ${error.message}`;
          }
          alert(errorMessage);
        }
      },

      renderKundenListe(kunden, suchBegriff = '') {
        const tbody = document.getElementById('kundenTable')?.getElementsByTagName('tbody')[0];
        if (!tbody) return;
    
        // Update Badge
        const badge = document.getElementById('kundenAnzahlBadge');
        
        // Clear-Button anzeigen/verstecken
        const clearBtn = document.getElementById('kundenSucheClearBtn');
        if (clearBtn) {
          clearBtn.style.display = suchBegriff ? 'block' : 'none';
        }
    
        tbody.innerHTML = '';
    
        // Ohne Suchbegriff: Zeige Hinweis statt voller Liste
        if (!suchBegriff || suchBegriff.length < 2) {
          if (badge) {
            badge.textContent = `${kunden.length} Kunden gespeichert`;
            badge.classList.remove('filtered');
          }
          const row = tbody.insertRow();
          row.innerHTML = `<td colspan="7" class="suche-hinweis">🔍 Geben Sie mindestens 2 Zeichen ein, um Kunden zu suchen</td>`;
          return;
        }
    
        // Filtere Kunden basierend auf Suchbegriff
        const lower = suchBegriff.toLowerCase();
        // Normalisiere Suchbegriff für Kennzeichen (entferne Leerzeichen und Bindestriche)
        const normalizedSearch = suchBegriff.replace(/[\s\-]/g, '').toLowerCase();
        
        const gefilterteKunden = kunden.filter(kunde => {
          // Normale Suche in allen Feldern
          const normalMatch = (kunde.name && kunde.name.toLowerCase().includes(lower)) ||
                              (kunde.telefon && kunde.telefon.toLowerCase().includes(lower)) ||
                              (kunde.email && kunde.email.toLowerCase().includes(lower)) ||
                              (kunde.fahrzeugtyp && kunde.fahrzeugtyp.toLowerCase().includes(lower)) ||
                              (kunde.locosoft_id && kunde.locosoft_id.toLowerCase().includes(lower));
          
          // Spezielle normalisierte Suche für Kennzeichen
          const kennzeichenMatch = kunde.kennzeichen && 
                                   kunde.kennzeichen.replace(/[\s\-]/g, '').toLowerCase().includes(normalizedSearch);
          
          return normalMatch || kennzeichenMatch;
        });
    
        if (badge) {
          badge.textContent = `${gefilterteKunden.length} von ${kunden.length} Kunden`;
          badge.classList.add('filtered');
        }
        
        if (gefilterteKunden.length === 0) {
          const row = tbody.insertRow();
          row.innerHTML = `<td colspan="7" class="keine-ergebnisse">Keine Kunden gefunden für "${this.escapeHtml(suchBegriff)}"</td>`;
          return;
        }
    
        // Begrenze auf max. 100 Ergebnisse für Performance
        const maxResults = 100;
        const anzeigeKunden = gefilterteKunden.slice(0, maxResults);
    
        anzeigeKunden.forEach(kunde => {
          const row = tbody.insertRow();
          row.innerHTML = `
            <td>${this.highlightMatch(kunde.name || '', suchBegriff)}</td>
            <td>${this.highlightMatch(kunde.telefon || '-', suchBegriff)}</td>
            <td>${this.highlightMatch(kunde.email || '-', suchBegriff)}</td>
            <td>${this.highlightMatch(kunde.kennzeichen || '-', suchBegriff)}</td>
            <td>${this.highlightMatch(kunde.fahrzeugtyp || '-', suchBegriff)}</td>
            <td>${this.highlightMatch(kunde.locosoft_id || '-', suchBegriff)}</td>
            <td>
              <button class="btn btn-small btn-primary" onclick="app.openFahrzeugVerwaltung(${kunde.id}, '${(kunde.name || '').replace(/'/g, "\\'")}')" title="Fahrzeuge verwalten">🚗</button>
              <button class="btn btn-small btn-secondary" onclick="app.editKunde(${kunde.id})" title="Bearbeiten">✏️</button>
              <button class="btn btn-small btn-danger" onclick="app.deleteKunde(${kunde.id}, '${(kunde.name || '').replace(/'/g, "\\'")}')">🗑️</button>
            </td>
          `;
        });
    
        // Hinweis wenn mehr Ergebnisse vorhanden
        if (gefilterteKunden.length > maxResults) {
          const row = tbody.insertRow();
          row.innerHTML = `<td colspan="7" class="mehr-ergebnisse">... und ${gefilterteKunden.length - maxResults} weitere Treffer. Verfeinern Sie Ihre Suche.</td>`;
        }
      },

      filterKundenListe() {
        const sucheInput = document.getElementById('kundenListeSuche');
        const suchBegriff = sucheInput ? sucheInput.value.trim() : '';
    
        // Bei leerem Suchbegriff: Alle anzeigen
        if (!suchBegriff) {
          this.renderKundenListe(this.kundenCache || [], '');
          return;
        }
    
        // Fuzzy-Search aktivieren ab 2 Zeichen
        if (suchBegriff.length >= 2) {
          this.filterKundenListeFuzzy();
        } else {
          this.renderKundenListe(this.kundenCache || [], suchBegriff);
        }
      },

      clearKundenSuche() {
        const sucheInput = document.getElementById('kundenListeSuche');
        if (sucheInput) {
          sucheInput.value = '';
          sucheInput.focus();
        }
        this.filterKundenListe();
      },

      async handleKundenSubmit(e) {
        e.preventDefault();
    
        const form = document.getElementById('kundenForm');
        const editId = form.dataset.editId;
    
        const kunde = {
          name: document.getElementById('kunde_name').value,
          telefon: document.getElementById('telefon').value,
          email: document.getElementById('email').value,
          adresse: document.getElementById('adresse').value,
          locosoft_id: document.getElementById('locosoft_id').value,
          kennzeichen: document.getElementById('kunde_kennzeichen')?.value?.trim().toUpperCase() || null,
          vin: document.getElementById('kunde_vin')?.value?.trim().toUpperCase() || null,
          fahrzeugtyp: document.getElementById('kunde_fahrzeugtyp')?.value?.trim() || null
        };
    
        try {
          if (editId) {
            // Update bestehenden Kunden
            await KundenService.update(editId, kunde);
            alert('Kunde erfolgreich aktualisiert!');
            delete form.dataset.editId;
            
            // Button zurücksetzen
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Kunde anlegen';
            submitBtn.classList.remove('btn-warning');
          } else {
            // Neuen Kunden anlegen
            await KundenService.create(kunde);
            alert('Kunde erfolgreich angelegt!');
          }
          
          form.reset();
          this.loadKunden();
        } catch (error) {
          console.error('Fehler beim Speichern des Kunden:', error);
          alert('Fehler beim Speichern des Kunden');
        }
      },

      async importKunden() {
        const data = document.getElementById('importData').value;
    
        try {
          const kunden = JSON.parse(data);
          const result = await KundenService.import(kunden);
          alert(result.message);
          document.getElementById('importData').value = '';
          this.loadKunden();
        } catch (error) {
          console.error('Fehler beim Import:', error);
          alert('Fehler beim Import. Bitte überprüfen Sie das JSON-Format.');
        }
      },

      async handleExcelFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
    
        const fileName = document.getElementById('selectedFileName');
        fileName.textContent = `📄 ${file.name}`;
    
        try {
          const data = await this.readExcelFile(file);
          await this.prepareImportPreview(data);
        } catch (error) {
          console.error('Fehler beim Lesen der Excel-Datei:', error);
          alert('Fehler beim Lesen der Datei: ' + error.message);
        }
      },

      readExcelFile(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const data = new Uint8Array(e.target.result);
              const workbook = XLSX.read(data, { type: 'array' });
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
              resolve(jsonData);
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
      },

      async prepareImportPreview(excelData) {
        const preview = document.getElementById('importPreview');
        const stats = document.getElementById('importStats');
        const warnings = document.getElementById('importWarnings');
        const tableContainer = document.getElementById('importPreviewTable');
    
        // Lade existierende Kunden für Duplikat-Check
        const existingKunden = this.kundenCache || [];
        
        // Normalisiere Spaltennamen (verschiedene Schreibweisen unterstützen)
        const normalizedData = excelData.map(row => {
          const normalized = {};
          let fabrikat = '';
          let modell = '';
          let vorname = '';
          
          for (const [key, value] of Object.entries(row)) {
            const lowerKey = key.toLowerCase().trim().replace(/\n/g, '');
            const strValue = String(value || '').trim();
            
            if (lowerKey === 'name' || (lowerKey.includes('name') && !lowerKey.includes('datei') && !lowerKey.includes('vorname'))) {
              normalized.name = strValue;
            } else if (lowerKey === 'vorname' || lowerKey.includes('vorname')) {
              vorname = strValue;
            } else if (lowerKey.includes('telefon') || lowerKey.includes('tel') || lowerKey.includes('phone')) {
              normalized.telefon = strValue;
            } else if (lowerKey.includes('email') || lowerKey.includes('e-mail') || lowerKey.includes('mail')) {
              normalized.email = strValue;
            } else if (lowerKey.includes('adresse') || lowerKey.includes('address') || lowerKey.includes('anschrift')) {
              normalized.adresse = strValue;
            } else if (lowerKey.includes('kennzeichen') || lowerKey.includes('nummernschild') || lowerKey.includes('kfz')) {
              normalized.kennzeichen = strValue.toUpperCase();
            } else if (lowerKey.includes('fabrikat') || lowerKey.includes('marke') || lowerKey.includes('hersteller')) {
              fabrikat = strValue;
            } else if (lowerKey.includes('modell') || lowerKey.includes('typ')) {
              modell = strValue;
            } else if (lowerKey.includes('fahrzeug') || lowerKey.includes('auto')) {
              normalized.fahrzeugtyp = strValue;
            } else if (lowerKey.includes('vin') || lowerKey.includes('fahrgestell') || lowerKey.includes('fg-nr') || lowerKey === 'fg-nr') {
              normalized.vin = strValue.replace(/\n/g, '');
            } else if (lowerKey.includes('km') || lowerKey.includes('kilometer')) {
              normalized.kmStand = strValue;
            }
          }
          
          // Kombiniere Fabrikat und Modell zu Fahrzeugtyp
          if (!normalized.fahrzeugtyp && (fabrikat || modell)) {
            normalized.fahrzeugtyp = [fabrikat, modell].filter(x => x && x.trim()).join(' ');
          }
          
          // Kombiniere Name und Vorname wenn beide vorhanden
          if (vorname && vorname.trim() && normalized.name) {
            normalized.name = `${normalized.name}, ${vorname}`.trim();
          }
          
          return normalized;
        }).filter(row => row.name); // Nur Zeilen mit Namen
    
        // Duplikate und Warnungen sammeln
        const warningsList = [];
        const existingNames = new Set(existingKunden.map(k => k.name?.toLowerCase()));
        const existingKennzeichen = new Set(existingKunden.map(k => k.kennzeichen?.toUpperCase()).filter(k => k));
        
        // Sammle auch Kennzeichen aus Terminen
        const termineKennzeichen = new Set();
        if (this.termineCache) {
          this.termineCache.forEach(t => {
            if (t.kennzeichen) termineKennzeichen.add(t.kennzeichen.toUpperCase());
          });
        }
    
        const importNamesCount = {};
        const importKennzeichenCount = {};
    
        normalizedData.forEach((row, index) => {
          // Zähle Namen in Import-Daten
          const nameLower = row.name.toLowerCase();
          importNamesCount[nameLower] = (importNamesCount[nameLower] || 0) + 1;
    
          // Zähle Kennzeichen in Import-Daten
          if (row.kennzeichen) {
            const kz = row.kennzeichen.toUpperCase();
            importKennzeichenCount[kz] = (importKennzeichenCount[kz] || 0) + 1;
          }
    
          // Prüfe auf existierende Duplikate
          if (existingNames.has(nameLower)) {
            row._warnung = 'name_existiert';
            warningsList.push(`⚠️ Zeile ${index + 1}: Name "${row.name}" existiert bereits in der Datenbank`);
          }
    
          if (row.kennzeichen && existingKennzeichen.has(row.kennzeichen)) {
            row._warnung = (row._warnung || '') + '_kennzeichen_existiert';
            warningsList.push(`⚠️ Zeile ${index + 1}: Kennzeichen "${row.kennzeichen}" existiert bereits bei einem Kunden`);
          }
    
          if (row.kennzeichen && termineKennzeichen.has(row.kennzeichen)) {
            row._info = 'kennzeichen_in_terminen';
          }
        });
    
        // Prüfe auf Duplikate innerhalb der Import-Datei
        normalizedData.forEach((row, index) => {
          const nameLower = row.name.toLowerCase();
          if (importNamesCount[nameLower] > 1) {
            row._mehrfach = true;
            if (!row._warnung?.includes('mehrfach')) {
              row._info = (row._info || '') + '_mehrfach_name';
            }
          }
          
          if (row.kennzeichen && importKennzeichenCount[row.kennzeichen] > 1) {
            row._warnung = (row._warnung || '') + '_kennzeichen_mehrfach';
            if (!warningsList.some(w => w.includes(`Kennzeichen "${row.kennzeichen}" mehrfach`))) {
              warningsList.push(`⚠️ Kennzeichen "${row.kennzeichen}" kommt mehrfach in der Importdatei vor`);
            }
          }
        });
    
        // Speichere für späteren Import
        this.pendingImportData = normalizedData;
    
        // Statistik anzeigen
        const uniqueNames = new Set(normalizedData.map(r => r.name.toLowerCase())).size;
        const uniqueKennzeichen = new Set(normalizedData.filter(r => r.kennzeichen).map(r => r.kennzeichen)).size;
        const kundenMitMehrfachFahrzeugen = Object.values(importNamesCount).filter(c => c > 1).length;
    
        stats.innerHTML = `
          <div class="stat-item">📋 <strong>${normalizedData.length}</strong> Zeilen gefunden</div>
          <div class="stat-item">👥 <strong>${uniqueNames}</strong> verschiedene Kunden</div>
          <div class="stat-item">🚗 <strong>${uniqueKennzeichen}</strong> verschiedene Kennzeichen</div>
          ${kundenMitMehrfachFahrzeugen > 0 ? `<div class="stat-item">🔄 <strong>${kundenMitMehrfachFahrzeugen}</strong> Kunden mit mehreren Fahrzeugen</div>` : ''}
        `;
    
        // Warnungen anzeigen
        if (warningsList.length > 0) {
          warnings.innerHTML = `
            <div class="warnings-header">⚠️ ${warningsList.length} Hinweise:</div>
            <ul class="warnings-list">
              ${warningsList.slice(0, 10).map(w => `<li>${w}</li>`).join('')}
              ${warningsList.length > 10 ? `<li>... und ${warningsList.length - 10} weitere</li>` : ''}
            </ul>
          `;
          warnings.style.display = 'block';
        } else {
          warnings.innerHTML = '<div class="no-warnings">✅ Keine Duplikate gefunden</div>';
          warnings.style.display = 'block';
        }
    
        // Vorschau-Tabelle erstellen
        tableContainer.innerHTML = `
          <table class="preview-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Telefon</th>
                <th>Email</th>
                <th>Kennzeichen</th>
                <th>Fahrzeug</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${normalizedData.slice(0, 50).map((row, i) => `
                <tr class="${row._warnung ? 'warning-row' : ''} ${row._mehrfach ? 'mehrfach-row' : ''}">
                  <td>${i + 1}</td>
                  <td>${this.escapeHtml(row.name)}${row._mehrfach ? ' <span class="badge-mehrfach">👥 Mehrfach</span>' : ''}</td>
                  <td>${this.escapeHtml(row.telefon || '-')}</td>
                  <td>${this.escapeHtml(row.email || '-')}</td>
                  <td>${this.escapeHtml(row.kennzeichen || '-')}</td>
                  <td>${this.escapeHtml(row.fahrzeugtyp || '-')}</td>
                  <td>
                    ${row._warnung?.includes('name_existiert') ? '<span class="badge-warning">Name existiert</span>' : ''}
                    ${row._warnung?.includes('kennzeichen_existiert') ? '<span class="badge-warning">Kennz. existiert</span>' : ''}
                    ${row._warnung?.includes('kennzeichen_mehrfach') ? '<span class="badge-danger">Kennz. mehrfach!</span>' : ''}
                    ${!row._warnung ? '<span class="badge-ok">✓ OK</span>' : ''}
                  </td>
                </tr>
              `).join('')}
              ${normalizedData.length > 50 ? `<tr><td colspan="7" class="more-rows">... und ${normalizedData.length - 50} weitere Zeilen</td></tr>` : ''}
            </tbody>
          </table>
        `;
    
        preview.style.display = 'block';
      },

      async confirmExcelImport() {
        if (!this.pendingImportData || this.pendingImportData.length === 0) {
          alert('Keine Daten zum Importieren');
          return;
        }
    
        // Zähle eindeutige Kunden und Fahrzeuge für die Vorschau
        const kundenNamen = new Set();
        const fahrzeugeSet = new Set();
        
        this.pendingImportData.forEach(row => {
          if (row.name) kundenNamen.add(row.name.toLowerCase());
          if (row.kennzeichen) fahrzeugeSet.add(row.kennzeichen.toUpperCase().replace(/[\s\-]/g, ''));
        });
    
        // Bestätigungsdialog
        const kundenCount = kundenNamen.size;
        const fahrzeugCount = fahrzeugeSet.size;
        
        if (!confirm(`Import starten?\n\n${kundenCount} eindeutige Kunden mit ${fahrzeugCount} Fahrzeugen.\n\nHinweis: Kunden mit mehreren Fahrzeugen werden automatisch erkannt und alle Kennzeichen zugeordnet.`)) {
          return;
        }
    
        try {
          // Sende alle Zeilen - das Backend gruppiert Kunden mit gleichem Namen
          // und erstellt automatisch Fahrzeug-Einträge für zusätzliche Kennzeichen
          const kundenZuImportieren = this.pendingImportData.map(row => ({
            name: row.name,
            telefon: row.telefon || '',
            email: row.email || '',
            adresse: row.adresse || '',
            kennzeichen: row.kennzeichen || '',
            fahrzeugtyp: row.fahrzeugtyp || '',
            vin: row.vin || ''
          }));
    
          const result = await KundenService.import(kundenZuImportieren);
          
          // Detaillierte Erfolgsmeldung
          let message = `✅ Import erfolgreich!\n\n`;
          message += `📋 ${result.imported} Kunden importiert\n`;
          if (result.fahrzeugeHinzugefuegt > 0) {
            message += `🚗 ${result.fahrzeugeHinzugefuegt} zusätzliche Fahrzeuge hinzugefügt\n`;
          }
          if (result.skipped > 0) {
            message += `⏭️ ${result.skipped} übersprungen\n`;
          }
          
          alert(message);
          
          // Aufräumen
          this.cancelExcelImport();
          this.loadKunden();
          
        } catch (error) {
          console.error('Fehler beim Import:', error);
          alert('❌ Fehler beim Import: ' + error.message);
        }
      },

      cancelExcelImport() {
        this.pendingImportData = null;
        document.getElementById('importPreview').style.display = 'none';
        document.getElementById('excelFileInput').value = '';
        document.getElementById('selectedFileName').textContent = '';
      },

      async editKunde(id) {
        try {
          const kunde = await KundenService.getById(id);
          if (!kunde) {
            alert('Kunde nicht gefunden');
            return;
          }
    
          // Formular mit Kundendaten füllen
          document.getElementById('kunde_name').value = kunde.name || '';
          document.getElementById('telefon').value = kunde.telefon || '';
          document.getElementById('email').value = kunde.email || '';
          document.getElementById('adresse').value = kunde.adresse || '';
          document.getElementById('locosoft_id').value = kunde.locosoft_id || '';
          document.getElementById('kunde_kennzeichen').value = kunde.kennzeichen || '';
          document.getElementById('kunde_vin').value = kunde.vin || '';
          document.getElementById('kunde_fahrzeugtyp').value = kunde.fahrzeugtyp || '';
    
          // Speichere ID für Update
          document.getElementById('kundenForm').dataset.editId = id;
    
          // Button-Text ändern
          const submitBtn = document.getElementById('kundenForm').querySelector('button[type="submit"]');
          submitBtn.textContent = 'Kunde aktualisieren';
          submitBtn.classList.add('btn-warning');
    
          // Scroll zum Formular
          document.getElementById('kundenForm').scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
          console.error('Fehler beim Laden des Kunden:', error);
          alert('Fehler beim Laden des Kunden');
        }
      },

      async deleteKunde(id, name) {
        if (!confirm(`Möchten Sie den Kunden "${name}" wirklich löschen?`)) {
          return;
        }
    
        try {
          await KundenService.delete(id);
          alert('Kunde erfolgreich gelöscht');
          this.loadKunden();
        } catch (error) {
          console.error('Fehler beim Löschen des Kunden:', error);
          alert('Fehler beim Löschen des Kunden');
        }
      },

      async openFahrzeugVerwaltung(kundeId, kundeName) {
        this.fahrzeugVerwaltungKundeId = kundeId;
        this.fahrzeugVerwaltungKundeName = kundeName;
        
        const modal = document.getElementById('fahrzeugVerwaltungModal');
        const kundeInfo = document.getElementById('fahrzeugVerwaltungKunde');
        
        kundeInfo.innerHTML = `<strong>${kundeName}</strong> (ID: ${kundeId})`;
        
        // Lade Fahrzeuge
        await this.loadFahrzeugVerwaltungListe();
        
        // Formular zurücksetzen
        document.getElementById('neuesFahrzeugKennzeichen').value = '';
        document.getElementById('neuesFahrzeugTyp').value = '';
        document.getElementById('neuesFahrzeugVin').value = '';
        
        modal.style.display = 'block';
      },

      async loadFahrzeugVerwaltungListe() {
        const liste = document.getElementById('fahrzeugVerwaltungListe');
        
        try {
          const fahrzeuge = await KundenService.getFahrzeuge(this.fahrzeugVerwaltungKundeId);
          
          if (fahrzeuge.length === 0) {
            liste.innerHTML = `
              <div style="text-align: center; padding: 30px; color: #666; background: #f8f9fa; border-radius: 8px;">
                <p style="font-size: 1.2em;">🚗 Keine Fahrzeuge vorhanden</p>
                <p style="font-size: 0.9em;">Fügen Sie unten ein neues Fahrzeug hinzu.</p>
              </div>
            `;
            return;
          }
          
          liste.innerHTML = fahrzeuge.map((fz, idx) => {
            const letzterTermin = fz.letzter_termin || fz.letzterTermin;
            const letzterKmStand = fz.letzter_km_stand || fz.letzterKmStand;
            
            return `
              <div class="fahrzeug-verwaltung-item" style="
                padding: 15px;
                margin-bottom: 10px;
                background: ${idx === 0 ? '#e8f5e9' : '#f8f9fa'};
                border-radius: 8px;
                border: 2px solid ${idx === 0 ? '#4caf50' : '#dee2e6'};
              ">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                      <span style="font-size: 1.1em; font-weight: bold;">🚗 ${fz.kennzeichen}</span>
                      ${idx === 0 ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75em;">Zuletzt</span>' : ''}
                      <span style="background: ${fz.quelle === 'kundenstamm' ? '#2196f3' : '#ff9800'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7em;">${fz.quelle === 'kundenstamm' ? 'Hauptfahrzeug' : 'Aus Terminen'}</span>
                    </div>
                    ${fz.fahrzeugtyp ? `<div style="color: #666; font-size: 0.9em;">Typ: ${fz.fahrzeugtyp}</div>` : ''}
                    ${fz.vin ? `<div style="color: #888; font-size: 0.85em;">VIN: ${fz.vin}</div>` : ''}
                    <div style="color: #888; font-size: 0.85em; margin-top: 5px;">
                      ${letzterTermin ? `Letzter Termin: ${this.formatDatum(letzterTermin)}` : 'Keine Termine'}
                      ${letzterKmStand ? ` · ${Number(letzterKmStand).toLocaleString('de-DE')} km` : ''}
                    </div>
                  </div>
                  <div style="display: flex; gap: 5px;">
                    <button class="btn btn-small btn-danger" onclick="app.deleteFahrzeugFromModal('${fz.kennzeichen.replace(/'/g, "\\'")}')" title="Fahrzeug löschen">🗑️</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
          
        } catch (error) {
          console.error('Fehler beim Laden der Fahrzeuge:', error);
          liste.innerHTML = `<div style="color: red; padding: 15px;">Fehler beim Laden der Fahrzeuge</div>`;
        }
      },

      async addFahrzeugFromModal() {
        const kennzeichen = document.getElementById('neuesFahrzeugKennzeichen').value.trim().toUpperCase();
        const fahrzeugtyp = document.getElementById('neuesFahrzeugTyp').value.trim();
        const vin = document.getElementById('neuesFahrzeugVin').value.trim().toUpperCase();
        
        if (!kennzeichen) {
          alert('Bitte geben Sie ein Kennzeichen ein.');
          document.getElementById('neuesFahrzeugKennzeichen').focus();
          return;
        }
        
        try {
          await KundenService.addFahrzeug(this.fahrzeugVerwaltungKundeId, {
            kennzeichen,
            fahrzeugtyp,
            vin
          });
          
          // Formular zurücksetzen
          document.getElementById('neuesFahrzeugKennzeichen').value = '';
          document.getElementById('neuesFahrzeugTyp').value = '';
          document.getElementById('neuesFahrzeugVin').value = '';
          
          // Liste neu laden
          await this.loadFahrzeugVerwaltungListe();
          
          // Auch Termin-Cache und Kundenliste aktualisieren
          this.loadTermineCache();
          this.loadKunden();
          
        } catch (error) {
          console.error('Fehler beim Hinzufügen des Fahrzeugs:', error);
          alert('Fehler: ' + (error.message || 'Fahrzeug konnte nicht hinzugefügt werden'));
        }
      },

      async deleteFahrzeugFromModal(kennzeichen) {
        if (!confirm(`Möchten Sie das Fahrzeug "${kennzeichen}" wirklich löschen?\n\nAchtung: Alle Termine mit diesem Kennzeichen werden ebenfalls gelöscht!`)) {
          return;
        }
        
        try {
          await KundenService.deleteFahrzeug(this.fahrzeugVerwaltungKundeId, kennzeichen);
          
          // Liste neu laden
          await this.loadFahrzeugVerwaltungListe();
          
          // Auch Termin-Cache und Kundenliste aktualisieren
          this.loadTermineCache();
          this.loadKunden();
          
        } catch (error) {
          console.error('Fehler beim Löschen des Fahrzeugs:', error);
          alert('Fehler: ' + (error.message || 'Fahrzeug konnte nicht gelöscht werden'));
        }
      },

      closeFahrzeugVerwaltungModal() {
        const modal = document.getElementById('fahrzeugVerwaltungModal');
        modal.style.display = 'none';
        this.fahrzeugVerwaltungKundeId = null;
        this.fahrzeugVerwaltungKundeName = null;
      },

      openNeuerKundeModal(context = 'termin') {
        const modal = document.getElementById('neuerKundeModal');
        if (!modal) return;
        this.neuerKundeContext = context;
    
        // Nachname aus Suchfeld vorausfüllen
        const suchtext = context === 'kalender'
          ? (document.getElementById('kalTerminKundenSuche')?.value.trim() || '')
          : (document.getElementById('terminNameSuche')?.value.trim() || '');
        const nkNachname = document.getElementById('nkNachname');
        if (nkNachname) nkNachname.value = suchtext;
    
        // Fehlermeldung zurücksetzen
        const fehler = document.getElementById('nkFehler');
        if (fehler) fehler.style.display = 'none';
    
        // Andere Felder leeren
        ['nkVorname', 'nkTelefon', 'nkFahrzeugtyp', 'nkKilometerstand'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
    
        // Kennzeichen-Felder leeren und ggf. aus der KZ-Suche vorbelegen
        let bezirk = document.getElementById('kzSucheBezirk')?.value.trim().toUpperCase() || '';
        let buchstaben = document.getElementById('kzSucheBuchstaben')?.value.trim().toUpperCase() || '';
        let nummer = document.getElementById('kzSucheNummer')?.value.trim().toUpperCase() || '';
        if (context === 'kalender') {
          const kalKz = (document.getElementById('kalTerminKennzeichen')?.value.trim().toUpperCase() || '')
            || (document.getElementById('kalTerminKundenSuche')?.value.trim().toUpperCase() || '');
          const match = kalKz.match(/^([A-ZÄÖÜ]{1,3})[-\s]?([A-ZÄÖÜ]{1,2})?[-\s]?([0-9]{1,4})?$/);
          if (match) {
            bezirk = match[1] || '';
            buchstaben = match[2] || '';
            nummer = match[3] || '';
          }
        }
        const nkKzBezirk = document.getElementById('nkKzBezirk');
        const nkKzBuchstaben = document.getElementById('nkKzBuchstaben');
        const nkKzNummer = document.getElementById('nkKzNummer');
        if (nkKzBezirk) nkKzBezirk.value = bezirk;
        if (nkKzBuchstaben) nkKzBuchstaben.value = buchstaben;
        if (nkKzNummer) nkKzNummer.value = nummer;
    
        modal.classList.toggle('kalender-modal-top', context === 'kalender');
        modal.style.display = 'block';
    
        // Fokus auf Nachname-Feld
        setTimeout(() => nkNachname?.focus(), 50);
      },

      closeNeuerKundeModal() {
        const modal = document.getElementById('neuerKundeModal');
        if (modal) {
          modal.style.display = 'none';
          modal.classList.remove('kalender-modal-top');
        }
      },

      async saveNeuerKunde() {
        const nachname = document.getElementById('nkNachname')?.value.trim() || '';
        const vorname = document.getElementById('nkVorname')?.value.trim() || '';
        const telefon = document.getElementById('nkTelefon')?.value.trim() || '';
        const kzBezirk = document.getElementById('nkKzBezirk')?.value.trim().toUpperCase() || '';
        const kzBuchstaben = document.getElementById('nkKzBuchstaben')?.value.trim().toUpperCase() || '';
        const kzNummer = document.getElementById('nkKzNummer')?.value.trim().toUpperCase() || '';
        const fahrzeugtyp = document.getElementById('nkFahrzeugtyp')?.value.trim() || '';
        const kilometerstand = document.getElementById('nkKilometerstand')?.value.trim() || '';
    
        const fehlerEl = document.getElementById('nkFehler');
    
        const zeigeFehlermeldung = (msg) => {
          if (fehlerEl) {
            fehlerEl.textContent = msg;
            fehlerEl.style.display = 'block';
          }
        };
    
        // Validierung
        if (!nachname) {
          zeigeFehlermeldung('Bitte Nachname eingeben.');
          document.getElementById('nkNachname')?.focus();
          return;
        }
        if (!kzBezirk) {
          zeigeFehlermeldung('Bitte Kennzeichen (Bezirk) eingeben.');
          document.getElementById('nkKzBezirk')?.focus();
          return;
        }
    
        // Namen zusammensetzen
        const name = vorname ? `${nachname}, ${vorname}` : nachname;
    
        // Kennzeichen zusammensetzen
        const kennzeichen = [kzBezirk, kzBuchstaben, kzNummer].filter(Boolean).join('-');
    
        // Button deaktivieren während des Speicherns
        const btn = document.getElementById('nkSpeichernBtn');
        if (btn) btn.disabled = true;
        if (fehlerEl) fehlerEl.style.display = 'none';
    
        try {
          const created = await KundenService.create({
            name,
            telefon: telefon || null,
            kennzeichen: kennzeichen || null,
            fahrzeugtyp: fahrzeugtyp || null
          });
    
          const kundeId = created.id;
    
          // Modal schließen
          this.closeNeuerKundeModal();
    
          if (this.neuerKundeContext === 'kalender') {
            const setVal = (id, value) => {
              const el = document.getElementById(id);
              if (el) el.value = value || '';
            };
            setVal('kalTerminKundeId', kundeId);
            setVal('kalTerminKundenSuche', name);
            setVal('kalTerminKennzeichen', kennzeichen);
            setVal('kalTerminFahrzeugtyp', fahrzeugtyp);
            setVal('kalTerminKilometerstand', kilometerstand);
            const ergebnisse = document.getElementById('kalTerminKundenSucheErgebnisse');
            if (ergebnisse) ergebnisse.style.display = 'none';
            this.showToast?.('Kunde angelegt und in den Kalendertermin uebernommen', 'success');
            this.neuerKundeContext = null;
            this.loadKunden();
            return;
          }

          // Terminformular: Kunden-ID setzen
          const kundeIdInput = document.getElementById('kunde_id');
          if (kundeIdInput) kundeIdInput.value = kundeId;
    
          // Suchfeld befüllen
          const terminNameSuche = document.getElementById('terminNameSuche');
          if (terminNameSuche) terminNameSuche.value = name;
    
          // Status-Badge aktualisieren
          const statusBadge = document.getElementById('kundeStatusAnzeige');
          if (statusBadge) {
            statusBadge.textContent = '✓ Kunde angelegt';
            statusBadge.className = 'kunde-status-badge gefunden';
            statusBadge.style.display = 'inline-block';
            statusBadge.style.cursor = 'default';
            statusBadge.onclick = null;
          }
    
          // Gefundener-Kunde-Box anzeigen
          const gefundenerBox = document.getElementById('gefundenerKundeAnzeige');
          const gefundenerName = document.getElementById('gefundenerKundeName');
          const gefundenerTelefon = document.getElementById('gefundenerKundeTelefon');
          if (gefundenerBox) gefundenerBox.style.display = 'block';
          if (gefundenerName) gefundenerName.textContent = name;
          if (gefundenerTelefon) gefundenerTelefon.textContent = telefon ? `📞 ${telefon}` : '';
    
          // Kennzeichen ins Terminformular übertragen
          const kennzeichenInput = document.getElementById('kennzeichen');
          if (kennzeichenInput && kennzeichen) kennzeichenInput.value = kennzeichen;
    
          const fahrzeugtypInput = document.getElementById('fahrzeugtyp');
          if (fahrzeugtypInput && fahrzeugtyp) fahrzeugtypInput.value = fahrzeugtyp;
    
          const kmInput = document.getElementById('kilometerstand');
          if (kmInput && kilometerstand) kmInput.value = kilometerstand;
    
          // Vorschläge schließen
          this.hideVorschlaege('name');
          this.hideVorschlaege('kennzeichen');
    
          // Kennzeichen-Pflichtmarkierung zurücksetzen
          const kennzeichenField = document.getElementById('kennzeichen');
          const kennzeichenLabel = kennzeichenField?.parentElement?.querySelector('label');
          this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
    
          // Kunden-Cache auffrischen
          this.loadKunden();
    
        } catch (err) {
          console.error('Fehler beim Anlegen des Kunden:', err);
          zeigeFehlermeldung('Fehler beim Anlegen: ' + (err.message || 'Unbekannter Fehler'));
        } finally {
          if (btn) btn.disabled = false;
        }
      },

      loadKundenSearch() {
        // Beim Öffnen des Tabs: Suchfeld leeren und Ergebnisse ausblenden
        const searchInput = document.getElementById('kundenSearchInput');
        const resultsContainer = document.getElementById('kundenSearchResults');
        const emptyContainer = document.getElementById('kundenSearchEmpty');
        const loadingContainer = document.getElementById('kundenSearchLoading');
    
        if (searchInput) searchInput.value = '';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (emptyContainer) emptyContainer.style.display = 'none';
        if (loadingContainer) loadingContainer.style.display = 'none';
      },

      async searchKunden() {
        const searchInput = document.getElementById('kundenSearchInput');
        const resultsContainer = document.getElementById('kundenSearchResults');
        const emptyContainer = document.getElementById('kundenSearchEmpty');
        const loadingContainer = document.getElementById('kundenSearchLoading');
        const resultsContent = document.getElementById('kundenResultsContainer');
    
        if (!searchInput || !searchInput.value.trim()) {
          alert('Bitte geben Sie einen Suchbegriff ein.');
          return;
        }
    
        const searchTerm = searchInput.value.trim();
    
        // Loading-State anzeigen
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (emptyContainer) emptyContainer.style.display = 'none';
        if (loadingContainer) loadingContainer.style.display = 'block';
    
        try {
          const kunden = await KundenService.search(searchTerm);
    
          // Loading-State ausblenden
          if (loadingContainer) loadingContainer.style.display = 'none';
    
          if (!kunden || kunden.length === 0) {
            // Keine Ergebnisse
            if (emptyContainer) emptyContainer.style.display = 'block';
            if (resultsContainer) resultsContainer.style.display = 'none';
            return;
          }
    
          // Ergebnisse anzeigen
          if (emptyContainer) emptyContainer.style.display = 'none';
          if (resultsContainer) resultsContainer.style.display = 'block';
          
          // Ergebnisse rendern
          if (resultsContent) {
            resultsContent.innerHTML = kunden.map(kunde => this.renderKundeWithTermine(kunde)).join('');
          }
        } catch (error) {
          console.error('Fehler bei der Kundensuche:', error);
          alert('Fehler bei der Suche: ' + (error.message || 'Unbekannter Fehler'));
          if (loadingContainer) loadingContainer.style.display = 'none';
        }
      },

      renderKundeWithTermine(kunde) {
        const termineHtml = kunde.termine && kunde.termine.length > 0
          ? `
            <div style="margin-top: 15px;">
              <h4 style="margin-bottom: 10px; color: var(--steel);">Terminhistorie (${kunde.termine.length})</h4>
              <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <thead>
                  <tr style="background: #f5f7fa; border-bottom: 2px solid #ddd;">
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Datum</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Termin-Nr</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Kennzeichen</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Arbeit</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Umfang</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Zeit</th>
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${kunde.termine.map(termin => `
                    <tr style="border-bottom: 1px solid #eee;">
                      <td style="padding: 10px;">${this.formatDateShort(termin.datum)}</td>
                      <td style="padding: 10px;">${termin.termin_nr || '-'}</td>
                      <td style="padding: 10px;">${termin.kennzeichen || '-'}</td>
                      <td style="padding: 10px;">${termin.arbeit || '-'}</td>
                      <td style="padding: 10px;">${termin.umfang || '-'}</td>
                      <td style="padding: 10px;">${this.formatZeit(termin.tatsaechliche_zeit)}</td>
                      <td style="padding: 10px;">
                        <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; 
                          background: ${this.getStatusColor(termin.status)}; 
                          color: white;">
                          ${this.getStatusText(termin.status)}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `
          : '<p style="margin-top: 15px; color: #666; font-style: italic;">Keine Termine vorhanden</p>';
    
        return `
          <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="margin-top: 0; color: var(--accent);">${kunde.name || 'Unbekannt'}</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
              ${kunde.telefon ? `<div><strong>Telefon:</strong> ${kunde.telefon}</div>` : ''}
              ${kunde.email ? `<div><strong>E-Mail:</strong> ${kunde.email}</div>` : ''}
              ${kunde.adresse ? `<div><strong>Adresse:</strong> ${kunde.adresse}</div>` : ''}
            </div>
            ${termineHtml}
          </div>
        `;
      },

      formatDateShort(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      },

      formatZeit(minuten) {
        if (!minuten || minuten === 0) return '-';
        const stunden = (Number(minuten) || 0) / 60;
        return `${stunden.toFixed(2)} h`;
      },

      async loadKundenFuerTeileDropdownLazy() {
        const select = document.getElementById('teileNeuKunde');
        if (!select) return;
        
        // Nur laden wenn noch nicht geladen
        if (this._kundenDropdownGeladen) return;
        this._kundenDropdownGeladen = true;
        
        select.innerHTML = '<option value="">⏳ Lade Kunden...</option>';
        await this.loadKundenFuerTeileDropdown();
      },

      async loadKundenFuerTeileDropdown() {
        const select = document.getElementById('teileNeuKunde');
        if (!select) return;
        
        try {
          // OPTIMIERT: Nutze kompakten Dropdown-Endpoint (nur ID, Name, Kennzeichen)
          const kunden = await ApiService.get('/kunden/dropdown');
          
          select.innerHTML = '<option value="">-- Kunde auswählen --</option>';
          
          (kunden || []).forEach(k => {
            const name = k.name || 'Unbekannt';
            const kennzeichen = k.kennzeichen ? ` (${k.kennzeichen})` : '';
            select.innerHTML += `<option value="${k.id}">👤 ${name}${kennzeichen}</option>`;
          });
        } catch (error) {
          console.error('Fehler beim Laden der Kunden:', error);
        }
      },

      filterKundenListeFuzzy() {
        const sucheInput = document.getElementById('kundenListeSuche');
        const suchBegriff = sucheInput ? sucheInput.value.trim() : '';
    
        if (suchBegriff.length < 2) {
          // Bei zu kurzem Suchbegriff: Alle anzeigen
          this.renderKundenListe(this.kundenCache, '');
          return;
        }
    
        // Fuzzy-Suche durchführen
        const results = this.fuzzySearchKunden(suchBegriff, 100);
    
        // Gefundene Kunden extrahieren
        const gefundeneKunden = results.map(r => r.kunde);
    
        // Liste rendern mit Score-Info
        this.renderKundenListeMitScore(results);
      },

      renderKundenListeMitScore(results) {
        const tbody = document.getElementById('kundenTable')?.getElementsByTagName('tbody')[0];
        if (!tbody) return;
    
        // Update Badge
        const badge = document.getElementById('kundenAnzahlBadge');
        if (badge) {
          badge.textContent = results.length;
        }
    
        // Clear-Button anzeigen
        const clearBtn = document.getElementById('kundenSucheClearBtn');
        if (clearBtn) {
          clearBtn.style.display = results.length > 0 ? 'block' : 'none';
        }
    
        tbody.innerHTML = '';
    
        if (results.length === 0) {
          const row = tbody.insertRow();
          const cell = row.insertCell(0);
          cell.colSpan = 6;
          cell.style.textAlign = 'center';
          cell.style.padding = '20px';
          cell.innerHTML = '<span style="color: #666;">Keine Kunden gefunden</span>';
          return;
        }
    
        results.forEach(result => {
          const kunde = result.kunde;
          const row = tbody.insertRow();
          row.dataset.kundeId = kunde.id;
    
          // Score-Badge für die erste Spalte
          const scoreClass = result.score >= 80 ? 'high' : result.score >= 50 ? 'medium' : 'low';
    
          row.insertCell(0).innerHTML = `
            <span class="fuzzy-inline-score ${scoreClass}" title="Übereinstimmung: ${result.score}%">
              ${this.escapeHtml(kunde.name || '-')}
            </span>
          `;
          row.insertCell(1).textContent = kunde.telefon || '-';
          row.insertCell(2).textContent = kunde.email || '-';
          row.insertCell(3).textContent = kunde.kennzeichen || '-';
          row.insertCell(4).textContent = kunde.fahrzeug || '-';
    
          // Aktionen
          const actionsCell = row.insertCell(5);
          actionsCell.innerHTML = `
            <button onclick="app.openKundeDetails(${kunde.id})" class="action-btn">Details</button>
            <button onclick="app.navigateToNeuerTerminMitKunde(${kunde.id})" class="action-btn">Neuer Termin</button>
          `;
        });
      },

      buildFuzzySearchIndex() {
        if (!this.kundenCache || this.kundenCache.length === 0) {
          this.fuzzySearchIndex = null;
          return;
        }
    
        // Index mit normalisierten Werten erstellen
        this.fuzzySearchIndex = this.kundenCache.map(kunde => ({
          id: kunde.id,
          normalizedName: this.normalizeForSearch(kunde.name),
          normalizedTelefon: this.normalizeForSearch(kunde.telefon),
          normalizedKennzeichen: this.normalizeForSearch(kunde.kennzeichen),
          normalizedEmail: this.normalizeForSearch(kunde.email),
          normalizedFahrzeug: this.normalizeForSearch(kunde.fahrzeug),
          original: kunde
        }));
    
        console.log(`[Fuzzy-Index] ${this.fuzzySearchIndex.length} Kunden indexiert`);
      },

      levenshteinDistance(a, b) {
        if (!a || !b) return Math.max((a || '').length, (b || '').length);
    
        const aLen = a.length;
        const bLen = b.length;
    
        // Schnelle Rückgabe bei leeren Strings
        if (aLen === 0) return bLen;
        if (bLen === 0) return aLen;
    
        // Optimierung: Nur zwei Zeilen der Matrix speichern
        let prevRow = new Array(bLen + 1);
        let currRow = new Array(bLen + 1);
    
        // Erste Zeile initialisieren
        for (let j = 0; j <= bLen; j++) {
          prevRow[j] = j;
        }
    
        for (let i = 1; i <= aLen; i++) {
          currRow[0] = i;
    
          for (let j = 1; j <= bLen; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            currRow[j] = Math.min(
              prevRow[j] + 1,      // Löschen
              currRow[j - 1] + 1,  // Einfügen
              prevRow[j - 1] + cost // Ersetzen
            );
          }
    
          // Zeilen tauschen
          [prevRow, currRow] = [currRow, prevRow];
        }
    
        return prevRow[bLen];
      },

      normalizeForSearch(str) {
        if (!str) return '';
    
        return str
          .toLowerCase()
          .replace(/ä/g, 'ae')
          .replace(/ö/g, 'oe')
          .replace(/ü/g, 'ue')
          .replace(/ß/g, 'ss')
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      },

      calculateFuzzyScore(search, target) {
        if (!search || !target) return 0;
    
        const normalizedSearch = this.normalizeForSearch(search);
        const normalizedTarget = this.normalizeForSearch(target);
    
        return this.calculateFuzzyScoreNormalized(normalizedSearch, normalizedTarget);
      },

      calculateFuzzyScoreNormalized(normalizedSearch, normalizedTarget) {
        if (!normalizedSearch || !normalizedTarget) return 0;
    
        // Exakte Übereinstimmung
        if (normalizedSearch === normalizedTarget) return 100;
    
        // Enthält den Suchbegriff
        if (normalizedTarget.includes(normalizedSearch)) {
          // Höherer Score wenn am Anfang
          if (normalizedTarget.startsWith(normalizedSearch)) return 95;
          return 85;
        }
    
        // Wort-Anfangs-Match (z.B. "mei" findet "Meier")
        const words = normalizedTarget.split(' ');
        for (const word of words) {
          if (word.startsWith(normalizedSearch)) return 90;
        }
    
        // Levenshtein-basierter Score
        const distance = this.levenshteinDistance(normalizedSearch, normalizedTarget);
        const maxLen = Math.max(normalizedSearch.length, normalizedTarget.length);
    
        // Score berechnen: Je geringer die Distanz, desto höher der Score
        const similarity = 1 - (distance / maxLen);
        const score = Math.round(similarity * 70); // Max 70 für Levenshtein-Match
    
        // Mindest-Score-Schwelle
        return score > 20 ? score : 0;
      },

      fuzzySearchKunde(searchTerm, kunde) {
        if (!searchTerm || !kunde) return { match: false, score: 0, matchedField: null };
    
        const fields = [
          { name: 'name', value: kunde.name, weight: 1.0 },
          { name: 'telefon', value: kunde.telefon, weight: 0.9 },
          { name: 'kennzeichen', value: kunde.kennzeichen, weight: 0.9 },
          { name: 'email', value: kunde.email, weight: 0.7 },
          { name: 'fahrzeug', value: kunde.fahrzeug, weight: 0.6 }
        ];
    
        let bestScore = 0;
        let matchedField = null;
    
        for (const field of fields) {
          if (!field.value) continue;
    
          const score = this.calculateFuzzyScore(searchTerm, field.value) * field.weight;
          if (score > bestScore) {
            bestScore = score;
            matchedField = field.name;
          }
        }
    
        return {
          match: bestScore >= 30, // Mindest-Score für Treffer
          score: Math.round(bestScore),
          matchedField
        };
      },

      fuzzySearchKundeFromIndex(normalizedSearch, kundeIndex) {
        if (!normalizedSearch || !kundeIndex) {
          return { match: false, score: 0, matchedField: null };
        }
    
        const fields = [
          { name: 'name', value: kundeIndex.normalizedName, weight: 1.0 },
          { name: 'telefon', value: kundeIndex.normalizedTelefon, weight: 0.9 },
          { name: 'kennzeichen', value: kundeIndex.normalizedKennzeichen, weight: 0.9 },
          { name: 'email', value: kundeIndex.normalizedEmail, weight: 0.7 },
          { name: 'fahrzeug', value: kundeIndex.normalizedFahrzeug, weight: 0.6 }
        ];
    
        let bestScore = 0;
        let matchedField = null;
    
        for (const field of fields) {
          if (!field.value) continue;
    
          const score = this.calculateFuzzyScoreNormalized(normalizedSearch, field.value) * field.weight;
          if (score > bestScore) {
            bestScore = score;
            matchedField = field.name;
          }
        }
    
        return {
          match: bestScore >= 30,
          score: Math.round(bestScore),
          matchedField
        };
      },

      fuzzySearchKunden(searchTerm, limit = 10) {
        if (!searchTerm || searchTerm.length < 2) return [];
    
        const normalizedSearch = this.normalizeForSearch(searchTerm);
        if (!normalizedSearch) return [];
    
        const results = [];
        const kunden = this.kundenCache || [];
    
        if (!this.fuzzySearchIndex || this.fuzzySearchIndex.length !== kunden.length) {
          this.buildFuzzySearchIndex();
        }
    
        if (this.fuzzySearchIndex && this.fuzzySearchIndex.length === kunden.length) {
          for (const kundeIndex of this.fuzzySearchIndex) {
            const result = this.fuzzySearchKundeFromIndex(normalizedSearch, kundeIndex);
            if (result.match) {
              results.push({
                kunde: kundeIndex.original,
                score: result.score,
                matchedField: result.matchedField
              });
            }
          }
        } else {
          for (const kunde of kunden) {
            const result = this.fuzzySearchKunde(searchTerm, kunde);
            if (result.match) {
              results.push({
                kunde,
                score: result.score,
                matchedField: result.matchedField
              });
            }
          }
        }
    
        // Nach Score absteigend sortieren
        results.sort((a, b) => b.score - a.score);
    
        return results.slice(0, limit);
      },

      renderFuzzySearchResults(results, container) {
        if (!container) return;
    
        if (!results || results.length === 0) {
          container.innerHTML = '<div class="fuzzy-no-results">Keine passenden Kunden gefunden</div>';
          container.style.display = 'block';
          return;
        }
    
        container.innerHTML = results.map(result => {
          const kunde = result.kunde;
          const scoreClass = result.score >= 80 ? 'high' : result.score >= 50 ? 'medium' : 'low';
          const fieldLabel = {
            name: 'Name',
            telefon: 'Telefon',
            kennzeichen: 'Kennzeichen',
            email: 'E-Mail',
            fahrzeug: 'Fahrzeug'
          }[result.matchedField] || result.matchedField;
    
          return `
            <div class="fuzzy-result-item" data-kunde-id="${kunde.id}">
              <div class="fuzzy-result-main">
                <span class="fuzzy-kunde-name">${this.escapeHtml(kunde.name || 'Unbekannt')}</span>
                ${kunde.kennzeichen ? `<span class="fuzzy-kunde-kz">${this.escapeHtml(kunde.kennzeichen)}</span>` : ''}
              </div>
              <div class="fuzzy-result-details">
                ${kunde.telefon ? `<span class="fuzzy-detail">📞 ${this.escapeHtml(kunde.telefon)}</span>` : ''}
                ${kunde.fahrzeug ? `<span class="fuzzy-detail">🚗 ${this.escapeHtml(kunde.fahrzeug)}</span>` : ''}
              </div>
              <div class="fuzzy-result-score">
                <span class="fuzzy-score-badge ${scoreClass}">${result.score}%</span>
                <span class="fuzzy-match-field">${fieldLabel}</span>
              </div>
            </div>
          `;
        }).join('');
    
        container.style.display = 'block';
      },

      getKundeFahrzeuge(kundeId, kundeName) {
        const fahrzeuge = new Map(); // kennzeichen -> fahrzeugInfo
        
        // 1. Aus dem Kunden-Datensatz
        const kunde = (this.kundenCache || []).find(k => k.id === kundeId);
        if (kunde && kunde.kennzeichen) {
          const kzNorm = this.normalizeKennzeichen(kunde.kennzeichen);
          fahrzeuge.set(kzNorm, {
            kennzeichen: kunde.kennzeichen,
            fahrzeugtyp: kunde.fahrzeugtyp || '',
            vin: kunde.vin || '',
            quelle: 'kunde',
            letzterTermin: null,
            letzterKmStand: null
          });
        }
        
        // 2. Aus den Terminen des Kunden
        const kundeTermine = (this.termineCache || []).filter(t => 
          t.kunde_id === kundeId || 
          (kundeName && t.kunde_name && t.kunde_name.toLowerCase() === kundeName.toLowerCase())
        );
        
        kundeTermine.forEach(termin => {
          if (termin.kennzeichen) {
            const kzNorm = this.normalizeKennzeichen(termin.kennzeichen);
            
            if (!fahrzeuge.has(kzNorm)) {
              // Neues Fahrzeug aus Termin
              fahrzeuge.set(kzNorm, {
                kennzeichen: termin.kennzeichen,
                fahrzeugtyp: termin.fahrzeugtyp || '',
                vin: termin.vin || '',
                quelle: 'termin',
                letzterTermin: termin.datum,
                letzterKmStand: termin.kilometerstand
              });
            } else {
              // Bestehendes Fahrzeug - ggf. aktualisieren
              const existing = fahrzeuge.get(kzNorm);
              if (!existing.letzterTermin || termin.datum > existing.letzterTermin) {
                existing.letzterTermin = termin.datum;
                if (termin.kilometerstand) {
                  existing.letzterKmStand = termin.kilometerstand;
                }
              }
              // Fahrzeugtyp ergänzen wenn fehlend
              if (!existing.fahrzeugtyp && termin.fahrzeugtyp) {
                existing.fahrzeugtyp = termin.fahrzeugtyp;
              }
              if (!existing.vin && termin.vin) {
                existing.vin = termin.vin;
              }
            }
          }
        });
        
        return Array.from(fahrzeuge.values());
      },

      showFahrzeugAuswahlModal(kunde, fahrzeuge) {
        const modal = document.getElementById('fahrzeugAuswahlModal');
        const kundeInfo = document.getElementById('fahrzeugAuswahlKunde');
        const liste = document.getElementById('fahrzeugAuswahlListe');
    
        if (!modal || !kundeInfo || !liste) {
          console.error('fahrzeugAuswahlModal-Elemente nicht gefunden – wähle erstes Fahrzeug direkt');
          if (fahrzeuge.length > 0) this.applyKundeAuswahl(kunde, fahrzeuge[0]);
          return;
        }
        
        kundeInfo.innerHTML = `<strong>${this._escapeHtml(kunde.name)}</strong>${kunde.telefon ? ` · ${this._escapeHtml(kunde.telefon)}` : ''}<br>
          <span style="font-size: 0.9em;">Dieser Kunde hat ${fahrzeuge.length} Fahrzeuge:</span>`;
    
        liste.innerHTML = fahrzeuge.map((fz, idx) => {
          // Unterstütze beide Feldnamen (API: letzter_termin, Cache: letzterTermin)
          const letzterTermin = fz.letzter_termin || fz.letzterTermin;
          const letzterKmStand = fz.letzter_km_stand || fz.letzterKmStand;
    
          return `
          <div class="fahrzeug-auswahl-item" onclick="app.selectFahrzeugFromModal(${kunde.id}, ${idx})" style="
            padding: 15px;
            margin-bottom: 10px;
            background: ${idx === 0 ? '#e8f5e9' : '#f8f9fa'};
            border-radius: 8px;
            border: 2px solid ${idx === 0 ? '#4caf50' : '#dee2e6'};
            cursor: pointer;
            transition: all 0.2s;
          " onmouseover="this.style.borderColor='#4a90e2'; this.style.background='#e3f2fd';"
             onmouseout="this.style.borderColor='${idx === 0 ? '#4caf50' : '#dee2e6'}'; this.style.background='${idx === 0 ? '#e8f5e9' : '#f8f9fa'}';">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 1.2em; font-weight: bold;">🚗 ${this._escapeHtml(fz.kennzeichen)}</span>
                ${fz.fahrzeugtyp ? `<span style="color: #666; margin-left: 10px;">${this._escapeHtml(fz.fahrzeugtyp)}</span>` : ''}
              </div>
              ${idx === 0 ? '<span style="background: #4caf50; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.8em;">Zuletzt</span>' : ''}
            </div>
            ${fz.vin ? `<div style="font-size: 0.85em; color: #888; margin-top: 5px;">VIN: ${this._escapeHtml(fz.vin)}</div>` : ''}
            <div style="font-size: 0.85em; color: #666; margin-top: 5px;">
              ${letzterTermin ? `Letzter Termin: ${this.formatDatum(letzterTermin)}` : 'Aus Kundenstamm'}
              ${letzterKmStand ? ` · ${Number(letzterKmStand).toLocaleString('de-DE')} km` : ''}
            </div>
          </div>
        `}).join('') + `
          <div id="neuesFahrzeugSection" style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #dee2e6;">
            <button type="button" id="toggleNeuesFahrzeugBtn" class="btn btn-outline" onclick="app.toggleNeuesFahrzeugFormular()" style="width: 100%; padding: 12px; font-size: 1em;">
              ➕ Neues Fahrzeug anlegen
            </button>
            <div id="neuesFahrzeugFormular" style="display: none; margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
              <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group" style="margin: 0;">
                  <label style="font-size: 0.85em;">Kennzeichen: *</label>
                  <input type="text" id="auswahlNeuesKennzeichen" placeholder="z.B. K-AB 1234" style="text-transform: uppercase;">
                </div>
                <div class="form-group" style="margin: 0;">
                  <label style="font-size: 0.85em;">Fahrzeugtyp:</label>
                  <input type="text" id="auswahlNeuesFahrzeugtyp" placeholder="z.B. VW Golf">
                </div>
              </div>
              <div class="form-group" style="margin: 10px 0;">
                <label style="font-size: 0.85em;">VIN (optional):</label>
                <input type="text" id="auswahlNeueVin" placeholder="z.B. WVWZZZ..." maxlength="17" style="text-transform: uppercase;">
              </div>
              <div style="display: flex; gap: 10px;">
                <button type="button" class="btn btn-success" onclick="app.addFahrzeugFromAuswahl()">✓ Anlegen & Auswählen</button>
                <button type="button" class="btn btn-secondary" onclick="app.toggleNeuesFahrzeugFormular()">Abbrechen</button>
              </div>
            </div>
          </div>
        `;
        
        // Speichere die Daten für späteren Zugriff
        this.fahrzeugAuswahlData = { kunde, fahrzeuge };
        
        modal.style.display = 'block';
      },

      selectFahrzeugFromModal(kundeId, fahrzeugIndex) {
        if (!this.fahrzeugAuswahlData) return;
        
        const { kunde, fahrzeuge } = this.fahrzeugAuswahlData;
        const fahrzeug = fahrzeuge[fahrzeugIndex];
        
        this.applyKundeAuswahl(kunde, fahrzeug);
        this.closeFahrzeugAuswahlModal();
      },

      closeFahrzeugAuswahlModal() {
        const modal = document.getElementById('fahrzeugAuswahlModal');
        modal.style.display = 'none';
        this.fahrzeugAuswahlData = null;
      },

      toggleNeuesFahrzeugFormular() {
        const formular = document.getElementById('neuesFahrzeugFormular');
        const btn = document.getElementById('toggleNeuesFahrzeugBtn');
        if (!formular || !btn) return;
        
        if (formular.style.display === 'none') {
          formular.style.display = 'block';
          btn.style.display = 'none';
          document.getElementById('auswahlNeuesKennzeichen')?.focus();
        } else {
          formular.style.display = 'none';
          btn.style.display = 'block';
          // Felder leeren
          const kennzeichenEl = document.getElementById('auswahlNeuesKennzeichen');
          const fahrzeugtypEl = document.getElementById('auswahlNeuesFahrzeugtyp');
          const vinEl = document.getElementById('auswahlNeueVin');
          if (kennzeichenEl) kennzeichenEl.value = '';
          if (fahrzeugtypEl) fahrzeugtypEl.value = '';
          if (vinEl) vinEl.value = '';
        }
      },

      async addFahrzeugFromAuswahl() {
        const kennzeichen = document.getElementById('auswahlNeuesKennzeichen')?.value.trim().toUpperCase();
        const fahrzeugtyp = document.getElementById('auswahlNeuesFahrzeugtyp')?.value.trim() || null;
        const vin = document.getElementById('auswahlNeueVin')?.value.trim().toUpperCase() || null;
        
        if (!kennzeichen) {
          alert('Bitte Kennzeichen eingeben');
          document.getElementById('auswahlNeuesKennzeichen')?.focus();
          return;
        }
        
        if (!this.fahrzeugAuswahlData) {
          alert('Fehler: Keine Kundendaten verfügbar');
          return;
        }
        
        const { kunde } = this.fahrzeugAuswahlData;
        
        try {
          // Fahrzeug zum Kunden hinzufügen
          await KundenService.addFahrzeug(kunde.id, { kennzeichen, fahrzeugtyp, vin });
          
          // Neues Fahrzeug-Objekt erstellen
          const neuesFahrzeug = { kennzeichen, fahrzeugtyp, vin };
          
          // Direkt auswählen und Modal schließen
          this.applyKundeAuswahl(kunde, neuesFahrzeug);
          this.closeFahrzeugAuswahlModal();
          
          // Cache aktualisieren
          await this.loadKunden();
          
          this.showToast(`Fahrzeug ${kennzeichen} angelegt und ausgewählt`, 'success');
        } catch (error) {
          console.error('Fehler beim Anlegen des Fahrzeugs:', error);
          alert('Fehler beim Anlegen des Fahrzeugs: ' + (error.message || 'Unbekannter Fehler'));
        }
      },

      async fahrzeugWechseln(kundeId) {
        const kunde = (this.kundenCache || []).find(k => k.id === kundeId);
        if (!kunde) return;
        try {
          const fahrzeuge = await KundenService.getFahrzeuge(kundeId);
          if (fahrzeuge.length === 0) {
            this.showToast('Keine weiteren Fahrzeuge gespeichert', 'info');
            return;
          }
          this.showFahrzeugAuswahlModal(kunde, fahrzeuge);
        } catch (error) {
          console.error('Fehler beim Laden der Fahrzeuge:', error);
        }
      },

      applyKundeAuswahl(kunde, fahrzeug) {
        try {
          // Hilfsfunktion: setzt Wert nur wenn Element existiert
          const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
          };
    
          // Kunden-Daten füllen
          setVal('kunde_id', kunde.id);
          setVal('terminNameSuche', kunde.name);
          setVal('neuer_kunde_telefon', kunde.telefon || '');
    
          // Das Kennzeichen, das tatsächlich verwendet wird
          const kzQuelle = fahrzeug?.kennzeichen || kunde.kennzeichen || '';
          const fzTyp    = fahrzeug?.fahrzeugtyp  || kunde.fahrzeugtyp  || '';
          const fzVin    = fahrzeug?.vin           || '';
          const letzterKmStand = fahrzeug?.letzter_km_stand || fahrzeug?.letzterKmStand || null;
    
          console.log('[applyKundeAuswahl]', { kunde: kunde.name, kz: kzQuelle, fahrzeug });
    
          // Kennzeichen-Felder setzen
          if (kzQuelle) {
            setVal('kennzeichen', kzQuelle);
            try {
              const parts = this.parseKennzeichen(kzQuelle);
              setVal('kzSucheBezirk',    parts.bezirk);
              setVal('kzSucheBuchstaben', parts.buchstaben);
              setVal('kzSucheNummer',    parts.nummer);
            } catch (parseErr) {
              console.warn('[applyKundeAuswahl] parseKennzeichen Fehler:', parseErr);
            }
          }
    
          if (fzTyp) setVal('fahrzeugtyp', fzTyp);
          if (fzVin) setVal('vin', fzVin);
    
          // KM-Stand als Placeholder
          const kmInput = document.getElementById('kilometerstand');
          if (kmInput) {
            if (letzterKmStand) {
              kmInput.value = '';
              kmInput.placeholder = `Letzter KM-Stand: ${Number(letzterKmStand).toLocaleString('de-DE')} km`;
              kmInput.classList.add('has-previous-value');
            } else if (kunde.id) {
              // Fallback: letzten KM-Stand aus Termincache suchen
              const fallbackKm = this.findLetztenKmStand(kunde.id, kunde.name, kzQuelle);
              if (fallbackKm) {
                kmInput.value = '';
                kmInput.placeholder = `Letzter KM-Stand: ${fallbackKm.toLocaleString('de-DE')} km`;
                kmInput.classList.add('has-previous-value');
              }
            }
          }
    
          // Kunde-gefunden-Box anzeigen
          const angezeigteFahrzeug = kzQuelle ? { kennzeichen: kzQuelle, fahrzeugtyp: fzTyp } : null;
          this.showGefundenerKunde(kunde.name, kunde.telefon, angezeigteFahrzeug, kunde.id);
    
          // Status-Badge
          const statusBadge = document.getElementById('kundeStatusAnzeige');
          if (statusBadge) {
            statusBadge.textContent = '✓ Kunde ausgewählt';
            statusBadge.className = 'kunde-status-badge gefunden';
            statusBadge.style.display = 'inline-block';
          }
        } catch (err) {
          console.error('[applyKundeAuswahl] Fehler:', err);
        }
    
        // C6a Smart Default: letzte Arbeiten für diesen Kunden vorausfüllen
        const hinweis = document.getElementById('smartDefaultHinweis');
        if (hinweis) {
          hinweis.style.display = 'none';
          const letzterTermin = (this.termineCache || [])
            .filter(t => (t.kunde_id && t.kunde_id === kunde.id) || t.kunde_name === kunde.name)
            .sort((a, b) => (b.datum || '').localeCompare(a.datum || ''))
            .find(t => t.arbeit);
          if (letzterTermin) {
            const ersteArbeit = letzterTermin.arbeit.split('\n')[0].trim();
            const arbeitEl = document.getElementById('arbeitEingabe');
            if (arbeitEl && !arbeitEl.value.trim()) {
              hinweis.innerHTML = `💡 Letzter Termin: <em>${this._escapeHtml(ersteArbeit)}</em> &nbsp;<button type="button" class="btn-link" onclick="app.uebernimmLetzteArbeit('${encodeURIComponent(ersteArbeit)}')">Übernehmen</button>`;
              hinweis.style.display = 'block';
            }
          }
        }
      },

      async selectKennzeichenVorschlag(kennzeichen, kundeId) {
        // Such-Felder mit dem Kennzeichen befüllen
        const parts = this.parseKennzeichen(kennzeichen);
        const bezirkEl = document.getElementById('kzSucheBezirk');
        const buchstabenEl = document.getElementById('kzSucheBuchstaben');
        const nummerEl = document.getElementById('kzSucheNummer');
        if (bezirkEl) bezirkEl.value = parts.bezirk;
        if (buchstabenEl) buchstabenEl.value = parts.buchstaben;
        if (nummerEl) nummerEl.value = parts.nummer;
    
        // Vorschläge sofort ausblenden
        this.hideVorschlaege('kennzeichen');
    
        if (!kundeId) {
          // Kein Kunde bekannt → nur Kennzeichen-Feld setzen
          const kennzeichenEl = document.getElementById('kennzeichen');
          if (kennzeichenEl) kennzeichenEl.value = kennzeichen;
          return;
        }
    
        const kunde = (this.kundenCache || []).find(k => k.id == kundeId);
        if (!kunde) return;
    
        // Passendes Fahrzeug zu diesem Kennzeichen finden
        let fahrzeug = null;
        try {
          const fahrzeuge = await KundenService.getFahrzeuge(kundeId);
          fahrzeug = fahrzeuge.find(f =>
            this.normalizeKennzeichen(f.kennzeichen) === this.normalizeKennzeichen(kennzeichen)
          ) || fahrzeuge[0] || null;
        } catch (e) {
          // Fallback: Aus termineCache suchen
          const tCached = (this.termineCache || []).find(t =>
            t.kunde_id == kundeId &&
            this.normalizeKennzeichen(t.kennzeichen || '') === this.normalizeKennzeichen(kennzeichen)
          );
          fahrzeug = tCached
            ? { kennzeichen, fahrzeugtyp: tCached.fahrzeugtyp || '' }
            : { kennzeichen, fahrzeugtyp: kunde.fahrzeugtyp || '' };
        }
    
        if (!fahrzeug) {
          fahrzeug = { kennzeichen, fahrzeugtyp: kunde.fahrzeugtyp || '' };
        }
    
        this.applyKundeAuswahl(kunde, fahrzeug);
        this.showToast(`🚗 ${kennzeichen} übernommen`, 'success');
      },

      async kalenderKundenSuche(suchtext) {
        const ergebnisseEl = document.getElementById('kalTerminKundenSucheErgebnisse');
        if (!ergebnisseEl) return;
        
        if (!suchtext || suchtext.length < 2) {
          ergebnisseEl.style.display = 'none';
          return;
        }
    
        try {
          const response = await KundenService.search(suchtext);
          const kunden = response.kunden || response || [];
          
          if (kunden.length === 0) {
            ergebnisseEl.innerHTML = '<div class="autocomplete-item" style="color:#999;">Kein Kunde gefunden</div>';
            ergebnisseEl.style.display = 'block';
            return;
          }
    
          ergebnisseEl.innerHTML = kunden.slice(0, 8).map(k => `
            <div class="autocomplete-item" data-kunde-id="${k.id}" data-name="${k.name || ''}" data-kennzeichen="${k.kennzeichen || ''}">
              <strong>${k.name || 'Unbekannt'}</strong>
              ${k.kennzeichen ? ` · ${k.kennzeichen}` : ''}
              ${k.telefon ? ` · ${k.telefon}` : ''}
            </div>
          `).join('');
          ergebnisseEl.style.display = 'block';
    
          // Klick-Handler läuft via Event-Delegation in openKalenderNeuerTerminModal
        } catch (err) {
          console.error('Kalender: Kundensuche Fehler:', err);
        }
      },

      applyFahrzeugZuKalenderModal(fahrzeug) {
        if (!fahrzeug) return;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
        setVal('kalTerminKennzeichen', fahrzeug.kennzeichen || '');
        setVal('kalTerminFahrzeugtyp', fahrzeug.fahrzeugtyp || '');
        setVal('kalTerminVin', fahrzeug.vin || '');
        const km = fahrzeug.letzter_km_stand || fahrzeug.letzterKmStand || '';
        if (km) setVal('kalTerminKilometerstand', km);
      }
  });
}
