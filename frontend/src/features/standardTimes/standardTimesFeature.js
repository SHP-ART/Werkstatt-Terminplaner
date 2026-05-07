export function installStandardTimesFeature(AppClass) {
  AppClass.prototype.loadArbeitszeiten = async function() {
  try {
    const arbeitszeiten = await ArbeitszeitenService.getAll();
    this.arbeitszeiten = arbeitszeiten;

    const arbeitListe = document.getElementById('arbeitListe');
    if (arbeitListe) {
      arbeitListe.innerHTML = '';
      arbeitszeiten.forEach(arbeit => {
        const option = document.createElement('option');
        option.value = arbeit.bezeichnung;
        arbeitListe.appendChild(option);
        
        // Auch Aliase als Optionen hinzufügen
        if (arbeit.aliase) {
          arbeit.aliase.split(',').forEach(alias => {
            const aliasOption = document.createElement('option');
            aliasOption.value = alias.trim();
            arbeitListe.appendChild(aliasOption);
          });
        }
      });
    }

    const arbeitszeitenTable = document.getElementById('arbeitszeitenTable');
    if (arbeitszeitenTable) {
      const tbody = arbeitszeitenTable.getElementsByTagName('tbody')[0];
      tbody.innerHTML = '';
      arbeitszeiten.forEach(arbeit => {
        const row = tbody.insertRow();
        const stundenWert = (arbeit.standard_minuten / 60).toFixed(2);
        row.innerHTML = `
          <td>
            <input type="text"
                   id="bezeichnung_${arbeit.id}"
                   data-id="${arbeit.id}"
                   value="${arbeit.bezeichnung}"
                   style="width: 100%; min-width: 150px; padding: 8px;">
          </td>
          <td>
            <input type="text"
                   id="aliase_${arbeit.id}"
                   data-id="${arbeit.id}"
                   value="${arbeit.aliase || ''}"
                   placeholder="z.B. Service, DS, Durchsicht"
                   title="Mehrere Suchbegriffe durch Komma getrennt"
                   style="width: 100%; min-width: 200px; padding: 8px;">
          </td>
          <td>
            <input type="number"
                   id="zeit_${arbeit.id}"
                   data-id="${arbeit.id}"
                   value="${stundenWert}"
                   min="0.01"
                   step="0.25"
                   placeholder="z.B. 0.25"
                   title="Eingabe in Stunden (z.B. 0.25 = 15 Min, 0.5 = 30 Min, 1 = 60 Min)"
                   style="width: 120px; padding: 8px;">
          </td>
          <td>
            <button class="btn btn-danger delete-arbeitszeit-btn" data-id="${arbeit.id}" style="padding: 6px 12px; font-size: 14px;">🗑️ Löschen</button>
          </td>
        `;
      });

      // Event-Listener für alle Löschen-Buttons hinzufügen
      // Entferne zuerst alle vorhandenen Listener, um Duplikate zu vermeiden
      tbody.querySelectorAll('.delete-arbeitszeit-btn').forEach(btn => {
        // Klone den Button, um alle Event-Listener zu entfernen
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const idStr = newBtn.dataset.id;
          const id = parseInt(idStr, 10);
          
          if (Number.isFinite(id) && id > 0) {
            this.deleteArbeitszeit(id);
          } else {
            alert('Fehler: Ungültige ID - ' + idStr);
          }
        });
      });
    }
  } catch (error) {
    console.error('Fehler beim Laden der Arbeitszeiten:', error);
  }
}

