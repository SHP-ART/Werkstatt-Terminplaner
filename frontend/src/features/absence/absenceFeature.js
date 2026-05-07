export function installAbsenceFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      async loadAbwesenheit() {
        // Legacy-Funktion - nur ausführen wenn alte Felder noch existieren
        const abwesenheitDatumField = document.getElementById('abwesenheitDatum');
        if (!abwesenheitDatumField) return;
    
        const datum = abwesenheitDatumField.value;
        if (!datum) return;
    
        try {
          const data = await EinstellungenService.getAbwesenheit(datum);
          this.prefillAbwesenheit(datum, data);
          // sync mit Auslastungs-Datum, wenn gleich
          const auslastungDatum = document.getElementById('auslastungDatum');
          if (auslastungDatum && auslastungDatum.value === datum) {
            this.loadAuslastung();
          }
        } catch (error) {
          console.error('Fehler beim Laden der Abwesenheit:', error);
        }
      },

      prefillAbwesenheit(datum, abwesenheit) {
        if (!abwesenheit) return;
    
        // Diese Felder existieren im neuen System nicht mehr, daher nur befüllen wenn vorhanden
        const abwesenheitDatum = document.getElementById('abwesenheitDatum');
        if (abwesenheitDatum && !abwesenheitDatum.value) {
          abwesenheitDatum.value = datum;
        }
    
        const urlaubField = document.getElementById('abwesenheitUrlaub');
        if (urlaubField) {
          urlaubField.value = abwesenheit.urlaub || 0;
        }
    
        const krankField = document.getElementById('abwesenheitKrank');
        if (krankField) {
          krankField.value = abwesenheit.krank || 0;
        }
      },

      async handleAbwesenheitSubmit(e) {
        e.preventDefault();
        const datum = document.getElementById('abwesenheitDatum').value;
        const urlaub = parseInt(document.getElementById('abwesenheitUrlaub').value, 10) || 0;
        const krank = parseInt(document.getElementById('abwesenheitKrank').value, 10) || 0;
    
        try {
          await EinstellungenService.updateAbwesenheit(datum, { urlaub, krank });
          alert('Abwesenheit gespeichert.');
          if (datum === document.getElementById('auslastungDatum').value) {
            this.loadAuslastung();
          }
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Speichern der Abwesenheit:', error);
          alert('Abwesenheit konnte nicht gespeichert werden.');
        }
      },

      async loadAbwesenheitenPersonen() {
        try {
          const mitarbeiter = await MitarbeiterService.getAktive();
          const lehrlinge = await LehrlingeService.getAktive();
    
          // Urlaub-Dropdown befüllen
          const urlaubSelect = document.getElementById('urlaubPerson');
          if (!urlaubSelect) {
            return;
          }
          urlaubSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
    
          if (mitarbeiter.length > 0) {
            const maOptgroup = document.createElement('optgroup');
            maOptgroup.label = 'Mitarbeiter';
            mitarbeiter.forEach(m => {
              const option = document.createElement('option');
              option.value = `ma_${m.id}`;
              option.textContent = m.name;
              maOptgroup.appendChild(option);
            });
            urlaubSelect.appendChild(maOptgroup);
          }
    
          if (lehrlinge.length > 0) {
            const lOptgroup = document.createElement('optgroup');
            lOptgroup.label = 'Lehrlinge';
            lehrlinge.forEach(l => {
              const option = document.createElement('option');
              option.value = `l_${l.id}`;
              option.textContent = l.name;
              lOptgroup.appendChild(option);
            });
            urlaubSelect.appendChild(lOptgroup);
          }
    
          // Krank-Dropdown befüllen (gleiche Struktur)
          const krankSelect = document.getElementById('krankPerson');
          if (krankSelect) krankSelect.innerHTML = urlaubSelect.innerHTML;
    
          // Lehrgang-Dropdown befüllen (gleiche Struktur)
          const lehrgangSelect = document.getElementById('lehrgangPerson');
          if (lehrgangSelect) lehrgangSelect.innerHTML = urlaubSelect.innerHTML;
    
          // Berufsschule-Dropdown befüllen (nur Lehrlinge)
          const berufsschuleSelect = document.getElementById('berufsschulePerson');
          if (berufsschuleSelect) {
            berufsschuleSelect.innerHTML = '<option value="">-- Bitte wählen --</option>';
            if (lehrlinge.length > 0) {
              lehrlinge.forEach(l => {
                const option = document.createElement('option');
                option.value = `l_${l.id}`;
                option.textContent = l.name;
                berufsschuleSelect.appendChild(option);
              });
            }
          }
    
        } catch (error) {
          console.error('Fehler beim Laden der Mitarbeiter/Lehrlinge:', error);
        }
      },

      async handleUrlaubSubmit(e) {
        e.preventDefault();
    
        const personValue = document.getElementById('urlaubPerson').value;
        const vonDatum = document.getElementById('urlaubVonDatum').value;
        const bisDatum = document.getElementById('urlaubBisDatum').value;
        const beschreibung = document.getElementById('urlaubBeschreibung')?.value || '';
    
        if (!personValue || !vonDatum || !bisDatum) {
          alert('Bitte füllen Sie alle Pflichtfelder aus.');
          return;
        }
    
        // Person-ID und Typ extrahieren
        const [typ, id] = personValue.split('_');
        const data = {
          typ: 'urlaub',
          datum_von: vonDatum,
          datum_bis: bisDatum,
          beschreibung: beschreibung
        };
    
        if (typ === 'ma') {
          data.mitarbeiter_id = parseInt(id, 10);
        } else if (typ === 'l') {
          data.lehrling_id = parseInt(id, 10);
        }
    
        try {
          await EinstellungenService.createAbwesenheit(data);
          this.showToast('Urlaub eingetragen!', 'success');
    
          // Formular zurücksetzen
          document.getElementById('urlaubForm').reset();
    
          // Liste neu laden
          this.loadUrlaubListe();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Eintragen des Urlaubs:', error);
          this.showToast('Urlaub konnte nicht eingetragen werden: ' + (error.message || 'Unbekannter Fehler'), 'error');
        }
      },

      async handleKrankSubmit(e) {
        e.preventDefault();
    
        const personValue = document.getElementById('krankPerson').value;
        const vonDatum = document.getElementById('krankVonDatum').value;
        const bisDatum = document.getElementById('krankBisDatum').value;
        const beschreibung = document.getElementById('krankBeschreibung')?.value || '';
    
        if (!personValue || !vonDatum || !bisDatum) {
          alert('Bitte füllen Sie alle Pflichtfelder aus.');
          return;
        }
    
        // Person-ID und Typ extrahieren
        const [typ, id] = personValue.split('_');
        const data = {
          typ: 'krank',
          datum_von: vonDatum,
          datum_bis: bisDatum,
          beschreibung: beschreibung
        };
    
        if (typ === 'ma') {
          data.mitarbeiter_id = parseInt(id, 10);
        } else if (typ === 'l') {
          data.lehrling_id = parseInt(id, 10);
        }
    
        try {
          await EinstellungenService.createAbwesenheit(data);
          this.showToast('Krankmeldung eingetragen!', 'success');
    
          // Formular zurücksetzen
          document.getElementById('krankForm').reset();
    
          // Liste neu laden
          this.loadKrankListe();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Eintragen der Krankmeldung:', error);
          this.showToast('Krankmeldung konnte nicht eingetragen werden: ' + (error.message || 'Unbekannter Fehler'), 'error');
        }
      },

      async handleLehrgangSubmit(e) {
        e.preventDefault();
    
        const personValue = document.getElementById('lehrgangPerson').value;
        const vonDatum = document.getElementById('lehrgangVonDatum').value;
        const bisDatum = document.getElementById('lehrgangBisDatum').value;
        const beschreibung = document.getElementById('lehrgangBeschreibung')?.value || '';
    
        if (!personValue || !vonDatum || !bisDatum) {
          alert('Bitte füllen Sie alle Pflichtfelder aus.');
          return;
        }
    
        // Person-ID und Typ extrahieren
        const [typ, id] = personValue.split('_');
        const data = {
          typ: 'lehrgang',
          datum_von: vonDatum,
          datum_bis: bisDatum,
          beschreibung: beschreibung
        };
    
        if (typ === 'ma') {
          data.mitarbeiter_id = parseInt(id, 10);
        } else if (typ === 'l') {
          data.lehrling_id = parseInt(id, 10);
        }
    
        try {
          await EinstellungenService.createAbwesenheit(data);
          this.showToast('Lehrgang eingetragen!', 'success');
    
          // Formular zurücksetzen
          document.getElementById('lehrgangForm').reset();
    
          // Liste neu laden
          this.loadLehrgangListe();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Eintragen des Lehrgangs:', error);
          this.showToast('Lehrgang konnte nicht eingetragen werden: ' + (error.message || 'Unbekannter Fehler'), 'error');
        }
      },

      async handleBerufsschuleSubmit(e) {
        e.preventDefault();
    
        const personValue = document.getElementById('berufsschulePerson').value;
        const vonDatum = document.getElementById('berufsschuleVonDatum').value;
        const bisDatum = document.getElementById('berufsschuleBisDatum').value;
        const beschreibung = document.getElementById('berufsschuleBeschreibung')?.value || '';
    
        if (!personValue || !vonDatum || !bisDatum) {
          alert('Bitte füllen Sie alle Pflichtfelder aus.');
          return;
        }
    
        // Person-ID und Typ extrahieren (nur Lehrlinge)
        const [typ, id] = personValue.split('_');
        const data = {
          typ: 'berufsschule',
          datum_von: vonDatum,
          datum_bis: bisDatum,
          beschreibung: beschreibung,
          lehrling_id: parseInt(id, 10)
        };
    
        try {
          await EinstellungenService.createAbwesenheit(data);
          this.showToast('Berufsschul-Zeit eingetragen!', 'success');
    
          // Formular zurücksetzen
          document.getElementById('berufsschuleForm').reset();
    
          // Liste neu laden
          this.loadBerufsschuleListe();
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Eintragen der Berufsschul-Zeit:', error);
          this.showToast('Berufsschul-Zeit konnte nicht eingetragen werden: ' + (error.message || 'Unbekannter Fehler'), 'error');
        }
      },

      validateKrankDatum() {
        const vonDatumInput = document.getElementById('krankVonDatum');
        const bisDatumInput = document.getElementById('krankBisDatum');
    
        const heute = new Date();
        heute.setHours(0, 0, 0, 0);
        const maxDatum = new Date(heute);
        maxDatum.setDate(maxDatum.getDate() + 7);
    
        const maxDatumString = this.formatDateLocal(maxDatum);
    
        // Setze max-Attribut
        vonDatumInput.setAttribute('max', maxDatumString);
        bisDatumInput.setAttribute('max', maxDatumString);
    
        // Validiere existierende Werte
        if (vonDatumInput.value) {
          const vonDatum = new Date(vonDatumInput.value);
          if (vonDatum > maxDatum) {
            vonDatumInput.value = '';
            alert('Das Von-Datum darf maximal 7 Tage in der Zukunft liegen.');
          }
        }
    
        if (bisDatumInput.value) {
          const bisDatum = new Date(bisDatumInput.value);
          if (bisDatum > maxDatum) {
            bisDatumInput.value = '';
            alert('Das Bis-Datum darf maximal 7 Tage in der Zukunft liegen.');
          }
        }
      },

      async loadUrlaubListe() {
        try {
          const abwesenheiten = await EinstellungenService.getAllAbwesenheiten();
          const urlaube = abwesenheiten.filter(a => a.typ === 'urlaub');
    
          const tbody = document.querySelector('#urlaubTable tbody');
          if (!tbody) return;
          tbody.innerHTML = '';
    
          if (urlaube.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">Keine Urlaube eingetragen</td></tr>';
            return;
          }
    
          urlaube.forEach(urlaub => {
            const row = document.createElement('tr');
            const personName = urlaub.mitarbeiter_name || urlaub.lehrling_name || 'Unbekannt';
    
            row.innerHTML = `
              <td>${personName}</td>
              <td>${this.formatDatum(urlaub.datum_von)}</td>
              <td>${this.formatDatum(urlaub.datum_bis)}</td>
              <td>${urlaub.beschreibung || '-'}</td>
              <td>
                <button class="btn btn-danger" onclick="app.deleteAbwesenheit(${urlaub.id}, 'urlaub')">Löschen</button>
              </td>
            `;
            tbody.appendChild(row);
          });
        } catch (error) {
          console.error('Fehler beim Laden der Urlaube:', error);
        }
      },

      async loadKrankListe() {
        try {
          const abwesenheiten = await EinstellungenService.getAllAbwesenheiten();
          const krankmeldungen = abwesenheiten.filter(a => a.typ === 'krank');
    
          const tbody = document.querySelector('#krankTable tbody');
          if (!tbody) return;
          tbody.innerHTML = '';
    
          if (krankmeldungen.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">Keine Krankmeldungen eingetragen</td></tr>';
            return;
          }
    
          krankmeldungen.forEach(krank => {
            const row = document.createElement('tr');
            const personName = krank.mitarbeiter_name || krank.lehrling_name || 'Unbekannt';
    
            row.innerHTML = `
              <td>${personName}</td>
              <td>${this.formatDatum(krank.datum_von)}</td>
              <td>${this.formatDatum(krank.datum_bis)}</td>
              <td>${krank.beschreibung || '-'}</td>
              <td>
                <button class="btn btn-danger" onclick="app.deleteAbwesenheit(${krank.id}, 'krank')">Löschen</button>
              </td>
            `;
            tbody.appendChild(row);
          });
        } catch (error) {
          console.error('Fehler beim Laden der Krankmeldungen:', error);
        }
      },

      async loadLehrgangListe() {
        try {
          const abwesenheiten = await EinstellungenService.getAllAbwesenheiten();
          const lehrgaenge = abwesenheiten.filter(a => a.typ === 'lehrgang');
    
          const tbody = document.querySelector('#lehrgangTable tbody');
          if (!tbody) return;
          tbody.innerHTML = '';
    
          if (lehrgaenge.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">Keine Lehrgänge eingetragen</td></tr>';
            return;
          }
    
          lehrgaenge.forEach(lehrgang => {
            const row = document.createElement('tr');
            const personName = lehrgang.mitarbeiter_name || lehrgang.lehrling_name || 'Unbekannt';
    
            row.innerHTML = `
              <td>${personName}</td>
              <td>${this.formatDatum(lehrgang.datum_von)}</td>
              <td>${this.formatDatum(lehrgang.datum_bis)}</td>
              <td>${lehrgang.beschreibung || '-'}</td>
              <td>
                <button class="btn btn-danger" onclick="app.deleteAbwesenheit(${lehrgang.id}, 'lehrgang')">Löschen</button>
              </td>
            `;
            tbody.appendChild(row);
          });
        } catch (error) {
          console.error('Fehler beim Laden der Lehrgänge:', error);
        }
      },

      async loadBerufsschuleListe() {
        try {
          const abwesenheiten = await EinstellungenService.getAllAbwesenheiten();
          const berufsschule = abwesenheiten.filter(a => a.typ === 'berufsschule');
    
          const tbody = document.querySelector('#berufsschuleTable tbody');
          if (!tbody) return;
          tbody.innerHTML = '';
    
          if (berufsschule.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">Keine Berufsschul-Zeiten eingetragen</td></tr>';
            return;
          }
    
          berufsschule.forEach(bs => {
            const row = document.createElement('tr');
            const lehrlingName = bs.lehrling_name || 'Unbekannt';
    
            row.innerHTML = `
              <td>${lehrlingName}</td>
              <td>${this.formatDatum(bs.datum_von)}</td>
              <td>${this.formatDatum(bs.datum_bis)}</td>
              <td>${bs.beschreibung || '-'}</td>
              <td>
                <button class="btn btn-danger" onclick="app.deleteAbwesenheit(${bs.id}, 'berufsschule')">Löschen</button>
              </td>
            `;
            tbody.appendChild(row);
          });
        } catch (error) {
          console.error('Fehler beim Laden der Berufsschul-Zeiten:', error);
        }
      },

      async deleteAbwesenheit(id, typ) {
        const typLabels = {
          'urlaub': 'Urlaubseintrag',
          'krank': 'Krankmeldung',
          'lehrgang': 'Lehrgang',
          'berufsschule': 'Berufsschul-Zeit'
        };
        
        if (!confirm(`Möchten Sie diesen ${typLabels[typ] || 'Eintrag'} wirklich löschen?`)) {
          return;
        }
    
        try {
          await EinstellungenService.deleteAbwesenheit(id);
          alert(`${typLabels[typ] || 'Eintrag'} gelöscht.`);
    
          // Liste neu laden
          if (typ === 'urlaub') {
            this.loadUrlaubListe();
          } else if (typ === 'krank') {
            this.loadKrankListe();
          } else if (typ === 'lehrgang') {
            this.loadLehrgangListe();
          } else if (typ === 'berufsschule') {
            this.loadBerufsschuleListe();
          }
    
          this.loadDashboard();
        } catch (error) {
          console.error('Fehler beim Löschen der Abwesenheit:', error);
          alert('Abwesenheit konnte nicht gelöscht werden.');
        }
      },

      async loadBerufsschulLehrlinge() {
        try {
          const lehrlinge = await LehrlingeService.getAktive();
          const tbody = document.querySelector('#berufsschuleTable tbody');
          
          if (!tbody) {
            console.error('❌ Tbody für Berufsschul-Tabelle nicht gefunden!');
            return;
          }
          tbody.innerHTML = '';
    
          if (lehrlinge.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #666;">Keine Lehrlinge vorhanden</td></tr>';
            return;
          }
    
          // Aktuelle KW berechnen
          const aktuelleKW = this.getKalenderwoche(new Date());
          console.log('✅ Tabelle wird gefüllt mit', lehrlinge.length, 'Lehrlingen (aktuelle KW:', aktuelleKW, ')');
    
          lehrlinge.forEach(lehrling => {
            const row = document.createElement('tr');
            const schulwochen = lehrling.berufsschul_wochen || '';
            
            // Prüfe ob Lehrling gerade in Berufsschule ist
            const schulwochenArray = schulwochen.split(',').map(w => parseInt(w.trim(), 10)).filter(w => !isNaN(w));
            const istInSchule = schulwochenArray.includes(aktuelleKW);
            const statusBadge = istInSchule 
              ? '<span style="background: #1565c0; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-left: 8px;">📚 Aktuell in Schule (KW ' + aktuelleKW + ')</span>'
              : '';
    
            row.innerHTML = `
              <td>
                <strong>${lehrling.name}</strong>${statusBadge}
              </td>
              <td>
                <input type="text" 
                       id="berufsschul_${lehrling.id}" 
                       value="${schulwochen}" 
                       placeholder="z.B. 2,4,6,8,10,12"
                       style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              </td>
              <td>
                <button class="btn btn-primary" onclick="app.saveBerufsschulWochen(${lehrling.id})">💾 Speichern</button>
              </td>
            `;
            tbody.appendChild(row);
          });
        } catch (error) {
          console.error('Fehler beim Laden der Lehrlinge für Berufsschule:', error);
        }
      },

      async saveBerufsschulWochen(lehrlingId) {
        const input = document.getElementById(`berufsschul_${lehrlingId}`);
        if (!input) return;
    
        const wochen = input.value.trim();
        
        // Validierung: Nur Zahlen und Kommas erlaubt
        if (wochen && !/^(\d{1,2})(,\s*\d{1,2})*$/.test(wochen)) {
          alert('Ungültiges Format. Bitte nur Kalenderwochen komma-getrennt eingeben (z.B. 2,4,6,8,10)');
          return;
        }
    
        try {
          await LehrlingeService.update(lehrlingId, { berufsschul_wochen: wochen });
          this.showToast(`Berufsschul-Wochen für Lehrling gespeichert`, 'success');
          
          // Tabelle neu laden um Status-Badge zu aktualisieren
          this.loadBerufsschulLehrlinge();
          
          // Auch Lehrlinge-Tabelle aktualisieren falls geöffnet
          this.loadLehrlinge();
        } catch (error) {
          console.error('Fehler beim Speichern der Berufsschul-Wochen:', error);
          alert('Fehler beim Speichern. Bitte erneut versuchen.');
        }
      },

      formatDatum(datum) {
        if (!datum) return '-';
        // Reine Datums-Strings (YYYY-MM-DD) direkt parsen, kein Date-Objekt (Timezone-Bug!)
        if (typeof datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datum)) {
          const [jahr, monat, tag] = datum.split('-');
          return `${tag}.${monat}.${jahr}`;
        }
        const d = new Date(datum);
        const tag = String(d.getDate()).padStart(2, '0');
        const monat = String(d.getMonth() + 1).padStart(2, '0');
        const jahr = d.getFullYear();
        return `${tag}.${monat}.${jahr}`;
      }
  });
}
