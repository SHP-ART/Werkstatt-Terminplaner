export function installSearchFeature(AppClass) {
  Object.assign(AppClass.prototype, {
      updateTerminSuchliste() {
        const liste = document.getElementById('terminSuchListe');
        if (!liste) return;
    
        const optionen = [];
        const seen = new Set();
    
        // Kundennamen hinzufügen
        (this.kundenCache || []).forEach(kunde => {
          if (kunde.name && !seen.has(kunde.name.toLowerCase())) {
            optionen.push({ value: kunde.name, label: `${kunde.name}` });
            seen.add(kunde.name.toLowerCase());
          }
          // Kennzeichen aus Kundentabelle hinzufügen
          if (kunde.kennzeichen && !seen.has(kunde.kennzeichen.toLowerCase())) {
            optionen.push({ value: kunde.kennzeichen, label: `${kunde.kennzeichen} (${kunde.name})` });
            seen.add(kunde.kennzeichen.toLowerCase());
          }
        });
    
        // Kennzeichen aus Terminen hinzufügen
        (this.termineCache || []).forEach(termin => {
          if (termin.kennzeichen && !seen.has(termin.kennzeichen.toLowerCase())) {
            optionen.push({ value: termin.kennzeichen, label: `${termin.kennzeichen}` });
            seen.add(termin.kennzeichen.toLowerCase());
          }
        });
    
        liste.innerHTML = '';
        optionen.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.label = opt.label;
          liste.appendChild(option);
        });
      },

      handleNameSuche() {
        const eingabe = document.getElementById('terminNameSuche')?.value.trim() || '';
        const vorschlaegeDiv = document.getElementById('nameSucheVorschlaege');
        const statusBadge = document.getElementById('kundeStatusAnzeige');
        
        if (!vorschlaegeDiv) return;
        
        // Status-Badge aktualisieren
        this.updateKundeStatusBadge(eingabe, statusBadge);
        
        if (eingabe.length < 2) {
          vorschlaegeDiv.classList.remove('aktiv');
          vorschlaegeDiv.innerHTML = '';
          return;
        }
        
        const lower = eingabe.toLowerCase();
        
        // Suche in Kunden nach Name
        const treffer = (this.kundenCache || []).filter(kunde => 
          kunde.name && kunde.name.toLowerCase().includes(lower)
        ).slice(0, 10); // Max 10 Ergebnisse
        
        if (treffer.length === 0) {
          vorschlaegeDiv.innerHTML = `<div class="keine-vorschlaege" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <span>Kein Kunde gefunden</span>
            <button type="button" class="btn btn-primary" style="padding:4px 12px;font-size:0.85em;white-space:nowrap;" onmousedown="event.preventDefault()" onclick="app.openNeuerKundeModal()">➕ Jetzt anlegen</button>
          </div>`;
          vorschlaegeDiv.classList.add('aktiv');
          return;
        }
        
        vorschlaegeDiv.innerHTML = treffer.map((kunde, idx) => {
          // Fahrzeug: zuerst aus Kundenstamm, dann aus Termincache
          let kz = kunde.kennzeichen || '';
          let fzTyp = kunde.fahrzeugtyp || '';
          if (!kz) {
            const letzterTermin = (this.termineCache || [])
              .filter(t => t.kunde_id == kunde.id && t.kennzeichen)
              .sort((a, b) => (b.datum || '').localeCompare(a.datum || ''))[0];
            if (letzterTermin) {
              kz = letzterTermin.kennzeichen;
              fzTyp = fzTyp || letzterTermin.fahrzeugtyp || '';
            }
          }
          return `
          <div class="vorschlag-item" data-index="${idx}" data-kunde-id="${kunde.id}"
               onmousedown="event.preventDefault()"
               onclick="app.selectKundeVorschlag(${kunde.id})">
            <div>
              <span class="vorschlag-name">${this.highlightMatch(kunde.name, eingabe)}</span>
              ${kunde.telefon ? `<span class="vorschlag-telefon"> · ${kunde.telefon}</span>` : ''}
            </div>
            <div class="vorschlag-details">
              ${kz ? `<span class="vorschlag-kennzeichen">${kz}</span>` : ''}
              ${fzTyp ? `<span class="vorschlag-fahrzeugtyp">🚗 ${fzTyp}</span>` : ''}
            </div>
          </div>`;
        }).join('');
        
        vorschlaegeDiv.classList.add('aktiv');
        this.aktuelleVorschlaegeIndex = -1;
        this.aktuelleVorschlaege = treffer;
      },

      updateKundeStatusBadge(eingabe, statusBadge) {
        const kennzeichenField = document.getElementById('kennzeichen');
        const kennzeichenLabel = kennzeichenField?.parentElement?.querySelector('label');
        
        if (!statusBadge) return;
        
        if (!eingabe || eingabe.length < 2) {
          statusBadge.style.display = 'none';
          // Kennzeichen-Pflichtmarkierung entfernen
          this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
          return;
        }
        
        const lower = eingabe.toLowerCase();
        const kundeId = document.getElementById('kunde_id')?.value;
        
        // Prüfe ob exakter Kunde ausgewählt wurde
        if (kundeId) {
          statusBadge.textContent = '✓ Kunde ausgewählt';
          statusBadge.className = 'kunde-status-badge gefunden';
          statusBadge.style.display = 'inline-block';
          statusBadge.style.cursor = 'default';
          statusBadge.onclick = null;
          // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
          this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
          return;
        }
        
        // Prüfe ob Kunde mit genau diesem Namen existiert
        const exakterTreffer = (this.kundenCache || []).find(kunde => 
          kunde.name && kunde.name.toLowerCase() === lower
        );
        
        if (exakterTreffer) {
          statusBadge.textContent = '✓ Bekannter Kunde';
          statusBadge.className = 'kunde-status-badge gefunden';
          statusBadge.style.display = 'inline-block';
          statusBadge.style.cursor = 'default';
          statusBadge.onclick = null;
          // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
          this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
        } else {
          statusBadge.textContent = '+ Neuer Kunde';
          statusBadge.className = 'kunde-status-badge neuer-kunde';
          statusBadge.style.display = 'inline-block';
          statusBadge.style.cursor = 'pointer';
          statusBadge.title = 'Klicken zum schnellen Anlegen';
          statusBadge.onclick = () => this.openNeuerKundeModal();
          // Kennzeichen ist Pflicht bei Neukunden!
          this.setKennzeichenPflicht(true, kennzeichenField, kennzeichenLabel);
        }
      },

      setKennzeichenPflicht(isPflicht, kennzeichenField, kennzeichenLabel) {
        if (kennzeichenField) {
          if (isPflicht) {
            kennzeichenField.style.borderColor = '#ff9800';
            kennzeichenField.style.background = '#fff8e1';
            kennzeichenField.setAttribute('required', 'required');
          } else {
            kennzeichenField.style.borderColor = '';
            kennzeichenField.style.background = '';
            kennzeichenField.removeAttribute('required');
          }
        }
        
        if (kennzeichenLabel) {
          // Pflicht-Stern hinzufügen/entfernen
          const originalText = 'Kennzeichen:';
          if (isPflicht) {
            kennzeichenLabel.innerHTML = '🚗 Kennzeichen: <span style="color: #e65100; font-weight: bold;">* (Pflicht bei Neukunde)</span>';
          } else {
            kennzeichenLabel.textContent = originalText;
          }
        }
      },

      handleKennzeichenSuche() {
        const bezirk = document.getElementById('kzSucheBezirk')?.value.trim().toUpperCase() || '';
        const buchstaben = document.getElementById('kzSucheBuchstaben')?.value.trim().toUpperCase() || '';
        const nummer = document.getElementById('kzSucheNummer')?.value.trim().toUpperCase() || '';
        const vorschlaegeDiv = document.getElementById('kennzeichenSucheVorschlaege');
        
        if (!vorschlaegeDiv) return;
        
        // Mindestens ein Feld muss ausgefüllt sein
        if (!bezirk && !buchstaben && !nummer) {
          vorschlaegeDiv.classList.remove('aktiv');
          vorschlaegeDiv.innerHTML = '';
          return;
        }
        
        // Sammle alle Kennzeichen aus Kunden und Terminen
        const alleKennzeichen = new Map(); // kennzeichen -> {kunde, terminCount}
        
        // Aus Kundentabelle
        (this.kundenCache || []).forEach(kunde => {
          if (kunde.kennzeichen) {
            const kzNormalized = this.normalizeKennzeichen(kunde.kennzeichen);
            if (!alleKennzeichen.has(kzNormalized)) {
              alleKennzeichen.set(kzNormalized, {
                kennzeichen: kunde.kennzeichen,
                kundeId: kunde.id,
                kundeName: kunde.name,
                kundeTelefon: kunde.telefon,
                fahrzeugtyp: kunde.fahrzeugtyp
              });
            }
          }
        });
        
        // Aus Terminen (falls Kennzeichen nicht in Kunden)
        (this.termineCache || []).forEach(termin => {
          if (termin.kennzeichen) {
            const kzNormalized = this.normalizeKennzeichen(termin.kennzeichen);
            if (!alleKennzeichen.has(kzNormalized)) {
              alleKennzeichen.set(kzNormalized, {
                kennzeichen: termin.kennzeichen,
                kundeId: termin.kunde_id,
                kundeName: termin.kunde_name,
                kundeTelefon: null,
                fahrzeugtyp: null
              });
            }
          }
        });
        
        // Filtern nach den eingegebenen Teilen (flexible Suche)
        const treffer = [];
        alleKennzeichen.forEach((data) => {
          const kzParts = this.parseKennzeichen(data.kennzeichen);
          const normalized = this.normalizeKennzeichen(data.kennzeichen);
          
          let match = false;
          
          // Flexible Suche: Kombiniere alle eingegebenen Teile
          const suchMuster = (bezirk || '') + (buchstaben || '') + (nummer || '');
          
          if (suchMuster) {
            // Prüfe ob das Suchmuster im normalisierten Kennzeichen vorkommt
            match = normalized.includes(suchMuster);
            
            // Zusätzliche Prüfung: Einzelne Felder müssen auch passen
            if (match) {
              // Wenn separate Felder genutzt werden, prüfe auch Teilmatches
              if (bezirk && buchstaben) {
                // Beide Felder gefüllt: Bezirk muss beginnen, Buchstaben passen
                match = kzParts.bezirk.startsWith(bezirk) || normalized.startsWith(suchMuster);
              }
            }
          }
          
          if (match) {
            treffer.push(data);
          }
        });
        
        // Sortieren: exaktere Matches zuerst
        treffer.sort((a, b) => {
          const aKz = this.parseKennzeichen(a.kennzeichen);
          const bKz = this.parseKennzeichen(b.kennzeichen);
          
          // Exakte Bezirk-Matches bevorzugen
          if (bezirk) {
            const aExact = aKz.bezirk === bezirk;
            const bExact = bKz.bezirk === bezirk;
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
          }
          
          return (a.kennzeichen || '').localeCompare(b.kennzeichen || '')
        });
        
        const maxTreffer = treffer.slice(0, 10);
        const weitereAnzahl = treffer.length - maxTreffer.length;
        
        if (maxTreffer.length === 0) {
          vorschlaegeDiv.innerHTML = '<div class="keine-vorschlaege">Kein Kennzeichen gefunden</div>';
          vorschlaegeDiv.classList.add('aktiv');
          return;
        }
        
        let html = maxTreffer.map((data, idx) => `
          <div class="vorschlag-item" data-index="${idx}" onmousedown="event.preventDefault()" onclick="app.selectKennzeichenVorschlag('${data.kennzeichen.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', ${data.kundeId || 'null'})">
            <div>
              <span class="vorschlag-kennzeichen" style="margin-right: 10px;">${this.formatKennzeichenHighlight(data.kennzeichen, bezirk, buchstaben, nummer)}</span>
              <span class="vorschlag-name">${data.kundeName || 'Unbekannter Kunde'}</span>
            </div>
            ${data.kundeTelefon ? `<span class="vorschlag-telefon">${data.kundeTelefon}</span>` : ''}
          </div>
        `).join('');
        
        // Hinweis anzeigen wenn es mehr als 10 Treffer gibt
        if (weitereAnzahl > 0) {
          html += `<div class="weitere-treffer-hinweis">+ ${weitereAnzahl} weitere Treffer – bitte Suche eingrenzen</div>`;
        }
        
        vorschlaegeDiv.innerHTML = html;
        
        vorschlaegeDiv.classList.add('aktiv');
        this.aktuelleKzVorschlaegeIndex = -1;
        this.aktuelleKzVorschlaege = maxTreffer;
      },

      formatKennzeichenHighlight(kz, bezirk, buchstaben, nummer) {
        // Zeige das Original-Kennzeichen mit Highlighting statt neu zusammenzubauen
        if (!bezirk && !buchstaben && !nummer) {
          return kz; // Keine Suche, zeige Original
        }
        
        // Baue Suchmuster und highlighte im Original
        const suchMuster = (bezirk || '') + (buchstaben || '') + (nummer || '');
        const normalized = this.normalizeKennzeichen(kz);
        
        // Finde Position des Suchmusters im normalisierten Kennzeichen
        const pos = normalized.indexOf(suchMuster.toUpperCase());
        
        if (pos === -1) {
          return kz; // Kein Match, zeige Original
        }
        
        // Highlighte den gefundenen Teil im Original-Kennzeichen
        // Zähle Zeichen im Original bis zur Match-Position (überspringe Leerzeichen/Bindestriche)
        let origPos = 0;
        let normPos = 0;
        
        // Finde Start-Position im Original
        while (normPos < pos && origPos < kz.length) {
          const char = kz[origPos];
          if (char !== ' ' && char !== '-') {
            normPos++;
          }
          origPos++;
        }
        
        const startPos = origPos;
        let matchLength = 0;
        let charsCounted = 0;
        
        // Finde End-Position im Original
        while (charsCounted < suchMuster.length && origPos < kz.length) {
          const char = kz[origPos];
          if (char !== ' ' && char !== '-') {
            charsCounted++;
          }
          matchLength++;
          origPos++;
        }
        
        // Baue Ergebnis mit Highlight
        const before = kz.substring(0, startPos);
        const match = kz.substring(startPos, startPos + matchLength);
        const after = kz.substring(startPos + matchLength);
        
        return `${before}<span class="vorschlag-match">${match}</span>${after}`;
      },

      handleSucheKeydown(e, type) {
        const vorschlaegeDiv = type === 'name' 
          ? document.getElementById('nameSucheVorschlaege')
          : document.getElementById('kennzeichenSucheVorschlaege');
        
        if (!vorschlaegeDiv || !vorschlaegeDiv.classList.contains('aktiv')) return;
        
        const items = vorschlaegeDiv.querySelectorAll('.vorschlag-item');
        if (items.length === 0) return;
        
        const indexKey = type === 'name' ? 'aktuelleVorschlaegeIndex' : 'aktuelleKzVorschlaegeIndex';
        
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this[indexKey] = Math.min(this[indexKey] + 1, items.length - 1);
          this.updateVorschlaegeHighlight(items, this[indexKey]);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this[indexKey] = Math.max(this[indexKey] - 1, 0);
          this.updateVorschlaegeHighlight(items, this[indexKey]);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this[indexKey] >= 0 && items[this[indexKey]]) {
            const item = items[this[indexKey]];
            if (type === 'name') {
              // Direkt aufrufen statt .click(), da kein onclick mehr vorhanden
              const kundeId = parseInt(item.dataset.kundeId, 10);
              if (!isNaN(kundeId)) this.selectKundeVorschlag(kundeId);
            } else {
              item.click();
            }
          }
        } else if (e.key === 'Escape') {
          this.hideVorschlaege(type);
        }
      },

      updateVorschlaegeHighlight(items, index) {
        items.forEach((item, i) => {
          item.classList.toggle('ausgewaehlt', i === index);
        });
        if (items[index]) {
          items[index].scrollIntoView({ block: 'nearest' });
        }
      },

      hideVorschlaege(type) {
        const vorschlaegeDiv = type === 'name' 
          ? document.getElementById('nameSucheVorschlaege')
          : document.getElementById('kennzeichenSucheVorschlaege');
        
        if (vorschlaegeDiv) {
          vorschlaegeDiv.classList.remove('aktiv');
        }
      },

      updateSuchListe() {
        const liste = document.getElementById('terminSuchListe');
        if (!liste) return;
    
        const optionen = [];
        const seen = new Set();
    
        // Kundennamen hinzufügen
        (this.kundenCache || []).forEach(kunde => {
          if (kunde.name && !seen.has(kunde.name.toLowerCase())) {
            optionen.push({ value: kunde.name, label: `${kunde.name}` });
            seen.add(kunde.name.toLowerCase());
          }
          // Kennzeichen aus Kundentabelle hinzufügen
          if (kunde.kennzeichen && !seen.has(kunde.kennzeichen.toLowerCase())) {
            optionen.push({ value: kunde.kennzeichen, label: `${kunde.kennzeichen} (${kunde.name})` });
            seen.add(kunde.kennzeichen.toLowerCase());
          }
        });
    
        // Kennzeichen aus Terminen hinzufügen
        (this.termineCache || []).forEach(termin => {
          if (termin.kennzeichen && !seen.has(termin.kennzeichen.toLowerCase())) {
            optionen.push({ value: termin.kennzeichen, label: `${termin.kennzeichen}` });
            seen.add(termin.kennzeichen.toLowerCase());
          }
        });
    
        liste.innerHTML = '';
        optionen.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.label = opt.label;
          liste.appendChild(option);
        });
      },

      handleTerminSchnellsuche() {
        const eingabe = document.getElementById('terminSchnellsuche')?.value.trim() || '';
        // Leite auf neue Suche um
        if (!eingabe) {
          this.hideGefundenerKunde();
          return;
        }
        
        // Prüfe ob es wie ein Kennzeichen aussieht
        const siehtAusWieKennzeichen = /^[A-ZÄÖÜ]{1,3}[\s\-]?[A-ZÄÖÜ]{1,2}[\s\-]?\d/.test(eingabe.toUpperCase());
        
        if (siehtAusWieKennzeichen) {
          // Setze in Kennzeichen-Felder
          const parts = this.parseKennzeichen(eingabe);
          document.getElementById('kzSucheBezirk').value = parts.bezirk;
          document.getElementById('kzSucheBuchstaben').value = parts.buchstaben;
          document.getElementById('kzSucheNummer').value = parts.nummer;
          this.handleKennzeichenSuche();
        } else {
          // Setze in Namenssuche
          document.getElementById('terminNameSuche').value = eingabe;
          this.handleNameSuche();
        }
      },

      handleTerminSchnellsucheOld() {
        const eingabe = document.getElementById('terminSchnellsuche')?.value.trim();
        if (!eingabe) {
          this.hideGefundenerKunde();
          return;
        }
        if (!eingabe) {
          this.hideGefundenerKunde();
          return;
        }
    
        const lower = eingabe.toLowerCase();
        
        // Erst exakter Match versuchen
        let kundeMatch = (this.kundenCache || []).find(kunde => kunde.name && kunde.name.toLowerCase() === lower);
        
        // Falls kein exakter Match, Teilsuche (beginnt mit oder enthält)
        if (!kundeMatch) {
          kundeMatch = (this.kundenCache || []).find(kunde => 
            kunde.name && kunde.name.toLowerCase().includes(lower)
          );
        }
        
        // Suche auch nach Kennzeichen in Kundendaten (normalisiert)
        if (!kundeMatch) {
          const normalizedInput = eingabe.replace(/[\s\-]/g, '').toLowerCase();
          kundeMatch = (this.kundenCache || []).find(kunde => 
            kunde.kennzeichen && kunde.kennzeichen.replace(/[\s\-]/g, '').toLowerCase() === normalizedInput
          );
        }
        
        if (kundeMatch) {
          document.getElementById('kunde_id').value = kundeMatch.id;
          document.getElementById('neuer_kunde_telefon').value = kundeMatch.telefon || '';
          this.showGefundenerKunde(kundeMatch.name, kundeMatch.telefon);
    
          // Erst Kennzeichen aus Kundendaten prüfen, dann aus Terminen
          let kennzeichen = kundeMatch.kennzeichen || null;
          if (!kennzeichen) {
            kennzeichen = this.findLetztesKennzeichen(kundeMatch.id, kundeMatch.name);
          }
          
          if (kennzeichen) {
            document.getElementById('kennzeichen').value = kennzeichen;
          }
          
          // Fahrzeugtyp aus Kundendaten setzen
          if (kundeMatch.fahrzeugtyp) {
            document.getElementById('fahrzeugtyp').value = kundeMatch.fahrzeugtyp;
          }
    
          // Finde und zeige letzten KM-Stand als Hinweis (grau)
          const letzterKmStand = this.findLetztenKmStand(kundeMatch.id, kundeMatch.name, kennzeichen);
          const kmStandInput = document.getElementById('kilometerstand');
          if (letzterKmStand && kmStandInput) {
            kmStandInput.value = ''; // Leeres value - wird nicht submitted
            kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
            kmStandInput.classList.add('has-previous-value');
          }
          
          return;
        }
    
        // Suche Kennzeichen in Terminen (normalisiert: ohne Leerzeichen und Bindestriche)
        const normalizedLower = eingabe.replace(/[\s\-]/g, '').toLowerCase();
        const terminMatch = (this.termineCache || []).find(termin =>
          termin.kennzeichen && termin.kennzeichen.replace(/[\s\-]/g, '').toLowerCase() === normalizedLower
        );
        if (terminMatch) {
          document.getElementById('kennzeichen').value = terminMatch.kennzeichen;
          if (terminMatch.kunde_id && this.kundenCache.length > 0) {
            const kunde = this.kundenCache.find(k => k.id === terminMatch.kunde_id);
            if (kunde) {
              document.getElementById('kunde_id').value = kunde.id;
              document.getElementById('neuer_kunde_telefon').value = kunde.telefon || '';
              this.showGefundenerKunde(kunde.name, kunde.telefon);
              
              // Fahrzeugtyp aus Kundendaten setzen
              if (kunde.fahrzeugtyp) {
                document.getElementById('fahrzeugtyp').value = kunde.fahrzeugtyp;
              }
    
              // Finde und zeige letzten KM-Stand als Hinweis (grau)
              const letzterKmStand = this.findLetztenKmStand(kunde.id, kunde.name, terminMatch.kennzeichen);
              const kmStandInput = document.getElementById('kilometerstand');
              if (letzterKmStand && kmStandInput) {
                kmStandInput.value = ''; // Leeres value - wird nicht submitted
                kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
                kmStandInput.classList.add('has-previous-value');
              }
            }
          } else if (terminMatch.kunde_name) {
            document.getElementById('kunde_id').value = '';
            document.getElementById('terminSchnellsuche').value = terminMatch.kunde_name;
            this.showGefundenerKunde(terminMatch.kunde_name, null);
          }
          return;
        }
        
        // Suche Kennzeichen direkt in Kundentabelle (für importierte Kunden ohne Termine)
        // Normalisiert: ohne Leerzeichen und Bindestriche
        const kundeByKennzeichen = (this.kundenCache || []).find(kunde =>
          kunde.kennzeichen && kunde.kennzeichen.replace(/[\s\-]/g, '').toLowerCase() === normalizedLower
        );
        if (kundeByKennzeichen) {
          document.getElementById('kennzeichen').value = kundeByKennzeichen.kennzeichen;
          document.getElementById('kunde_id').value = kundeByKennzeichen.id;
          document.getElementById('neuer_kunde_telefon').value = kundeByKennzeichen.telefon || '';
          this.showGefundenerKunde(kundeByKennzeichen.name, kundeByKennzeichen.telefon);
          
          // Fahrzeugtyp aus Kundendaten setzen
          if (kundeByKennzeichen.fahrzeugtyp) {
            document.getElementById('fahrzeugtyp').value = kundeByKennzeichen.fahrzeugtyp;
          }
          
          // Finde und zeige letzten KM-Stand als Hinweis (grau)
          const letzterKmStand = this.findLetztenKmStand(kundeByKennzeichen.id, kundeByKennzeichen.name, kundeByKennzeichen.kennzeichen);
          const kmStandInput = document.getElementById('kilometerstand');
          if (letzterKmStand && kmStandInput) {
            kmStandInput.value = '';
            kmStandInput.placeholder = `Letzter KM-Stand: ${letzterKmStand.toLocaleString('de-DE')} km`;
            kmStandInput.classList.add('has-previous-value');
          }
          
          return;
        }
    
        const siehtWieKennzeichenAus = /\d/.test(eingabe) || eingabe.includes('-');
        if (siehtWieKennzeichenAus) {
          document.getElementById('kennzeichen').value = eingabe;
          document.getElementById('kunde_id').value = '';
          document.getElementById('terminSchnellsuche').value = '';
          this.hideGefundenerKunde();
        } else {
          document.getElementById('kunde_id').value = '';
          document.getElementById('terminSchnellsuche').value = eingabe;
          this.hideGefundenerKunde();
        }
        this.updateSchnellsucheStatus();
      },

      showGefundenerKunde(name, telefon, fahrzeug = null, kundeId = null) {
        const anzeige = document.getElementById('gefundenerKundeAnzeige');
        const nameEl = document.getElementById('gefundenerKundeName');
        const telefonEl = document.getElementById('gefundenerKundeTelefon');
        
        if (anzeige && nameEl) {
          anzeige.style.display = 'block';
          nameEl.textContent = name || 'Unbekannt';
          if (telefonEl) {
            telefonEl.textContent = telefon ? `📞 ${telefon}` : '';
          }
          
          // Fahrzeug-Info und Wechsel-Button anzeigen
          let fahrzeugInfoEl = document.getElementById('gefundenerKundeFahrzeug');
          if (!fahrzeugInfoEl) {
            fahrzeugInfoEl = document.createElement('div');
            fahrzeugInfoEl.id = 'gefundenerKundeFahrzeug';
            fahrzeugInfoEl.style.cssText = 'margin-top:6px; font-size:0.9em; display:flex; align-items:center; gap:8px;';
            anzeige.appendChild(fahrzeugInfoEl);
          }
          
          if (fahrzeug && fahrzeug.kennzeichen) {
            const kzText = `🚗 ${fahrzeug.kennzeichen}${fahrzeug.fahrzeugtyp ? ' – ' + fahrzeug.fahrzeugtyp : ''}`;
            const wechselBtn = kundeId
              ? `<button type="button" onclick="app.fahrzeugWechseln(${kundeId})" style="font-size:0.85em;padding:2px 8px;background:#fff;border:1px solid #4caf50;border-radius:4px;color:#2e7d32;cursor:pointer;">🔄 Wechseln</button>`
              : '';
            fahrzeugInfoEl.innerHTML = `<span style="color:#2e7d32;font-weight:600;">${kzText}</span>${wechselBtn}`;
          } else {
            fahrzeugInfoEl.innerHTML = '';
          }
        }
      },

      hideGefundenerKunde() {
        const anzeige = document.getElementById('gefundenerKundeAnzeige');
        if (anzeige) {
          anzeige.style.display = 'none';
        }
      },

      updateSchnellsucheStatus() {
        const eingabe = document.getElementById('terminSchnellsuche').value.trim();
        const statusEl = document.getElementById('schnellsucheStatus');
        
        if (!statusEl) return;
        
        if (!eingabe) {
          statusEl.style.display = 'none';
          return;
        }
        
        const lower = eingabe.toLowerCase();
        
        // Prüfe ob Kunde existiert (exakt oder Teilmatch)
        let kundeMatch = (this.kundenCache || []).find(kunde => 
          kunde.name && kunde.name.toLowerCase() === lower
        );
        if (!kundeMatch) {
          kundeMatch = (this.kundenCache || []).find(kunde => 
            kunde.name && kunde.name.toLowerCase().includes(lower)
          );
        }
        // Suche auch nach Kennzeichen in Kundendaten
        if (!kundeMatch) {
          kundeMatch = (this.kundenCache || []).find(kunde => 
            kunde.kennzeichen && kunde.kennzeichen.toLowerCase() === lower
          );
        }
        
        if (kundeMatch) {
          statusEl.textContent = '✓ Kunde gefunden';
          statusEl.className = 'schnellsuche-status gefunden';
          statusEl.style.display = 'inline-block';
          return;
        }
        
        // Prüfe ob Kennzeichen existiert in Terminen
        const terminMatch = (this.termineCache || []).find(termin =>
          termin.kennzeichen && termin.kennzeichen.toLowerCase() === lower
        );
        
        if (terminMatch) {
          statusEl.textContent = '✓ Kennzeichen gefunden';
          statusEl.className = 'schnellsuche-status kennzeichen';
          statusEl.style.display = 'inline-block';
          return;
        }
        
        // Sieht es nach einem Kennzeichen aus?
        const siehtWieKennzeichenAus = /\d/.test(eingabe) || eingabe.includes('-');
        
        if (siehtWieKennzeichenAus) {
          statusEl.textContent = '+ Neues Kennzeichen';
          statusEl.className = 'schnellsuche-status kennzeichen';
          statusEl.style.display = 'inline-block';
        } else {
          statusEl.textContent = '+ Neuer Kunde';
          statusEl.className = 'schnellsuche-status neu';
          statusEl.style.display = 'inline-block';
        }
      },

      findLetztesKennzeichen(kundeId, kundeName) {
        const termine = (this.termineCache || []).filter(t => {
          if (kundeId && t.kunde_id) {
            return t.kunde_id === kundeId;
          }
          return kundeName && t.kunde_name && t.kunde_name === kundeName;
        });
    
        if (termine.length === 0) return null;
    
        let letztes = termine[0];
        termine.forEach(t => {
          if (new Date(t.datum) > new Date(letztes.datum)) {
            letztes = t;
          }
        });
        return letztes.kennzeichen;
      },

      findLetztenKmStand(kundeId, kundeName, kennzeichen) {
        const termine = (this.termineCache || []).filter(t => {
          // Filter nach Kunde UND Kennzeichen für präzisere Ergebnisse
          const kundeMatch = (kundeId && t.kunde_id === kundeId) ||
                             (kundeName && t.kunde_name === kundeName);
          const kennzeichenMatch = kennzeichen && t.kennzeichen &&
                                   t.kennzeichen.toLowerCase() === kennzeichen.toLowerCase();
    
          return kundeMatch && kennzeichenMatch && t.kilometerstand;
        });
    
        if (termine.length === 0) return null;
    
        // Finde den neuesten Termin mit KM-Stand
        let letztes = termine[0];
        termine.forEach(t => {
          if (new Date(t.datum) > new Date(letztes.datum)) {
            letztes = t;
          }
        });
    
        return letztes.kilometerstand;
      },

      setupGlobaleSuche() {
        const input = document.getElementById('globalesSuchfeld');
        if (!input) return;
        let debounceTimer;
        input.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => this.executeGlobaleSuche(input.value), 300);
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            input.value = '';
            const dropdown = document.getElementById('sucheDropdown');
            if (dropdown) dropdown.style.display = 'none';
          }
        });
        document.addEventListener('click', (e) => {
          if (!e.target.closest('#globaleSucheContainer')) {
            const dropdown = document.getElementById('sucheDropdown');
            if (dropdown) dropdown.style.display = 'none';
          }
        });
      },

      async executeGlobaleSuche(q) {
        const dropdown = document.getElementById('sucheDropdown');
        if (!dropdown) return;
        if (!q || q.length < 2) { dropdown.style.display = 'none'; return; }
        try {
          const data = await window.SucheService.suche(q);
          const sections = [];
          if (data.kunden && data.kunden.length > 0) {
            sections.push('<div class="suche-gruppe"><div class="suche-gruppe-titel">👤 Kunden</div>' +
              data.kunden.map(k => `<div class="suche-item" onclick="app._sucheNavigate('kunden',${k.id})">${this._escapeHtml(k.name)}${k.telefon ? ` · ${this._escapeHtml(k.telefon)}` : ''}</div>`).join('') + '</div>');
          }
          if (data.fahrzeuge && data.fahrzeuge.length > 0) {
            sections.push('<div class="suche-gruppe"><div class="suche-gruppe-titel">🚗 Fahrzeuge</div>' +
              data.fahrzeuge.map(f => `<div class="suche-item" onclick="app._sucheNavigate('fahrzeuge','${this._escapeHtml(f.kennzeichen)}')">${this._escapeHtml(f.kennzeichen)}${f.modell ? ` – ${this._escapeHtml(f.modell)}` : ''}</div>`).join('') + '</div>');
          }
          if (data.termine && data.termine.length > 0) {
            sections.push('<div class="suche-gruppe"><div class="suche-gruppe-titel">📅 Termine</div>' +
              data.termine.map(t => `<div class="suche-item" onclick="app._sucheNavigate('termine',${t.id})">#${t.id} ${this._escapeHtml(t.kunde_name || '')} – ${this._escapeHtml(t.arbeit || '').slice(0,40)}</div>`).join('') + '</div>');
          }
          if (sections.length === 0) {
            dropdown.innerHTML = '<div class="suche-kein-ergebnis">Keine Ergebnisse gefunden</div>';
          } else {
            dropdown.innerHTML = sections.join('');
          }
          dropdown.style.display = 'block';
        } catch (e) {
          dropdown.style.display = 'none';
        }
      },

      _sucheNavigate(bereich, id) {
        const dropdown = document.getElementById('sucheDropdown');
        if (dropdown) dropdown.style.display = 'none';
        const input = document.getElementById('globalesSuchfeld');
        if (input) input.value = '';
        // Tab wechseln und Datensatz auswählen
        if (bereich === 'kunden') {
          this._openVerlaufModal({ kunde_id: id });
        } else if (bereich === 'fahrzeuge') {
          this._openVerlaufModal({ kennzeichen: id });
        } else if (bereich === 'termine') {
          this.showTerminDetails(id);
        }
      },

      async _openVerlaufModal(params) {
        const modal = document.getElementById('verlaufModal');
        const titel = document.getElementById('verlaufModalTitel');
        const inhalt = document.getElementById('verlaufModalInhalt');
        if (!modal) return;
        inhalt.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">Wird geladen...</div>';
        modal.style.display = 'block';
        try {
          const data = await window.SucheService.verlauf(params);
          const info = data.info || {};
          const termine = data.termine || [];
    
          if (params.kunde_id) {
            titel.textContent = `📋 Terminverlauf: ${info.name || 'Kunde'}`;
          } else {
            titel.textContent = `🚗 Terminverlauf: ${info.kennzeichen || params.kennzeichen}`;
          }
    
          if (termine.length === 0) {
            inhalt.innerHTML = '<div style="text-align:center;color:#999;padding:30px;">Keine Termine gefunden.</div>';
            return;
          }
    
          const statusBadge = (s) => {
            const map = { abgeschlossen: '#2e7d32', geplant: '#1565c0', 'in-arbeit': '#e65100', storniert: '#b71c1c' };
            return `<span style="background:${map[s]||'#555'};color:#fff;padding:2px 8px;border-radius:10px;font-size:0.78em;">${s}</span>`;
          };
    
          const rows = termine.map(t => `
            <tr style="border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="app._openVerlaufModalTermin(${t.id})">
              <td style="padding:8px 10px;white-space:nowrap;">${t.datum ? t.datum.slice(0,10) : '–'}</td>
              <td style="padding:8px 10px;">${this._escapeHtml(t.arbeit || '').slice(0,50)}</td>
              <td style="padding:8px 4px;">${statusBadge(t.status)}</td>
              ${params.kennzeichen ? '' : `<td style="padding:8px 10px;color:#666;font-size:0.85em;">${this._escapeHtml(t.kennzeichen || '')}</td>`}
              <td style="padding:8px 10px;text-align:right;">
                <button onclick="event.stopPropagation();app._openVerlaufModalTermin(${t.id})" style="background:#1565c0;color:#fff;border:none;padding:3px 10px;border-radius:5px;cursor:pointer;font-size:0.82em;">Details</button>
              </td>
            </tr>`).join('');
    
          inhalt.innerHTML = `
            ${info.telefon ? `<div style="margin-bottom:12px;color:#555;font-size:0.9em;">📞 ${this._escapeHtml(info.telefon)}${info.email ? ` · ✉️ ${this._escapeHtml(info.email)}` : ''}</div>` : ''}
            <div style="margin-bottom:8px;font-size:0.85em;color:#888;">${termine.length} Termin(e) gefunden – klicken für Details</div>
            <table style="width:100%;border-collapse:collapse;font-size:0.9em;">
              <thead>
                <tr style="background:#f5f5f5;font-weight:600;">
                  <th style="padding:8px 10px;text-align:left;">Datum</th>
                  <th style="padding:8px 10px;text-align:left;">Arbeit</th>
                  <th style="padding:8px 4px;text-align:left;">Status</th>
                  ${params.kennzeichen ? '' : '<th style="padding:8px 10px;text-align:left;">Kennz.</th>'}
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`;
        } catch (err) {
          inhalt.innerHTML = `<div style="color:#c62828;padding:20px;">Fehler: ${err.message}</div>`;
        }
      },

      _openVerlaufModalTermin(terminId) {
        document.getElementById('verlaufModal').style.display = 'none';
        this.showTerminDetails(terminId);
      }
  });
}