// Diese Funktion ist jetzt in loadTermine() integriert;

  AppClass.prototype.loadTermineZeiten = async function() {
  // Rufe loadTermine() auf, da die Tabelle jetzt in Zeitverwaltung ist
  await this.loadTermine();
};

  AppClass.prototype.updateZeitschaetzung = async function() {
  const arbeitEingabe = document.getElementById('arbeitEingabe');
  const zeitschaetzungAnzeige = document.getElementById('zeitschaetzungAnzeige');
  const zeitschaetzungWert = document.getElementById('zeitschaetzungWert');
  const zeitschaetzungDetails = document.getElementById('zeitschaetzungDetails');
  
  if (!arbeitEingabe || !zeitschaetzungAnzeige) return;
  
  const eingabe = arbeitEingabe.value.trim();
  
  // Wenn keine Eingabe, verstecke die Anzeige
  if (!eingabe) {
    zeitschaetzungAnzeige.style.display = 'none';
    const autoInput = document.getElementById('geschaetzte_zeit_auto');
    if (autoInput) autoInput.value = '0';
    return;
  }
  
  // Teile die Eingabe in einzelne Arbeiten auf (nach Zeilenumbruch oder Komma)
  const arbeiten = eingabe
    .split(/[\r\n,]+/)
    .map(a => a.trim())
    .filter(a => a.length > 0);
  
  if (arbeiten.length === 0) {
    zeitschaetzungAnzeige.style.display = 'none';
    const autoInput = document.getElementById('geschaetzte_zeit_auto');
    if (autoInput) autoInput.value = '0';
    return;
  }
  
  // Berechne die Zeiten für jede Arbeit
  let gesamtMinuten = 0;
  const items = [];
  const nichtGefunden = [];
  const gefundenArbeiten = []; // für KI-Vergleich

  arbeiten.forEach(arbeit => {
    // Suche mit Fuzzy-Matching (exakt → Alias → Teilwort/Wort-Überlappung)
    const gefunden = this.findArbeitszeitMitDetails(arbeit);

    if (gefunden) {
      const minuten = gefunden.standard_minuten || 0;
      gesamtMinuten += minuten;
      let hinweis = '';
      if (gefunden.matchTyp === 'alias') hinweis = ` → ${gefunden.bezeichnung}`;
      else if (gefunden.matchTyp === 'fuzzy') hinweis = ` ≈ ${gefunden.bezeichnung}`;
      items.push({ arbeit, minuten, labelHtml: `✓ ${arbeit}${hinweis}: `, manualOverride: false });
      gefundenArbeiten.push({ arbeit, itemIdx: items.length - 1, zeitverwaltungMinuten: minuten, hinweis });
    } else {
      nichtGefunden.push(arbeit);
      items.push({ arbeit, minuten: 0, labelHtml: `⚠️ ${arbeit}: `, noTime: true, manualOverride: false });
    }
  });

  // Speichere Richtzeit-Basis (Zeitverwaltungs-Summe) vor KI-Override
  let richtzeitBasis = gesamtMinuten;

  // 📊 KI-Zeitvorschlag für ALLE Arbeiten (KI = primäre Basis):
  const alleArbeiten = [...gefundenArbeiten.map(g => g.arbeit), ...nichtGefunden];
  if (alleArbeiten.length > 0) {
    try {
      const kiErgebnisse = await Promise.allSettled(
        alleArbeiten.map(a => window.AIService.getZeitVorschlag(a))
      );
      kiErgebnisse.forEach((result, i) => {
        const arbeit = alleArbeiten[i];
        if (result.status !== 'fulfilled' || !result.value?.minuten) return;
        const { minuten, basis, n } = result.value;
        const std = Math.floor(minuten / 60);
        const min = minuten % 60;
        const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
        const quellLabel = basis === 'historisch' ? `aus ${n} Terminen`
          : basis === 'historisch_ähnlich' ? `ähnl. Arbeit`
          : `Kategorie-Schätzung`;

        const gefundenEintrag = gefundenArbeiten.find(g => g.arbeit === arbeit);
        if (gefundenEintrag) {
          gesamtMinuten -= gefundenEintrag.zeitverwaltungMinuten;
          gesamtMinuten += minuten;
          items[gefundenEintrag.itemIdx].minuten = minuten;
          items[gefundenEintrag.itemIdx].labelHtml = `📊 ${arbeit}${gefundenEintrag.hinweis} <small style="color:#888">(${quellLabel})</small>: `;
        } else {
          gesamtMinuten += minuten;
          richtzeitBasis += minuten;
          const idx = items.findIndex(it => it.noTime && it.arbeit === arbeit);
          if (idx !== -1) {
            items[idx].minuten = minuten;
            items[idx].labelHtml = `📊 ${arbeit} <small style="color:#888">(${quellLabel})</small>: `;
            delete items[idx].noTime;
          }
        }
      });
    } catch (e) { /* KI-Zeitvorschlag nicht kritisch */ }
  }

  // 🧠 Puffer-ML: KI-basierten Puffer abfragen wenn aktiviert
  const pufferMLAktiv = document.getElementById('pufferMLEnabled')?.checked;
  let mlPufferMinuten = 0;
  let pufferHtml = '';
  if (pufferMLAktiv && gesamtMinuten > 0 && eingabe.length > 2) {
    try {
      const empfehlung = await window.AIService.getPufferEmpfehlung(eingabe);
      if (empfehlung && empfehlung.puffer_minuten > 0) {
        mlPufferMinuten = empfehlung.puffer_minuten;
        const basis = empfehlung.basis === 'ML' ? '🧠 ML' : '📊 Standard';
        pufferHtml = `<div style="font-size:0.82em;color:#aaa;margin-top:2px;">+ Puffer (${basis}, ${empfehlung.kategorie}): +${mlPufferMinuten} min</div>`;
      }
    } catch (e) { /* Puffer-Abfrage nicht kritisch */ }
  }

  // Anzeige + State speichern + rendern
  zeitschaetzungAnzeige.style.display = 'block';
  this._zeitState = { items, mlPufferMinuten, richtzeitBasis, pufferHtml };
  this._renderZeitItems('neu');
};

  AppClass.prototype._buildZeitItemSpan = function(item, idx, ctx) {
  if (item.noTime && item.minuten === 0) {
    return `<span style="color:#bbb;cursor:pointer;border-bottom:1px dotted #ccc;" title="Klicken zum manuellen Eingeben" onclick="app.editArbeitZeit(this,${idx},'${ctx}')">⚠️ ${item.arbeit}: keine Standardzeit ✎</span>`;
  }
  const std = Math.floor(item.minuten / 60);
  const min = item.minuten % 60;
  const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
  const editHint = item.manualOverride
    ? ' <span style="color:#f59e0b;font-size:0.85em;" title="Manuell angepasst">✎</span>'
    : ' <span style="color:#ccc;font-size:0.8em;">✎</span>';
  return `<span style="cursor:pointer;border-bottom:1px dotted #bbb;padding-bottom:1px;white-space:nowrap;" title="Klicken zum Anpassen" onclick="app.editArbeitZeit(this,${idx},'${ctx}')">${item.labelHtml}<strong>${zeitStr}</strong>${editHint}</span>`;
};

  AppClass.prototype._renderZeitItems = function(ctx) {
  const state = ctx === 'neu' ? this._zeitState : this._editZeitState;
  if (!state) return;
  const czId = ctx === 'neu' ? 'geschaetzte_zeit' : 'edit_geschaetzte_zeit';
  const autoId = ctx === 'neu' ? 'geschaetzte_zeit_auto' : 'edit_geschaetzte_zeit_auto';
  const deltaId = ctx === 'neu' ? 'zeitschaetzungDelta' : 'editZeitschaetzungDelta';
  const detailsElId = ctx === 'neu' ? 'zeitschaetzungDetails' : 'editZeitschaetzungDetails';
  const detailsEl = document.getElementById(detailsElId);
  if (!detailsEl) return;

  const totalMin = state.items.reduce((sum, it) => sum + (it.noTime ? 0 : it.minuten), 0) + state.mlPufferMinuten;

  // Per-Work klickbare Spans
  const spans = state.items.map((item, idx) => this._buildZeitItemSpan(item, idx, ctx));
  const perWorkHtml = spans.length > 0
    ? `<div style="font-size:0.82em;color:#aaa;margin-bottom:8px;">${spans.join(' | ')}</div>`
    : '';

  // KI-Chip (aktueller Gesamtwert)
  const std = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  const kiZeitStr = totalMin === 0 ? '0 min'
    : std === 0 ? `${min} min`
    : min === 0 ? `${std} h`
    : `${std} h ${min} min`;
  const kiChip = totalMin > 0
    ? `<button type="button" onclick="app.setZeitkorrektur('${czId}','${autoId}','${deltaId}',${totalMin})" style="font-size:0.88em;padding:5px 14px;border:2px solid #4a90e2;border-radius:20px;background:#4a90e2;color:#fff;cursor:pointer;font-weight:700;">📊 KI: ${kiZeitStr}</button>`
    : '';

  // Richtzeit-Chip (unveränderter Basiswert)
  let richtzeitChip = '';
  const rzBase = state.richtzeitBasis;
  if (rzBase > 0 && rzBase !== totalMin) {
    const rzStd = Math.floor(rzBase / 60);
    const rzRest = rzBase % 60;
    const rzStr = rzStd > 0 ? `${rzStd} h${rzRest > 0 ? ` ${rzRest} min` : ''}` : `${rzRest} min`;
    richtzeitChip = `<button type="button" onclick="app.setZeitkorrektur('${czId}','${autoId}','${deltaId}',${rzBase})" style="font-size:0.88em;padding:5px 14px;border:2px solid #b0c8e8;border-radius:20px;background:#f0f7ff;color:#2c6fad;cursor:pointer;">✓ Richtzeit: ${rzStr}</button>`;
  }

  detailsEl.innerHTML = perWorkHtml + (state.pufferHtml || '') +
    `<div style="display:flex;gap:8px;flex-wrap:wrap;">${kiChip}${richtzeitChip}</div>`;

  // Stepper + Header aktualisieren
  const autoInput = document.getElementById(autoId);
  if (autoInput) autoInput.value = String(totalMin);
  const manualInput = document.getElementById(czId);
  if (manualInput && totalMin > 0) manualInput.value = String(Math.round(totalMin / 15) * 0.25);
  this.updateZeitKorrekturDelta(czId, autoId, deltaId);
};

  AppClass.prototype.editArbeitZeit = function(spanEl, idx, ctx) {
  const state = ctx === 'neu' ? this._zeitState : this._editZeitState;
  if (!state) return;
  const item = state.items[idx];
  const currentH = (item.noTime && item.minuten === 0) ? 0.5 : Math.round(item.minuten / 15) * 0.25;
  const labelPart = (item.noTime && item.minuten === 0) ? `⚠️ ${item.arbeit}: ` : item.labelHtml;
  spanEl.innerHTML = `${labelPart}<input type="number" value="${currentH}" step="0.25" min="0.25" style="width:48px;border:1px solid #4a90e2;border-radius:4px;padding:1px 4px;font-size:1em;font-weight:600;color:#333;" onblur="app._saveArbeitZeit(this,${idx},'${ctx}')" onkeydown="if(event.key==='Enter'){this.blur();}if(event.key==='Escape'){app._renderZeitItems('${ctx}');}"> h`;
  const input = spanEl.querySelector('input');
  if (input) { input.focus(); input.select(); }
};

  AppClass.prototype._saveArbeitZeit = function(inputEl, idx, ctx) {
  const state = ctx === 'neu' ? this._zeitState : this._editZeitState;
  if (!state) return;
  const valH = parseFloat(inputEl.value);
  if (Number.isFinite(valH) && valH > 0) {
    state.items[idx].minuten = Math.round(valH * 60);
    state.items[idx].manualOverride = true;
    delete state.items[idx].noTime;
  }
  this._renderZeitItems(ctx);
};

  AppClass.prototype.updateGesamtzeit = function() {
  // Diese Funktion wird nicht mehr benötigt
};

  AppClass.prototype.updateArbeitszeit = async function(id) {
  const minuten = document.getElementById(`zeit_${id}`).value;
  const bezeichnung = document.getElementById(`bezeichnung_${id}`).value.trim();

  if (!bezeichnung) {
    alert('Bitte eine Bezeichnung eingeben.');
    return;
  }

  try {
    await ArbeitszeitenService.update(id, {
      bezeichnung: bezeichnung,
      standard_minuten: parseInt(minuten)
    });
    alert('Arbeitszeit aktualisiert!');
    this.loadArbeitszeiten();
  } catch (error) {
    console.error('Fehler beim Update:', error);
    alert('Fehler beim Aktualisieren');
  }
};

  AppClass.prototype.saveAllArbeitszeiten = async function() {
  const tbody = document.getElementById('arbeitszeitenTable').getElementsByTagName('tbody')[0];
  const rows = tbody.getElementsByTagName('tr');

  let hasError = false;
  const updates = [];

  // Sammle alle Updates
  for (let row of rows) {
    const inputs = row.querySelectorAll('input[type="text"]');
    const bezeichnungInput = inputs[0]; // Erste Texteingabe = Bezeichnung
    const aliaseInput = inputs[1]; // Zweite Texteingabe = Aliase
    const zeitInput = row.querySelector('input[type="number"]');

    if (bezeichnungInput && zeitInput) {
      const id = bezeichnungInput.dataset.id;
      const bezeichnung = bezeichnungInput.value.trim();
      const aliase = aliaseInput ? aliaseInput.value.trim() : '';
      const stunden = parseFloat(zeitInput.value);

      if (!bezeichnung) {
        alert('Bitte alle Bezeichnungen ausfüllen.');
        hasError = true;
        break;
      }

      if (!Number.isFinite(stunden) || stunden <= 0) {
        alert(`Bitte gültige Stunden für "${bezeichnung}" eingeben (z.B. 0.25 für 15 Minuten).`);
        hasError = true;
        break;
      }

      // Konvertiere Stunden in Minuten
      const minuten = Math.round(stunden * 60);

      updates.push({
        id: id,
        bezeichnung: bezeichnung,
        aliase: aliase,
        standard_minuten: minuten
      });
    }
  }

  if (hasError || updates.length === 0) {
    return;
  }

  try {
    // Speichere alle Updates
    for (let update of updates) {
      await ArbeitszeitenService.update(update.id, {
        bezeichnung: update.bezeichnung,
        aliase: update.aliase,
        standard_minuten: update.standard_minuten
      });
    }

    alert('Alle Arbeitszeiten erfolgreich gespeichert!');
    this.loadArbeitszeiten();
  } catch (error) {
    console.error('Fehler beim Speichern:', error);
    alert('Fehler beim Speichern der Arbeitszeiten');
  }
};

  AppClass.prototype.addArbeitszeit = function() {
  const tbody = document.getElementById('arbeitszeitenTable').getElementsByTagName('tbody')[0];
  if (!tbody) {
    return;
  }

  // Prüfe, ob bereits eine Eingabezeile existiert
  const existingNewRow = tbody.querySelector('tr.new-arbeitszeit-row');
  if (existingNewRow) {
    alert('Bitte speichern Sie zuerst die bereits hinzugefügte Zeile oder brechen Sie ab.');
    return;
  }

  // Erstelle neue Zeile für Eingabe
  const row = tbody.insertRow(0);
  row.className = 'new-arbeitszeit-row';
  row.style.backgroundColor = '#f0f7ff';
  row.innerHTML = `
    <td>
      <input type="text"
             id="new_bezeichnung"
             placeholder="z.B. Ölwechsel"
             style="width: 100%; min-width: 150px; padding: 8px;"
             required>
    </td>
    <td>
      <input type="number"
             id="new_zeit"
             placeholder="z.B. 0.5"
             min="0.01"
             step="0.25"
             value="0.5"
             title="Eingabe in Stunden (z.B. 0.25 = 15 Min, 0.5 = 30 Min, 1 = 60 Min)"
             style="width: 120px; padding: 8px;"
             required>
    </td>
    <td>
      <button class="btn btn-success save-new-arbeitszeit-btn" style="padding: 6px 12px; font-size: 14px; margin-right: 5px;">💾 Speichern</button>
      <button class="btn btn-secondary cancel-new-arbeitszeit-btn" style="padding: 6px 12px; font-size: 14px;">❌ Abbrechen</button>
    </td>
  `;

  // Event-Listener für Speichern-Button
  const saveBtn = row.querySelector('.save-new-arbeitszeit-btn');
  saveBtn.addEventListener('click', () => {
    this.saveNewArbeitszeit();
  });

  // Event-Listener für Abbrechen-Button
  const cancelBtn = row.querySelector('.cancel-new-arbeitszeit-btn');
  cancelBtn.addEventListener('click', () => {
    this.cancelNewArbeitszeit();
  });

  // Fokus auf Bezeichnungsfeld setzen
  const bezeichnungInput = document.getElementById('new_bezeichnung');
  if (bezeichnungInput) {
    bezeichnungInput.focus();
  }
};

  AppClass.prototype.saveNewArbeitszeit = async function() {
  const bezeichnungInput = document.getElementById('new_bezeichnung');
  const zeitInput = document.getElementById('new_zeit');

  if (!bezeichnungInput || !zeitInput) {
    alert('Eingabefelder nicht gefunden');
    return;
  }

  const bezeichnung = bezeichnungInput.value.trim();
  const stunden = parseFloat(zeitInput.value);

  if (!bezeichnung) {
    alert('Bitte geben Sie eine Bezeichnung ein.');
    bezeichnungInput.focus();
    return;
  }

  if (!Number.isFinite(stunden) || stunden <= 0) {
    alert('Bitte eine gültige Zeit in Stunden eingeben (z.B. 0.5 für 30 Minuten).');
    zeitInput.focus();
    return;
  }

  const minuten = Math.round(stunden * 60);

  try {
    await ArbeitszeitenService.create({
      bezeichnung: bezeichnung,
      standard_minuten: minuten
    });
    
    alert('Standardzeit erfolgreich hinzugefügt!');
    await this.loadArbeitszeiten();
  } catch (error) {
    console.error('Fehler beim Hinzufügen:', error);
    alert('Fehler beim Hinzufügen der Standardzeit: ' + (error.message || 'Unbekannter Fehler'));
  }
};

  AppClass.prototype.cancelNewArbeitszeit = function() {
  const tbody = document.getElementById('arbeitszeitenTable').getElementsByTagName('tbody')[0];
  if (!tbody) return;

  const newRow = tbody.querySelector('tr.new-arbeitszeit-row');
  if (newRow) {
    newRow.remove();
  }
};

  AppClass.prototype.deleteArbeitszeit = async function(id) {
  if (!id || !Number.isFinite(id)) {
    alert('Fehler: Ungültige ID');
    return;
  }

  this.performDeleteArbeitszeit(id);
};

  AppClass.prototype.performDeleteArbeitszeit = async function(id) {
  try {
    const result = await ArbeitszeitenService.delete(id);
    
    if (result && result.changes === 0) {
      alert('Die Standardzeit wurde nicht gefunden oder konnte nicht gelöscht werden.');
      await this.loadArbeitszeiten();
      return;
    }
    
    alert('Standardzeit erfolgreich gelöscht!');
    await this.loadArbeitszeiten();
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    
    let errorMessage = error.message || 'Unbekannter Fehler';
    if (error.status === 404) {
      errorMessage = 'Die Standardzeit wurde nicht gefunden.';
    } else if (error.status === 500) {
      errorMessage = 'Server-Fehler beim Löschen. Bitte versuchen Sie es erneut.';
    }
    
    alert('Fehler beim Löschen der Standardzeit: ' + errorMessage);
  }
};
}
